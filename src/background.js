import OpenAI from "openai";
import { OPEN_AI, CLIENT_MODELS, PROMPT_TEMPLATE, GROQ } from "./constants";

//sorgt dafür, dass WebGPU im Hintergrund weiterlaufen kann,
// auch wenn das Popup geschlossen ist.
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
    const path = 'offscreen.html';
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(path)]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Falls gerade eins erstellt wird, warten
    if (creatingOffscreen) {
        await creatingOffscreen;
    } else {
        // Neues Offscreen-Dokument erstellen
        creatingOffscreen = chrome.offscreen.createDocument({
            url: path,
            reasons: ['WORKERS'],
            justification: 'Running WebLLM for local inference',
        });
        await creatingOffscreen;
        creatingOffscreen = null;
    }
}

// Rate-Limiting
let remainingTokens = -1;
let lastResetTime = Date.now();
let lock = false;

const resetTokenCount = (tokenLimitPerMinute) => {
    const now = Date.now();
    // Reset alle 60 Sekunden
    if (remainingTokens === -1 || now - lastResetTime >= 60000) {
        remainingTokens = tokenLimitPerMinute;
        lastResetTime = now;
        console.log("Token-Bucket zurückgesetzt auf:", remainingTokens);
    }
};

const canSendRequest = (tokensRequired, tokenLimitPerMinute) => {
    resetTokenCount(tokenLimitPerMinute);
    return tokensRequired <= remainingTokens;
};

const getTokenLimit = (modelName, clientName) => {
    const models = CLIENT_MODELS[clientName];
    if (!models) return 30000; // Fallback
    const model = models.find(m => m.value === modelName);
    return model ? model.tokenLimitPerMinute : 30000;
};

const fetchTranslation = async (text, modelName, clientName, apiKey) => {
    
    //Lokale WebLLM
    if (clientName === "local_webllm") {
        console.log("Starte lokale Übersetzung mit:", modelName);
        await ensureOffscreenDocument();
        
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: "translateLocal",
                text: text,
                modelId: modelName
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error("Verbindung zum lokalen Modell fehlgeschlagen: " + chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.result);
                } else {
                    reject(new Error(response?.error || "Unbekannter Fehler bei lokaler Ausführung"));
                }
            });
        });
    }

    // Cloud KI: Open AI / Groq Llama (Cloud)
    if (clientName === OPEN_AI || clientName === GROQ) {
        
        if (!apiKey || apiKey === "default") {
            throw new Error(`Bitte gib einen API Key für ${clientName} ein.`);
        }

        // Prompt zusammenbauen
        const prompt = `${PROMPT_TEMPLATE}\n\n"${text}"`;
        
        const tokensRequired = prompt.split(/\s+/).length + 100; 
        const tokenLimitPerMinute = getTokenLimit(modelName, clientName);

        if (tokenLimitPerMinute !== Infinity) {
             while (true) {
                while (lock) await new Promise(resolve => setTimeout(resolve, 50));
                lock = true;

                if (canSendRequest(tokensRequired, tokenLimitPerMinute)) {
                    remainingTokens -= tokensRequired;
                    lock = false;
                    break; 
                }
                lock = false;
                console.log("Token-Limit erreicht. Warte...");
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        try {
            // Wenn GROQ ausgewähllt, URL ändern ansonsten int Open AI default
            const baseURL = (clientName === GROQ) 
                ? "https://api.groq.com/openai/v1" 
                : undefined; 

            const client = new OpenAI({ 
                apiKey: apiKey,
                baseURL: baseURL,
                dangerouslyAllowBrowser: true //Für Service Worker
            });

            console.log(`Sende Anfrage an ${clientName} (Modell: ${modelName})...`);

            const result = await client.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: modelName,
                temperature: 0.3 
            });

            return result.choices[0]?.message?.content || "";

        } catch (error) {
            console.error(`${clientName} API Fehler:`, error);
            // Fehler 429 (Quota) speziell abfangen für bessere Fehlermeldung
            if (error.status === 429) {
                throw new Error("Guthaben aufgebraucht oder Rate Limit erreicht (Error 429).");
            }
            throw new Error("API Anfrage fehlgeschlagen: " + error.message);
        }
    }

    throw new Error("Dieser Client wird nicht unterstützt: " + clientName);
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Content Script fragt nach Übersetzung
    if (request.action === "fetchTranslation") {
        const { inputText, modelName, clientName, apiKey } = request;
        
        fetchTranslation(inputText, modelName, clientName, apiKey)
            .then((response) => {
                sendResponse({ success: true, result: response });
            })
            .catch((error) => {
                sendResponse({ success: false, error: error.message });
            });
            
        return true;
    }
});