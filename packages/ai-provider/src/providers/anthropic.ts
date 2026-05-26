import type { AnyTextAdapter } from "@tanstack/ai"
import { createAnthropicChat } from "@tanstack/ai-anthropic"

export function createAnthropicAdapter(model: string, apiKey: string | undefined): AnyTextAdapter {
	return createAnthropicChat(model as never, apiKey ?? "") as unknown as AnyTextAdapter
}
