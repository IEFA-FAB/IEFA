import type { AnyTextAdapter } from "@tanstack/ai"
import { createGeminiChat } from "@tanstack/ai-gemini"

export function createGeminiAdapter(model: string, apiKey: string | undefined): AnyTextAdapter {
	return createGeminiChat(model as never, apiKey ?? "") as unknown as AnyTextAdapter
}
