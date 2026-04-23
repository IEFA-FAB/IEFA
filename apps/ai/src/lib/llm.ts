import { makeChatLLM } from "@iefa/ai-client/llm"
import type { ChatOpenAI } from "@langchain/openai"
import { env } from "../env.ts"

const baseConfig = {
	model: env.LLM_MODEL,
	apiKey: env.NVIDIA_API_KEY,
	baseURL: env.NVIDIA_BASE_URL,
} as const

let _llmDeterministic: ChatOpenAI | null = null
let _llmCreative: ChatOpenAI | null = null

export function getLLM(temperature: 0 | 0.3 | 0.7 = 0): ChatOpenAI {
	if (temperature === 0) {
		_llmDeterministic ??= makeChatLLM({ ...baseConfig, temperature: 0 })
		return _llmDeterministic
	}
	if (temperature === 0.3) {
		_llmCreative ??= makeChatLLM({ ...baseConfig, temperature: 0.3 })
		return _llmCreative
	}
	_llmCreative ??= makeChatLLM({ ...baseConfig, temperature: 0.7 })
	return _llmCreative
}
