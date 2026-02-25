import { DISCLAIMER } from "./constants";
import { adjustFontSize } from "./fontAdjust.js";

let settings = {};

const initSettings = async () => {
  settings = await loadSettings();
};

window.addEventListener("DOMContentLoaded", async () => {
  await initSettings();
  console.log(JSON.stringify(settings));
  adjustFontSize();

  if (!settings.deactivateTranslation) {
    setTimeout(() => translateMainContentAdaptive(document), 500);
  }
});

const logDebug = (message, ...params) =>
  settings.debugMode && console.log(message, ...params);

const EASY_LANGUAGE_MARKER_SELECTOR =
  "[id*='leichte-sprache'], [class*='leichte-sprache'], " +
  "[id*='leichtesprache'], [class*='leichtesprache'], " +
  "[id*='easy-language'], [class*='easy-language'], " +
  "[data-language-level='easy'], [data-content-level='easy'], " +
  "[lang='de-x-easy'], [lang='de-easy']";

const EASY_PAGE_REGEX = /\b(leichte\s+sprache|easy\s+language)\b/i;

const isEasyLanguagePage = (doc) => {
  if (doc.querySelector(EASY_LANGUAGE_MARKER_SELECTOR)) return true;

  // Title oder Headings
  const title = String(doc.title || "");
  const h = doc.querySelector(
    "main h1, main h2, article h1, article h2, [role='main'] h1, [role='main'] h2"
  );
  const heading = String(h?.innerText || "");
  return EASY_PAGE_REGEX.test(title) || EASY_PAGE_REGEX.test(heading);
};

const isEasyParagraph = (rawText, el) => {
  const text = String(rawText || "").trim();
  if (!text) return false;

  if (el?.closest?.(EASY_LANGUAGE_MARKER_SELECTOR)) return true;
  if (text.includes("·")) return true; // Mediopunkt
  if (el?.innerHTML?.includes("<br")) return true; // schon Zeilenformat
  if (/(^|\n)\s*•\s+/m.test(text)) return true; // Bullet

  // Siganle um Leichte Sprache zu erkennen
  let signals = 0;
  if ((text.match(/\w+\-\w+/g) || []).length >= 2) signals++; // Brief-Wahl
  if ((text.match(/\n+/g) || []).length >= 2) signals++; // viele Zeilen
  if (/\bDann\b/.test(text) || /\?\s*\n?\s*Dann\b/i.test(text)) signals++; // Frage+Dann

  // Gegen-Signal: viele Nebensatzmarker -> eher NICHT easy
  const subs = (
    text.match(
      /\b(weil|dass|obwohl|während|bevor|nachdem|sodass|damit|wenn|falls|sofern)\b/gi
    ) || []
  ).length;
  if (subs >= 2) signals--;

  return signals >= 2;
};

/* ----------------------------- Helpers ----------------------------- */

// Absätze hier mappen um nicht alle Absätze auf einmal zu machen (wegen Tokens)
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

/* -------------------------- Content Filter ------------------------- */

const isContentRelevant = (content, element) => {
  const wordCount = content.split(/\s+/).length;

  const isInHeaderOrFooter =
    element.closest(
      "header, footer, nav, aside, [role='navigation'], [aria-label*='Navigation'], " +
        "[id*='cookie'], [class*='cookie'], [id*='consent'], [class*='consent']"
    ) !== null;

  const isShortText = content.length < 50;
  const isShortWordCount = wordCount < 5;

  const hasTOCClass =
    (element.className && element.className.includes("toc")) ||
    (element.id && element.id.includes("toc"));

  const isReferenceOrCiteNote =
    (element.id && element.id.includes("cite")) || false;

  const isInsideEasyLanguageContainer =
    element.closest(EASY_LANGUAGE_MARKER_SELECTOR) !== null;

  // typische UI-/Navigationstexte nicht übersetzen
  const uiKeywords =
    /(zur übersichtsseite|öffnen|schließen|mediathek|abonnieren|bulletin|archiv|cookie|datenschutz\-einstellungen)/i;
  const looksLikeUI = uiKeywords.test(content.trim());

  return (
    !isInHeaderOrFooter &&
    !isShortText &&
    !isShortWordCount &&
    !hasTOCClass &&
    !isReferenceOrCiteNote &&
    !isInsideEasyLanguageContainer &&
    !looksLikeUI
  );
};

const applySoftFormatting = (element) => {
  try {
    // Wenn HTML schon <br> hat -> nichts tun
    if (element.innerHTML && element.innerHTML.includes("<br")) return;

    const txt = element.innerText || "";
    if (txt.includes("\n")) {
      const safe = txt
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("<br>\n");
      element.innerHTML = safe;
    }
  } catch (e) {
    console.warn("SoftFormatting failed", e);
  }
};

/* --------------------- Adaptive Translation Logic ------------------ */

const translateMainContentAdaptive = async (document) => {
  const { apiKey, selectedClient, selectedModel } = settings;

  const isLocalClient = selectedClient === "local_webllm";

  logDebug(
    `Modus: ${selectedClient}. Strategie: ${
      isLocalClient ? "Sequenziell (GPU-Schonung)" : "Parallel (Cloud-Performance)"
    }`
  );

  let translations = loadCachedTranslations();

  const mainContentElements = "main, article, section, div";
  const mainContent = document.querySelectorAll(mainContentElements);

  let relevantContent = Array.from(mainContent)
    .flatMap((element) => Array.from(element.querySelectorAll("p, li")))
    .filter((p) => isContentRelevant(p.innerText.trim(), p))
    .filter((value, index, self) => self.indexOf(value) === index);

  // Seite komplett als "Leichte Sprache" erkennen -> keine Übersetzung
  if (isEasyLanguagePage(document)) {
    logDebug(
      "Seite wirkt wie Leichte Sprache (Marker/Title/Heading) -> keine Übersetzung, nur Soft-Format."
    );

    for (const el of relevantContent) {
      const text = (el.innerText || "").trim();
      applySoftFormatting(el);
      if (text) translations[text] = el.innerHTML;
    }

    insertDisclaimerElement(relevantContent, document);
    cacheTranslation(translations);
    if (settings.debugMode) downloadTranslations(translations, selectedModel);
    return;
  }

  logDebug(`Gefunden: ${relevantContent.length} Elemente zum Übersetzen.`);

  let newTranslationsCount = 0;

  if (isLocalClient) {
    for (const [index, p] of relevantContent.entries()) {
      const status = await processElement(
        p,
        index,
        relevantContent.length,
        translations,
        selectedModel,
        selectedClient,
        apiKey
      );
      if (status === "translated" || status === "easy_skip") newTranslationsCount++;
    }
  } else {
    const CONCURRENCY = 4;
    const results = await mapWithConcurrency(
      relevantContent,
      CONCURRENCY,
      (p, index) =>
        processElement(
          p,
          index,
          relevantContent.length,
          translations,
          selectedModel,
          selectedClient,
          apiKey
        )
    );

    newTranslationsCount = results.filter(
      (r) => r === "translated" || r === "easy_skip"
    ).length;
  }

  insertDisclaimerElement(relevantContent, document);

  if (newTranslationsCount > 0) {
    cacheTranslation(translations);
    if (settings.debugMode) downloadTranslations(translations, selectedModel);
  } else {
    logDebug("Keine neuen Übersetzungen zum Speichern.");
  }
};

// Funktion zum Protokollieren des Tokenverbrauchs
const logTokenUsage = (model, usedTokens) => {
  console.log(`Model: ${model}, Verbrauchte Tokens: ${usedTokens}`);
};

const processElement = async (
  p,
  index,
  total,
  translations,
  selectedModel,
  selectedClient,
  apiKey
) => {
  const content = p.innerText.trim();
  const originalHTML = p.innerHTML;

  // Cache Check
  if (translations && translations[content]) {
    p.innerHTML = translations[content];
    logDebug(`Cached: Element ${index + 1}`);
    return "cached";
  }

  // Absatz als "schon Leichte Sprache" erkennen -> skip
  if (isEasyParagraph(content, p)) {
    logDebug(`SKIP (already easy): Element ${index + 1}/${total}`);
    applySoftFormatting(p);
    translations[content] = p.innerHTML; // fürs Eval mitspeichern
    return "easy_skip";
  }

  let result = "";

  try {
    p.style.transition = "opacity 0.5s";
    p.style.opacity = "0.5";
    p.setAttribute("title", "Wird übersetzt...");

    logDebug(`Starte API Call für Element ${index + 1}/${total}`);

    result = await getTranslation(content, selectedModel, selectedClient, apiKey);

    result = restoreLinksinText(result, originalHTML);

    // Tokens loggen (nur wenn deine API response usage liefert)
    if (result && result.usage && result.usage.total_tokens) {
      logTokenUsage(selectedModel, result.usage.total_tokens);
    }

    translations[content] = result;

    if (result) {
      p.innerHTML = result;
      p.style.opacity = "1";
      p.style.backgroundColor = "#ffffcc";
      setTimeout(() => {
        p.style.backgroundColor = "transparent";
      }, 2000);
      return "translated";
    }
  } catch (error) {
    console.error(`Fehler bei Element ${index + 1}:`, error);
    p.style.opacity = "1";
  }

  return "error";
};

const restoreLinksinText = (translation, originalHTML) => {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = originalHTML;
    const links = tempDiv.querySelectorAll("a");

    links.forEach((link) => {
      const linkText = link.innerText.trim();
      const linkHref = link.href;
      if (linkText.length > 0) {
        translation = translation.replace(
          linkText,
          `<a href="${linkHref}">${linkText}</a>`
        );
      }
    });
  } catch (e) {
    console.warn("Fehler beim Link-Restore", e);
  }
  return translation;
};

const getTranslation = async (content, selectedModel, selectedClient, apiKey) => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "fetchTranslation",
        inputText: content,
        modelName: selectedModel,
        clientName: selectedClient,
        apiKey: apiKey,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Message send error: " + chrome.runtime.lastError.message));
        } else if (response && response.success && response.result) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || "Unknown translation error"));
        }
      }
    );
  });
};

const cacheTranslation = (translations) => {
  try {
    localStorage.setItem("easy_language_translations", JSON.stringify(translations));
  } catch (e) {
    console.warn("Quota exceeded for localStorage?", e);
  }
};

const loadCachedTranslations = () => {
  const translations = localStorage.getItem("easy_language_translations");
  return translations ? JSON.parse(translations) : {};
};

const loadSettings = () =>
  new Promise((resolve, reject) =>
    chrome.storage.sync.get(
      ["apiKey", "selectedClient", "selectedModel", "debugMode", "deactivateTranslation"],
      (result) =>
        chrome.runtime.lastError
          ? reject(Error(chrome.runtime.lastError.message))
          : resolve(result)
    )
  );

const downloadTranslations = (translations, modelName) => {
  if (settings.debugMode) {
    const content = {
      website: window.location.href,
      model: modelName,
      translations: translations,
    };
    const blob = new Blob([JSON.stringify(content, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `translations_${modelName}_${new Date(Date.now())
      .toLocaleString()
      .replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
};

const insertDisclaimerElement = (relevantContent, document) => {
  if (relevantContent.length > 0) {
    const lastParagraph = relevantContent[relevantContent.length - 1];
    if (lastParagraph && lastParagraph.parentNode) {
      const disclaimer = document.createElement("p");
      disclaimer.innerHTML = DISCLAIMER;
      disclaimer.className = "easy-language-disclaimer";
      try {
        disclaimer.style.cssText = window.getComputedStyle(lastParagraph).cssText;
      } catch (e) {}

      disclaimer.style.borderTop = "1px solid #ccc";
      disclaimer.style.marginTop = "20px";
      disclaimer.style.fontStyle = "italic";

      lastParagraph.insertAdjacentElement("beforeend", disclaimer);
    }
  }
};