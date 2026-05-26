import type { AnyTextAdapter } from "@tanstack/ai"
import { createOpenaiChatCompletions } from "@tanstack/ai-openai"

export function createOpenRouterAdapter(model: string, apiKey: string | undefined): AnyTextAdapter {
	return createOpenaiChatCompletions(model as never, apiKey ?? "", {
		baseURL: "https://openrouter.ai/api/v1",
	}) as unknown as AnyTextAdapter
}
