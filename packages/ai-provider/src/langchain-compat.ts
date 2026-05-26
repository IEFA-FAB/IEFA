import { ChatOpenAI } from "@langchain/openai"
import type { AdapterConfig } from "./types.js"

const PROVIDER_BASE_URLS: Partial<Record<AdapterConfig["provider"], string>> = {
	nvidia: "https://integrate.api.nvidia.com/v1",
	openrouter: "https://openrouter.ai/api/v1",
}

export interface ChatLLMOptions {
	temperature?: number
	maxTokens?: number
}

export function makeChatLLM(config: AdapterConfig, options?: ChatLLMOptions): ChatOpenAI {
	const baseURL = config.baseUrl ?? PROVIDER_BASE_URLS[config.provider]
	return new ChatOpenAI({
		model: config.model,
		configuration: {
			apiKey: config.apiKey,
			...(baseURL ? { baseURL } : {}),
			...(config.defaultHeaders ? { defaultHeaders: config.defaultHeaders } : {}),
		},
		temperature: options?.temperature ?? 0,
		...(options?.maxTokens ? { maxTokens: options.maxTokens } : {}),
	})
}
