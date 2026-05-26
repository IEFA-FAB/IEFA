import type { AnyTextAdapter, ChatMiddleware } from "@tanstack/ai"
import { createAnthropicAdapter } from "./providers/anthropic.js"
import { createGeminiAdapter } from "./providers/gemini.js"
import { createGroqAdapter } from "./providers/groq.js"
import { createNvidiaAdapter } from "./providers/nvidia.js"
import { createOllamaAdapter } from "./providers/ollama.js"
import { createOpenRouterAdapter } from "./providers/openrouter.js"
import type { AdapterConfig, ProviderType } from "./types.js"

export type { AnyTextAdapter, ChatMiddleware } from "@tanstack/ai"
export type { AdapterConfig, ProviderType } from "./types.js"

const VALID_PROVIDERS: ProviderType[] = ["groq", "nvidia", "openrouter", "gemini", "anthropic", "ollama"]

export function createAdapter(config: AdapterConfig): AnyTextAdapter {
	switch (config.provider) {
		case "groq":
			return createGroqAdapter(config.model, config.apiKey)
		case "nvidia":
			return createNvidiaAdapter(config.model, config.apiKey, config.baseUrl)
		case "openrouter":
			return createOpenRouterAdapter(config.model, config.apiKey)
		case "gemini":
			return createGeminiAdapter(config.model, config.apiKey)
		case "anthropic":
			return createAnthropicAdapter(config.model, config.apiKey)
		case "ollama":
			return createOllamaAdapter(config.model, config.baseUrl)
		default:
			throw new Error(`Provider inválido: "${(config as AdapterConfig).provider}". Válidos: ${VALID_PROVIDERS.join(", ")}`)
	}
}

export function createAdapterFromEnv(prefix?: string): AnyTextAdapter {
	const p = prefix ? `${prefix}_` : ""
	const provider = process.env[`${p}AI_PROVIDER`]
	const model = process.env[`${p}AI_MODEL`]
	const apiKey = process.env[`${p}AI_API_KEY`]
	const baseUrl = process.env[`${p}AI_BASE_URL`]

	if (!provider || !model) {
		throw new Error(`Env vars obrigatórias ausentes: ${[`${p}AI_PROVIDER`, `${p}AI_MODEL`, `${p}AI_API_KEY`].filter((k) => !process.env[k]).join(", ")}`)
	}

	return createAdapter({
		provider: provider as ProviderType,
		model,
		apiKey: apiKey ?? "",
		baseUrl,
	})
}

export function withFallback(primary: AnyTextAdapter, fallback: AnyTextAdapter): AnyTextAdapter {
	return {
		...primary,
		chatStream: async function* (options) {
			try {
				yield* primary.chatStream(options)
			} catch (err) {
				const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { status?: number; statusCode?: number })?.statusCode
				if (status === 429 || status === 503) {
					yield* fallback.chatStream(options)
				} else {
					throw err
				}
			}
		},
		structuredOutput: async (options) => {
			try {
				return await primary.structuredOutput(options)
			} catch (err) {
				const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { status?: number; statusCode?: number })?.statusCode
				if (status === 429 || status === 503) {
					return fallback.structuredOutput(options)
				}
				throw err
			}
		},
	}
}

export function maxIterationsMiddleware(n: number): ChatMiddleware {
	return {
		name: "max-iterations",
		onConfig: (ctx) => {
			if (ctx.phase === "beforeModel" && ctx.iteration >= n) {
				ctx.abort(`Limite de ${n} iterações atingido`)
			}
		},
	}
}
