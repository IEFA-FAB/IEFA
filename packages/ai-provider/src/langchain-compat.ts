import { ChatOpenAI } from "@langchain/openai"
import type { AdapterConfig } from "./types.js"

/**
 * Provedores com API compatível com a da OpenAI, que é o que o `ChatOpenAI`
 * do LangChain fala.
 */
const PROVIDER_BASE_URLS: Partial<Record<AdapterConfig["provider"], string>> = {
	nvidia: "https://integrate.api.nvidia.com/v1",
	openrouter: "https://openrouter.ai/api/v1",
	groq: "https://api.groq.com/openai/v1",
}

/**
 * Provedores que exigem `baseUrl` explícito — não há default razoável.
 */
const REQUIRES_EXPLICIT_BASE_URL: ReadonlyArray<AdapterConfig["provider"]> = ["ollama"]

export interface ChatLLMOptions {
	temperature?: number
	maxTokens?: number
}

export function makeChatLLM(config: AdapterConfig, options?: ChatLLMOptions): ChatOpenAI {
	const baseURL = config.baseUrl ?? PROVIDER_BASE_URLS[config.provider]

	// Sem base resolvida, o `ChatOpenAI` usaria a API da OpenAI com a chave de
	// outro provedor — o erro que volta é "Incorrect API key", que manda quem
	// depura para o lado errado. Falhar aqui diz o que de fato aconteceu.
	if (!baseURL) {
		const motivo = REQUIRES_EXPLICIT_BASE_URL.includes(config.provider)
			? `o provedor "${config.provider}" exige baseUrl explícito`
			: `o provedor "${config.provider}" não tem API compatível com a da OpenAI e não pode ser usado por este caminho (LangChain)`
		throw new Error(`makeChatLLM: ${motivo}. Compatíveis: ${Object.keys(PROVIDER_BASE_URLS).join(", ")}.`)
	}
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
