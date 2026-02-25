import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { PROMPT_TEMPLATE_LOCAL } from "./constants.js";

// Standard-Fallback, falls nichts übergeben wird
let currentModelId = "Llama-3.1-8B-Instruct-q4f32_1-MLC";
let engine = null;
let isLoading = false;

/* ---------------------- Helpers ---------------------- */

const buildUserContent = (rawText) => {
  const text = String(rawText ?? "").trim();
  const wc = text.split(/\s+/).filter(Boolean).length;

  const isShort = wc < 6 || text.length < 40;

  if (!isShort) return text;

  return `KURZER TEXT (Label/Überschrift).
Übersetze sehr kurz in 1 Zeile.
Keine Zusatzsätze. Keine Erklärungen. Nichts erfinden.
Text: "${text}"`;
};

async function initModel(modelId, sendResponse) {
  // Falls ein spezifisches Modell angefragt wurde, update die ID
  if (modelId) {
    // Wenn Modell-ID sich ändert und Engine schon existiert:
    // Engine resetten, sonst bleibt altes Modell aktiv.
    if (engine && modelId !== currentModelId) {
      console.log(`Modellwechsel erkannt: ${currentModelId} -> ${modelId}. Reset Engine.`);
      engine = null;
    }
    currentModelId = modelId;
  }

  if (engine) {
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
        console.log(
          `[Lade ${currentModelId}] ${progress.text} (${Math.round(progress.progress * 100)}%)`
        );
      },
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

  const userPrompt = buildUserContent(text);

  try {
    const startTime = performance.now();


    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: PROMPT_TEMPLATE_LOCAL },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 512,
    });

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    console.log(`Inferenzdauer: ${duration}ms`);

    sendResponse({
      success: true,
      result: reply.choices[0].message.content,
      metrics: { durationMs: duration, model: currentModelId },
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
    handleTranslation(request.text, request.modelId, sendResponse);
    return true;
  }
});
