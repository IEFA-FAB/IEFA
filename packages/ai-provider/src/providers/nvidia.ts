import type { AnyTextAdapter } from "@tanstack/ai"
import { createOpenaiChatCompletions } from "@tanstack/ai-openai"

export function createNvidiaAdapter(model: string, apiKey: string | undefined, baseUrl?: string): AnyTextAdapter {
	return createOpenaiChatCompletions(model as never, apiKey ?? "", {
		baseURL: baseUrl ?? "https://integrate.api.nvidia.com/v1",
	}) as unknown as AnyTextAdapter
}
