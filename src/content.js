import { DISCLAIMER } from "./constants";

let settings = {};

const initSettings = async () => { settings = await loadSettings(); }

window.addEventListener('DOMContentLoaded', async () => {
  await initSettings();
  console.log(JSON.stringify(settings));
  // adaptive Funktion aufrufen
  if (!settings.deactivateTranslation) setTimeout(() => translateMainContentAdaptive(document), 500);
});

const logDebug = (message, ...params) => settings.debugMode && console.log(message, ...params);

const isContentRelevant = (content, element) => {
  const wordCount = content.split(/\s+/).length;
  const isInHeaderOrFooter = element.closest('header, footer, [class*="footer"], [id*="footer"], [class*="header"], [id*="header"], [class*="teaser"], [class*="menu"], [class*="nav"], [class*="cookie"], [class*="sidebar"]') !== null;
  const isShortText = content.length < 50;
  const isShortWordCount = wordCount < 5;
  const hasTOCClass = element.className.includes('toc') || element.id.includes('toc');
  const isReferenceOrCiteNote = element.id.includes('cite');

  return !isInHeaderOrFooter && !isShortText && !isShortWordCount && !hasTOCClass && !isReferenceOrCiteNote;
};

//Adaptive Strategie (Entscheidet selbstständig zwischen Sequenziell und Parallel)
const translateMainContentAdaptive = async (document) => {
  const { apiKey, selectedClient, selectedModel } = settings;
  
  // Prüfen, ob wir lokal arbeiten (WebLLM)
  const isLocalClient = selectedClient === 'local_webllm';
  
  logDebug(`Modus: ${selectedClient}. Strategie: ${isLocalClient ? 'Sequenziell (GPU-Schonung)' : 'Parallel (Cloud-Performance)'}`);

  let translations = loadCachedTranslations();
  
  // Selektoren
  const mainContentElements = 'main, article, section, div';
  const mainContent = document.querySelectorAll(mainContentElements);
  
  // Filtern
  let relevantContent = Array.from(mainContent)
    .flatMap(element => Array.from(element.querySelectorAll('p, li')))
    .filter(p => isContentRelevant(p.innerText.trim(), p))
    .filter((value, index, self) => self.indexOf(value) === index);

  logDebug(`Gefunden: ${relevantContent.length} Elemente zum Übersetzen.`);

  let newTranslationsCount = 0;

  if (isLocalClient) {
    // Lokal: await, in der Schelife warten damit GPU nicht überlastet wird
    for (const [index, p] of relevantContent.entries()) {
      const success = await processElement(p, index, relevantContent.length, translations, selectedModel, selectedClient, apiKey);
      if (success) newTranslationsCount++;
    }
  } else {
    // CLOUD: alles kann parallel bearbeitet werden (Promise.all)
    const promises = relevantContent.map((p, index) => 
       processElement(p, index, relevantContent.length, translations, selectedModel, selectedClient, apiKey)
    );
    const results = await Promise.all(promises);
    newTranslationsCount = results.filter(r => r === true).length;
  }

  insertDisclaimerElement(relevantContent, document);
  
  if (newTranslationsCount > 0) {
    cacheTranslation(translations);
    if (settings.debugMode) {
        downloadTranslations(translations, selectedModel);
    }
  } else {
    logDebug("Keine neuen Übersetzungen zum Speichern.");
  }
};

const processElement = async (p, index, total, translations, selectedModel, selectedClient, apiKey) => {
    let content = p.innerText.trim();
    const originalHTML = p.innerHTML;
    let result = '';

    // Cache Check
    if (translations && translations[content]) {
        p.innerHTML = translations[content];
        logDebug(`Cached: Element ${index + 1}`);
        return false; // Kein neuer API Call
    }

    try {
        // Visuelles Feedback 
        p.style.transition = "opacity 0.5s";
        p.style.opacity = "0.5";
        p.setAttribute("title", "Wird übersetzt...");

        logDebug(`Starte API Call für Element ${index + 1}/${total}`);

        // API Aufruf
        result = await getTranslation(content, selectedModel, selectedClient, apiKey);
        
        // Links wiederherstellen
        result = restoreLinksinText(result, originalHTML);
        
        // In Cache schreiben 
        translations[content] = result;

        if (result) {
            p.innerHTML = result;
            p.style.opacity = "1";
            p.style.backgroundColor = "#ffffcc"; 
            setTimeout(() => { p.style.backgroundColor = "transparent"; }, 2000);
            return true; 
        }
    } catch (error) {
        console.error(`Fehler bei Element ${index + 1}:`, error);
        p.style.opacity = "1";
    }
    return false;
};


const restoreLinksinText = (translation, originalHTML) => {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = originalHTML;
    const links = tempDiv.querySelectorAll('a');

    links.forEach(link => {
      const linkText = link.innerText.trim();
      const linkHref = link.href;
      if (linkText.length > 0) {
          translation = translation.replace(linkText, `<a href="${linkHref}">${linkText}</a>`);
      }
    });
  } catch (e) {
    console.warn("Fehler beim Link-Restore", e);
  }
  return translation;
}

const getTranslation = async (content, selectedModel, selectedClient, apiKey) => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: "fetchTranslation", inputText: content, modelName: selectedModel, clientName: selectedClient, apiKey: apiKey },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Message send error: " + chrome.runtime.lastError.message));
        } else if (response && response.success && response.result) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || "Unknown translation error"));
        }
      });
  });
}

const cacheTranslation = (translations) => {
  try {
      localStorage.setItem("easy_language_translations", JSON.stringify(translations));
  } catch (e) {
      console.warn("Quota exceeded for localStorage?", e);
  }
}

const loadCachedTranslations = () => {
  let translations = localStorage.getItem('easy_language_translations');
  if (translations) {
    return JSON.parse(translations);
  }
  return {};
}

const loadSettings = () =>
  new Promise((resolve, reject) =>
    chrome.storage.sync.get(['apiKey', 'selectedClient', 'selectedModel', 'debugMode', 'deactivateTranslation'], result =>
      chrome.runtime.lastError
        ? reject(Error(chrome.runtime.lastError.message))
        : resolve(result)
    )
  );

const downloadTranslations = (translations, modelName) => {
  if (settings.debugMode) {
    const content = { website: window.location.href, model: modelName, translations: translations };
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = `translations_${modelName}_${new Date(Date.now()).toLocaleString().replace(/[:.]/g, '-')}.json`; 
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}

const insertDisclaimerElement = (relevantContent, document) => {
  if (relevantContent.length > 0) {
    const lastParagraph = relevantContent[relevantContent.length - 1];
    if (lastParagraph && lastParagraph.parentNode) {
        const disclaimer = document.createElement('p');
        disclaimer.innerHTML = DISCLAIMER;
        disclaimer.className = 'easy-language-disclaimer';
        try {
            disclaimer.style.cssText = window.getComputedStyle(lastParagraph).cssText;
        } catch(e) {}
        
        disclaimer.style.borderTop = "1px solid #ccc";
        disclaimer.style.marginTop = "20px";
        disclaimer.style.fontStyle = "italic";
        
        lastParagraph.insertAdjacentElement('beforeend', disclaimer);
    }
  }
}