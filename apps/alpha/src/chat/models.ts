/**
 * Os modelos do chat, no formato que o laço do agente (`agent.ts`) consome.
 *
 * Primário = camada `chat` (`ALPHA_CHAT_AI_MODEL`, vazio = `ALPHA_AI_MODEL`); reserva =
 * `ALPHA_FALLBACK_AI_MODEL`, a mesma do resto do α. Temperatura 0.3: é redação, mas
 * ancorada em documento — o 0.7 do chat geral inventaria mais.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { env } from "../env.ts"
import { getFallbackLLM, getLLM, isBedrockModel, modelFor } from "../lib/llm.ts"
import type { ChatModel } from "./agent.ts"

function adapt(llm: BaseChatModel, id: string): ChatModel {
	return {
		id,
		supportsCachePoint: isBedrockModel(llm),
		async stream(messages, tools, signal) {
			if (!tools) return llm.stream(messages, { signal })
			if (!llm.bindTools) throw new Error(`o modelo ${id} não aceita ferramentas`)
			return llm.bindTools(tools).stream(messages, { signal })
		},
	}
}

export function chatModels(): { primary: ChatModel; fallback: ChatModel | null } {
	const fallback = getFallbackLLM(0.3)
	return {
		primary: adapt(getLLM(0.3, "chat"), modelFor("chat")),
		fallback: fallback ? adapt(fallback, env.ALPHA_FALLBACK_AI_MODEL) : null,
	}
}
