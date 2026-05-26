export type { AnyTextAdapter } from "@tanstack/ai"

export type ProviderType = "groq" | "nvidia" | "openrouter" | "gemini" | "anthropic" | "ollama"

export interface AdapterConfig {
	provider: ProviderType
	model: string
	apiKey?: string
	baseUrl?: string
	defaultHeaders?: Record<string, string>
}
