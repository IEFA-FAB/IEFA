import type { AnyTextAdapter } from "@tanstack/ai"
import { createGroqText } from "@tanstack/ai-groq"

export function createGroqAdapter(model: string, apiKey: string | undefined): AnyTextAdapter {
	return createGroqText(model as never, apiKey ?? "") as unknown as AnyTextAdapter
}
