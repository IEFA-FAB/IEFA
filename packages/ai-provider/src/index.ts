import type { AnyTextAdapter, ChatMiddleware } from "@tanstack/ai"
import { withFallbackChain } from "./fallback.js"
import { createAnthropicAdapter } from "./providers/anthropic.js"
import { createBedrockAdapter } from "./providers/bedrock.js"
import { createGeminiAdapter } from "./providers/gemini.js"
import { createGroqAdapter } from "./providers/groq.js"
import { createNvidiaAdapter } from "./providers/nvidia.js"
import { createOllamaAdapter } from "./providers/ollama.js"
import { createOpenRouterAdapter } from "./providers/openrouter.js"
import { rateLimitConfigFromEnv, withRateLimit } from "./rate-limit.js"
import type { AdapterConfig, ProviderType } from "./types.js"

export type { AnyTextAdapter, ChatMiddleware } from "@tanstack/ai"
export { isRetryableAdapterFailure, withFallback, withFallbackChain } from "./fallback.js"
export {
	defaultRateLimitStore,
	enforceRequestRateLimit,
	type RateLimitConfig,
	RateLimitError,
	RateLimitStore,
	rateLimitConfigFromEnv,
	type WithRateLimitOptions,
	withRateLimit,
} from "./rate-limit.js"
export type { AdapterConfig, ProviderType } from "./types.js"

const VALID_PROVIDERS: ProviderType[] = ["groq", "nvidia", "openrouter", "gemini", "anthropic", "ollama", "bedrock"]

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
		case "bedrock":
			return createBedrockAdapter(config.model, config.region)
		default:
			throw new Error(`Provider inválido: "${(config as AdapterConfig).provider}". Válidos: ${VALID_PROVIDERS.join(", ")}`)
	}
}

/** Lê um adapter de um prefixo de env. Devolve `undefined` quando provider/model não estão setados. */
function adapterFromEnvOrUndefined(prefix: string | undefined): AnyTextAdapter | undefined {
	const p = prefix ? `${prefix}_` : ""
	const provider = process.env[`${p}AI_PROVIDER`]
	const model = process.env[`${p}AI_MODEL`]
	if (!provider || !model) return undefined

	return createAdapter({
		provider: provider as ProviderType,
		model,
		apiKey: process.env[`${p}AI_API_KEY`] ?? "",
		baseUrl: process.env[`${p}AI_BASE_URL`],
		// Região do Bedrock: prefixo dedicado, senão a região padrão da AWS.
		region: process.env[`${p}AI_REGION`] ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
	})
}

export interface AdapterFromEnvOptions {
	/**
	 * Chave dos tetos de consumo — o id do usuário autenticado. Sem ela os tetos por
	 * usuário viram um balde único compartilhado, o que só faz sentido em job/CLI.
	 */
	rateLimitKey?: string
}

/**
 * Monta o adapter do prefixo, com reserva e tetos de consumo:
 *
 *   `<PREFIX>_AI_*`           → primário (na AWS: `provider=bedrock`, sem API key)
 *   `<PREFIX>_FALLBACK_AI_*`  → reserva, usada só se o primário falhar antes de responder
 *   `<PREFIX>_AI_MAX_*`       → tetos de requisições/tokens (ver rate-limit.ts)
 *
 * Sem as vars de reserva e de teto o comportamento é idêntico ao de antes: um adapter só,
 * sem freio.
 */
export function createAdapterFromEnv(prefix?: string, options: AdapterFromEnvOptions = {}): AnyTextAdapter {
	const p = prefix ? `${prefix}_` : ""
	const primary = adapterFromEnvOrUndefined(prefix)
	if (!primary) {
		throw new Error(`Env vars obrigatórias ausentes: ${[`${p}AI_PROVIDER`, `${p}AI_MODEL`, `${p}AI_API_KEY`].filter((k) => !process.env[k]).join(", ")}`)
	}

	const fallback = adapterFromEnvOrUndefined(prefix ? `${prefix}_FALLBACK` : "FALLBACK")
	const chained = fallback ? withFallbackChain(primary, fallback) : primary

	const rateLimit = rateLimitConfigFromEnv(prefix)
	if (!rateLimit) return chained

	return withRateLimit(chained, { key: options.rateLimitKey ?? "__shared__", config: rateLimit })
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
