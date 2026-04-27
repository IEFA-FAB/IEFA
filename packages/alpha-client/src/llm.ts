import { ChatOpenAI } from "@langchain/openai"

export interface ChatLLMConfig {
	model: string
	apiKey: string
	baseURL?: string
	temperature?: number
	maxTokens?: number
	/** Additional headers forwarded to the HTTP client (e.g. OpenRouter attribution). */
	defaultHeaders?: Record<string, string>
}

/**
 * Factory for ChatOpenAI instances compatible with any OpenAI-compatible endpoint.
 *
 * Supported providers:
 * - NVIDIA NIM API (apps/alpha — uses NVIDIA_BASE_URL)
 * - OpenRouter (apps/sisub — uses https://openrouter.ai/api/v1)
 * - OpenAI directly
 *
 * LangSmith tracing is automatic when LANGCHAIN_TRACING_V2=true + LANGCHAIN_API_KEY are set.
 * No explicit callback setup required for basic tracing.
 */
export function makeChatLLM(config: ChatLLMConfig): ChatOpenAI {
	return new ChatOpenAI({
		model: config.model,
		configuration: {
			baseURL: config.baseURL,
			apiKey: config.apiKey,
			...(config.defaultHeaders ? { defaultHeaders: config.defaultHeaders } : {}),
		},
		temperature: config.temperature ?? 0,
		...(config.maxTokens ? { maxTokens: config.maxTokens } : {}),
	})
}
