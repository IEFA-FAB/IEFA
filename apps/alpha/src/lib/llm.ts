import { makeChatLLM } from "@iefa/ai-provider/langchain-compat"
import type { ChatOpenAI } from "@langchain/openai"
import { env } from "../env.ts"

/**
 * `NVIDIA_BASE_URL` só vale quando o provedor É a NVIDIA.
 *
 * Passar essa base para qualquer provedor faz o cliente montar a URL da NVIDIA
 * com o modelo de outro — o Groq responde "404 page not found" e o erro chega
 * disfarçado de "modelo inexistente". Para os demais provedores, o
 * `langchain-compat` já conhece a base correta.
 */
const baseConfig = {
	provider: env.ALPHA_AI_PROVIDER,
	model: env.ALPHA_AI_MODEL,
	apiKey: env.ALPHA_AI_API_KEY ?? env.NVIDIA_API_KEY,
	...(env.ALPHA_AI_PROVIDER === "nvidia" ? { baseUrl: env.NVIDIA_BASE_URL } : {}),
} as const

let _llmDeterministic: ChatOpenAI | null = null
let _llmCreative: ChatOpenAI | null = null

export function getLLM(temperature: 0 | 0.3 | 0.7 = 0): ChatOpenAI {
	if (temperature === 0) {
		_llmDeterministic ??= makeChatLLM(baseConfig, { temperature: 0 })
		return _llmDeterministic
	}
	if (temperature === 0.3) {
		_llmCreative ??= makeChatLLM(baseConfig, { temperature: 0.3 })
		return _llmCreative
	}
	_llmCreative ??= makeChatLLM(baseConfig, { temperature: 0.7 })
	return _llmCreative
}

/**
 * LLM com saída estruturada.
 *
 * Força `functionCalling` em vez de `json_schema`: o modo `json_schema` só
 * existe em parte dos modelos (no Groq, o `llama-3.3-70b` recusa e o
 * `gpt-oss-120b` falha a validação), enquanto tool calling funciona em todos os
 * provedores compatíveis com a API da OpenAI que o projeto usa. Centralizado
 * aqui para que a escolha valha para extração, juiz, grader e router de uma vez.
 */
// biome-ignore lint/suspicious/noExplicitAny: o schema é JSON Schema livre, validado no chamador
export function structuredLLM(schema: any, temperature: 0 | 0.3 | 0.7 = 0) {
	return getLLM(temperature).withStructuredOutput(schema, { method: "functionCalling" })
}
