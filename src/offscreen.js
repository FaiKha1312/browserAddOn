import { CreateMLCEngine } from "@mlc-ai/web-llm";

// Standard-Fallback, falls nichts übergeben wird
let currentModelId = "Llama-3.1-8B-Instruct-q4f32_1-MLC";
let engine = null;
let isLoading = false;

async function initModel(modelId, sendResponse) {
    // Falls ein spezifisches Modell angefragt wurde, update die ID
    if (modelId) currentModelId = modelId;

    if (engine) {
        // Falls wir das Modell wechseln wollen, müssen wir die alte Engine reloaden
        // (Für den einfachen Fall gehen wir davon aus, dass wir beim gleichen Modell bleiben
        // oder die Seite neu laden. Ein Hot-Swap ist speicherintensiv.)
        console.log("Engine bereits aktiv.");
        sendResponse?.({ status: "ready", message: "Modell ist bereits geladen." });
        return;
    }
    
    if (isLoading) return;

    isLoading = true;
    console.log(`Starte Initialisierung von ${currentModelId}...`);

    try {
        engine = await CreateMLCEngine(currentModelId, {
            initProgressCallback: (progress) => {
                console.log(`[Lade ${currentModelId}] ${progress.text} (${Math.round(progress.progress * 100)}%)`);
            }
        });
        
        console.log("Modell erfolgreich geladen!");
        isLoading = false;
        sendResponse?.({ status: "success", message: "Modell bereit." });
        
    } catch (error) {
        console.error("Fehler beim Laden:", error);
        isLoading = false;
        sendResponse?.({ status: "error", error: error.message });
    }
}

async function handleTranslation(text, modelId, sendResponse) {
    // Stelle sicher, dass das richtige Modell geladen ist
    if (!engine) {
        await initModel(modelId); 
        if (!engine) {
            sendResponse({ success: false, error: "Modell konnte nicht geladen werden." });
            return;
        }
    }

    const systemPrompt = "Du bist ein Experte für Leichte Sprache. Formuliere den folgenden Text in Leichte Sprache um. Nutze kurze Sätze, einfache Wörter und vermeide Fremdwörter. Antworte NUR mit dem übersetzten Text.";
    const userPrompt = `Text zum Übersetzen:\n"${text}"`;

    try {
        const startTime = performance.now();
        
        const reply = await engine.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 1024, // Erhöht für längere Texte
        });

        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        
        console.log(`Inferenzdauer: ${duration}ms`);

        sendResponse({ 
            success: true, 
            result: reply.choices[0].message.content, 
            metrics: { durationMs: duration, model: currentModelId } 
        });

    } catch (err) {
        console.error("Inferenz-Fehler:", err);
        sendResponse({ success: false, error: err.message });
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "initLocalModel") {
        initModel(request.modelId, sendResponse);
        return true; 
    }
    
    if (request.action === "translateLocal") {
        // Wir übergeben hier auch die ModelID, falls sie sich geändert hat
        handleTranslation(request.text, request.modelId, sendResponse);
        return true; 
    }
});