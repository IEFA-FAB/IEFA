import type { AnyTextAdapter } from "@tanstack/ai"
import { createOllamaChat } from "@tanstack/ai-ollama"

export function createOllamaAdapter(model: string, baseUrl?: string): AnyTextAdapter {
	return createOllamaChat(model as never, baseUrl ?? "http://localhost:11434") as unknown as AnyTextAdapter
}
