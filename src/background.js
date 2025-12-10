import Groq from "groq-sdk";
import OpenAI from "openai";
import { OPEN_AI, GROQ_CLOUD, CLIENT_MODELS, PROMPT_TEMPLATE } from "./constants";

const definePrompt = (text) => `${PROMPT_TEMPLATE}${text}`;
let remainingTokens = -1;
let lastResetTime = Date.now();
let lock = false;

const resetTokenCount = (tokenLimitPerMinute) => {
	const now = Date.now();
	if (remainingTokens === -1) {
		remainingTokens = tokenLimitPerMinute;
		lastResetTime = now;
	}
	console.log("Reset token count: ", remainingTokens, tokenLimitPerMinute);
	if (now - lastResetTime >= 60000) { // 1 minute
		remainingTokens = tokenLimitPerMinute;
		lastResetTime = now;
	}
};

const canSendRequest = (tokensRequired, tokenLimitPerMinute) => {
	resetTokenCount(tokenLimitPerMinute);
	return tokensRequired <= remainingTokens;
};

const getClient = (clientName, apiKey) => {
	if (!apiKey || apiKey === "default") {
		throw new Error("API Key not defined. Client not initialized.");
	}
	if (clientName === OPEN_AI) {
		return new OpenAI({ apiKey: apiKey });
	}
	if (clientName === GROQ_CLOUD) {
		return new Groq({ apiKey: apiKey, dangerouslyAllowBrowser: true });
	}
	throw new Error("Unknown client name: " + clientName);
};

const getTokenLimit = (modelName, clientName) => {
	const models = CLIENT_MODELS[clientName];
	const model = models.find(m => m.value === modelName);
	if (!model) {
		throw new Error("Unknown model name: " + modelName);
	}
	return model.tokenLimitPerMinute;
};

const fetchTranslation = async (text, modelName, clientName, apiKey) => {
	const prompt = definePrompt(text);
	const tokensRequired = prompt.split(/\s+/).length; // estimate tokens required for the prompt
	const tokenLimitPerMinute = getTokenLimit(modelName, clientName);
	while (true) {
		// Wait for lock on token count to be released
		while (lock) {
			await new Promise(resolve => setTimeout(resolve, 30)); // Wait for 30ms before retrying
		}
		lock = true;

		if (canSendRequest(tokensRequired, tokenLimitPerMinute)) {
			remainingTokens -= tokensRequired; // Update number of used tokens
			lock = false; // Release lock
			break;
		}

		lock = false; // Release lock
		console.log("Token limit reached. Waiting for reset...");
		await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 60 seconds before checking again
	}

	try {
		let client = getClient(clientName, apiKey);
		const result = await sendRequest(client, prompt, modelName);
		return result;
	} catch (error) {
		lock = false; // Release lock
		throw new Error("Error during API request: " + error);
	}
};

const sendRequest = async (client, prompt, modelName) => {
	const result = await client.chat.completions.create({
		messages: [
			{
				role: "user",
				content: prompt,
			}
		],
		model: modelName
	});
	return result.choices[0]?.message?.content || "";
};

// Event-Listener für Nachrichten von content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "fetchTranslation") {
		const inputText = request.inputText;
		const modelName = request.modelName;
		const clientName = request.clientName;
		const apiKey = request.apiKey;
		fetchTranslation(inputText, modelName, clientName, apiKey)
			.then((response) => {
				console.log("Response: ", response);
				sendResponse({ success: true, result: response });
			})
			.catch((error) => {
				console.error("Error in ReplaceText: ", error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Wichtig für asynchrone Antworten
	}
});