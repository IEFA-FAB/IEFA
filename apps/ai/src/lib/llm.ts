import { ChatOpenAI } from "@langchain/openai"
import { ENV } from "varlock/env"

function makeLLM(temperature: number) {
	return new ChatOpenAI({
		model: ENV.LLM_MODEL,
		configuration: {
			baseURL: ENV.NVIDIA_BASE_URL,
			apiKey: ENV.NVIDIA_API_KEY,
		},
		temperature,
	})
}

let _llmDeterministic: ChatOpenAI | null = null
let _llmCreative: ChatOpenAI | null = null

export function getLLM(temperature: 0 | 0.3 | 0.7 = 0): ChatOpenAI {
	if (temperature === 0) {
		_llmDeterministic ??= makeLLM(0)
		return _llmDeterministic
	}
	if (temperature === 0.3) {
		_llmCreative ??= makeLLM(0.3)
		return _llmCreative
	}
	_llmCreative ??= makeLLM(0.7)
	return _llmCreative
}
