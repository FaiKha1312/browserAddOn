import { DISCLAIMER } from "./constants";

let settings = {};

const initSettings = async () => { settings = await loadSettings(); }

window.addEventListener('DOMContentLoaded', async () => {
  await initSettings();
  console.log(JSON.stringify(settings));
  if (!settings.deactivateTranslation) translateMainContentAsync(document);
});

const logDebug = (message, ...params) => settings.debugMode && console.log(message, ...params);

const isContentRelevant = (content, element) => {
  const wordCount = content.split(/\s+/).length;
  const isInHeaderOrFooter = element.closest('header, footer, [class*="footer"], [id*="footer"], [class*="header"], [id*="header"], [class*="teaser"], [class*="menu"], [class*="nav"], [class*="cookie"]') !== null;
  const isShortText = content.length < 50;
  const isShortWordCount = wordCount < 5;
  const hasTOCClass = element.className.includes('toc') || element.id.includes('toc');
  const isReferenceOrCiteNote = element.id.includes('cite');

  return !isInHeaderOrFooter && !isShortText && !isShortWordCount && !hasTOCClass && !isReferenceOrCiteNote;
};

const translateMainContentAsync = async (document) => {
  const { apiKey, selectedClient, selectedModel } = settings;
  logDebug('Settings:', apiKey, selectedClient, selectedModel, settings.deactivateTranslation);
  let translations = loadCachedTranslations();

  // Get all paragraphs and list items in the main content
  const mainContentElements = 'main, article, section, div';
  const mainContent = document.querySelectorAll(mainContentElements);
  // Filter result to exclude elements in footer and header
  let relevantContent = Array.from(mainContent)
    .flatMap(element => Array.from(element.querySelectorAll('p, li')))
    .filter(p => isContentRelevant(p.innerText.trim(), p))
    // Filter duplicates
    .filter((value, index, self) => self.indexOf(value) === index);
  // Create an array of promises for each paragraph/list element to be translated
  const translationPromises = Array.from(relevantContent).map(async (p) => {
    let content = p.innerText.trim();
    const originalHTML = p.innerHTML;
    let result = '';
    logDebug('innerText: ', content);

    // Check if translation is already cached
    if (translations && translations[content]) {
      result = translations[content];
      logDebug('cached translation: ', result);
    } else {
      try {
        // Fetch translation from API if not in cache
        result = await getTranslation(content, selectedModel, selectedClient, apiKey);
        logDebug('translation: ', result);
        // Insert <a> tags back into the translated text
        result = restoreLinksinText(result, originalHTML);
        // Add translation to JSON object
        translations[content] = result;
      }
      catch (error) {
        console.error(error);
        return;
      }
    }
    // Replace the original text with the translated text
    if (result) {
      p.innerHTML = result;
    }
  });

  // Wait for all translations to be resolved
  await Promise.all(translationPromises);

  insertDisclaimerElement(relevantContent, document);
  
  // Cache translations and download them for evaluation
  logDebug('translations: ', JSON.stringify(translations));
  if (Object.keys(translations).length > 1) {
    cacheTranslation(translations);
    downloadTranslations(translations, selectedModel);
  }
};

const restoreLinksinText = (translation, originalHTML) => {
  // insert <a> tags back into the translated text
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = originalHTML;
  const links = tempDiv.querySelectorAll('a');

  links.forEach(link => {
    const linkText = link.innerText;
    const linkHref = link.href;
    translation = translation.replace(linkText, `<a href="${linkHref}">${linkText}</a>`);
  });
  return translation;
}

// request translation from api for the given content
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
          reject(new Error(
            "Translation failed. Make sure you have entered a valid API key and selected a client and model in the extension settings. You might have reached the API rate limit. Please try again later."
          ));
        }
      });
  });
}

const cacheTranslation = (translations) => {
  localStorage.setItem("easy_language_translations", JSON.stringify(translations));
}

const loadCachedTranslations = () => {
  let translations = localStorage.getItem('easy_language_translations');
  if (translations) {
    logDebug('parsing translations: ', translations);
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
    // create blob from translations
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    // create object url from blob
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    // filename including timestamp in date time format and model name
    element.download = `translations_${modelName}_${new Date(Date.now()).toLocaleString()}.json`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}

const insertDisclaimerElement = (relevantContent, document) => {
  if (relevantContent.length > 0) {
    const lastParagraph = relevantContent[relevantContent.length - 1];
    const disclaimer = document.createElement('p');
    disclaimer.innerHTML = DISCLAIMER;
    disclaimer.className = 'easy-language-disclaimer';
    disclaimer.style.cssText = window.getComputedStyle(lastParagraph).cssText;
    lastParagraph.insertAdjacentElement('beforeend', disclaimer);
  }
}