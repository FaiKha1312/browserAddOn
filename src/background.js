import OpenAI from "openai";
import {
  OPEN_AI,
  CLIENT_MODELS,
  PROMPT_TEMPLATE_CLOUD,
  GROQ,
  LOCAL_LLM,
} from "./constants";

// sorgt dafür, dass WebGPU im Hintergrund weiterlaufen kann,
// auch wenn das Popup geschlossen ist.
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const path = "offscreen.html";
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(path)],
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: path,
      reasons: ["WORKERS"],
      justification: "Running WebLLM for local inference",
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
  if (!models) return 30000;
  const model = models.find((m) => m.value === modelName);
  return model ? model.tokenLimitPerMinute : 30000;
};

/* ---------------------- Prompt / User Content ---------------------- */
/**
 * Adaptive Prompting (Routing) gegen Halluzination bei sehr kurzen Texten.
 * - kurze Überschriften/Labels sollen NICHT aufgebläht werden.
 */
const buildUserContent = (rawText) => {
  const text = String(rawText ?? "").trim();
  const wc = text.split(/\s+/).filter(Boolean).length;

  const isShort = wc < 6 || text.length < 40;

  if (!isShort) return text;

  // Extra Hinweis NUR für Short-Texts (Labels, Überschriften, Buttons)
  return `KURZER TEXT (Label/Überschrift).
Übersetze sehr kurz in 1 Zeile.
Keine Zusatzsätze. Keine Erklärungen. Nichts erfinden.
Text: "${text}"`;
};

/* ------------------------- Translation Fetch ----------------------- */

const fetchTranslation = async (text, modelName, clientName, apiKey) => {
  // Lokale WebLLM
  if (clientName === LOCAL_LLM) {
    console.log("Starte lokale Übersetzung mit:", modelName);
    await ensureOffscreenDocument();

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          action: "translateLocal",
          text: text, // Offscreen nutzt sein eigenes PROMPT_TEMPLATE_LOCAL
          modelId: modelName,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                "Verbindung zum lokalen Modell fehlgeschlagen: " +
                  chrome.runtime.lastError.message
              )
            );
          } else if (response && response.success) {
            resolve(response.result);
          } else {
            reject(
              new Error(response?.error || "Unbekannter Fehler bei lokaler Ausführung")
            );
          }
        }
      );
    });
  }

  // Cloud KI: OpenAI / Groq (OpenAI-kompatibel)
  if (clientName === OPEN_AI || clientName === GROQ) {
    if (!apiKey || apiKey === "default") {
      throw new Error(`Bitte gib einen API Key für ${clientName} ein.`);
    }

    const userContent = buildUserContent(text);

    // Token-Berechnung für Limiter (grob):
    const combinedTextForCounting = PROMPT_TEMPLATE_CLOUD + " " + userContent;
    const tokensRequired = combinedTextForCounting.split(/\s+/).length + 100;

    const tokenLimitPerMinute = getTokenLimit(modelName, clientName);

    if (tokenLimitPerMinute !== Infinity) {
      while (true) {
        while (lock) await new Promise((resolve) => setTimeout(resolve, 50));
        lock = true;

        if (canSendRequest(tokensRequired, tokenLimitPerMinute)) {
          remainingTokens -= tokensRequired;
          lock = false;
          break;
        }

        lock = false;
        console.log("Token-Limit erreicht. Warte...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    try {
      const baseURL =
        clientName === GROQ ? "https://api.groq.com/openai/v1" : undefined;

      const client = new OpenAI({
        apiKey,
        baseURL,
        dangerouslyAllowBrowser: true,
      });

      console.log(`Sende Anfrage an ${clientName} (Modell: ${modelName})...`);

      const result = await client.chat.completions.create({
        model: modelName,
        temperature: 0.3,
        max_completion_tokens: 1000,
        messages: [
          { role: "system", content: PROMPT_TEMPLATE_CLOUD },
          { role: "user", content: userContent },
        ],
      });

      return result.choices[0]?.message?.content || "";
        } catch (error) {
      console.error(`${clientName} API Fehler:`, error);

      if (error?.status === 429) {
        throw new Error("Guthaben aufgebraucht oder Rate Limit erreicht (Error 429).");
      }
      throw new Error("API Anfrage fehlgeschlagen: " + (error?.message || String(error)));
    }
  }

  throw new Error("Dieser Client wird nicht unterstützt: " + clientName);
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchTranslation") {
    const { inputText, modelName, clientName, apiKey } = request;

    fetchTranslation(inputText, modelName, clientName, apiKey)
      .then((response) => sendResponse({ success: true, result: response }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }
});
