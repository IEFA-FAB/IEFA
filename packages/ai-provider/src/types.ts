export type { AnyTextAdapter } from "@tanstack/ai"

export type ProviderType = "groq" | "nvidia" | "openrouter" | "gemini" | "anthropic" | "ollama" | "bedrock"

export interface AdapterConfig {
	provider: ProviderType
	model: string
	apiKey?: string
	baseUrl?: string
	defaultHeaders?: Record<string, string>
	/** Região AWS para o provider bedrock (ex.: "us-east-1"). Cai na cadeia de env AWS se ausente. */
	region?: string
}
