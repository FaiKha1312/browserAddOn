import { CLIENTS, CLIENT_MODELS } from "./constants";

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
		updateModelDropdown(clientDropdown.value);
	});

	// Event-Listener für Client-Auswahländerung
	clientDropdown.addEventListener('change', function (event) {
		const selectedClient = event.target.value;
		updateModelDropdown(selectedClient);
	});

	// Funktion zum Aktualisieren des Modell-Dropdowns basierend auf dem ausgewählten Client
	function updateModelDropdown(client) {
		if (!client) return;
		const models = CLIENT_MODELS[client];
		modelDropdown.innerHTML = '';

		models.forEach(model => {
			const option = document.createElement('option');
			option.value = model.value;
			option.textContent = model.name;
			modelDropdown.appendChild(option);
		});
	}
	chrome.storage.sync.get(['apiKey', 'selectedClient', 'selectedModel', 'debugMode', 'deactivateTranslation'], function (result) {
        if (result.apiKey) apiKeyInput.value = result.apiKey;
        if (result.selectedClient) clientDropdown.value = result.selectedClient;
        updateModelDropdown(result.selectedClient);
		if (result.selectedModel) modelDropdown.value = result.selectedModel;
		if (result.debugMode) debugModeCheckbox.checked = result.debugMode;
		if (result.deactivateTranslation) deactivateTranslationCheckBox.checked = result.deactivateTranslation;
    });

    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value;
        const selectedClient = clientDropdown.value;
        const selectedModel = modelDropdown.value;
		const debugMode = debugModeCheckbox.checked;
		const deactivateTranslation = deactivateTranslationCheckBox.checked;

        if (apiKey) {
            chrome.storage.sync.set({ apiKey, selectedClient, selectedModel, debugMode, deactivateTranslation }, () => {
                alert('Einstellungen gespeichert!');
            });
        } else {
            alert('Gib einen API Key ein.');
        }
    });
});