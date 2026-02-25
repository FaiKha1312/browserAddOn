import { CLIENTS, CLIENT_MODELS, LOCAL_LLM } from "./constants";

document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveButton');
    const modelDropdown = document.getElementById('modelDropdown');
    const clientDropdown = document.getElementById('clientDropdown');
    const debugModeCheckbox = document.getElementById('debugMode');
    const deactivateTranslationCheckBox = document.getElementById('deactivateTranslation');

    // Dropdown für Clients füllen
    CLIENTS.forEach(client => {
        const option = document.createElement('option');
        option.value = client.value;
        option.textContent = client.name;
        clientDropdown.appendChild(option);
    });

    // Event-Listener für Client-Auswahländerung
    clientDropdown.addEventListener('change', function (event) {
        const selectedClient = event.target.value;
        updateUI(selectedClient);
    });

    // UI Updates: Modelle laden UND API-Feld verstecken/zeigen
    function updateUI(client) {
        if (!client) return;
        
        // 1. Modelle aktualisieren
        const models = CLIENT_MODELS[client] || [];
        modelDropdown.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.name;
            modelDropdown.appendChild(option);
        });

        if (client === LOCAL_LLM) {
            apiKeyInput.style.display = 'none';
            apiKeyInput.placeholder = "Für lokale KI nicht nötig";
        } else {
            apiKeyInput.style.display = 'block';
            apiKeyInput.placeholder = "API Key hier eingeben";
        }
    }

    // Einstellungen laden
    chrome.storage.sync.get(['apiKey', 'selectedClient', 'selectedModel', 'debugMode', 'deactivateTranslation'], function (result) {
        if (result.apiKey) apiKeyInput.value = result.apiKey;
        
        if (result.selectedClient) {
            clientDropdown.value = result.selectedClient;
            updateUI(result.selectedClient);
        } else {
            updateUI(clientDropdown.value);
        }

        if (result.selectedModel) modelDropdown.value = result.selectedModel;
        if (result.debugMode) debugModeCheckbox.checked = result.debugMode;
        if (result.deactivateTranslation) deactivateTranslationCheckBox.checked = result.deactivateTranslation;
    });

    // Speichern Logik
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        const selectedClient = clientDropdown.value;
        const selectedModel = modelDropdown.value;
        const debugMode = debugModeCheckbox.checked;
        const deactivateTranslation = deactivateTranslationCheckBox.checked;

        //Speichern erlauben, wenn Key da ist ODER Lokal
        if (apiKey || selectedClient === LOCAL_LLM) {
            chrome.storage.sync.set({ apiKey, selectedClient, selectedModel, debugMode, deactivateTranslation }, () => {
                // Visuelles Feedback
                const originalText = saveButton.textContent;
                saveButton.textContent = "Gespeichert!";
                setTimeout(() => saveButton.textContent = originalText, 1500);
            });
        } else {
            alert('Bitte gib einen API Key ein (für Cloud-Dienste erforderlich).');
        }
    });
});
