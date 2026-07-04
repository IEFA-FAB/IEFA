/**
 * Detecção de capacidades opcionais por presença de env vars — SERVER-ONLY.
 *
 * Princípio: secrets associados a fluxos NÃO essenciais (ex.: IA) nunca devem
 * quebrar o deploy quando ausentes. Em vez de lançar erro no boot, este módulo
 * apenas reporta quais features estão configuradas. As telas dependentes
 * renderizam um placeholder "Em breve" quando a capacidade está desligada, e os
 * endpoints retornam 503 — o resto da aplicação sobe normalmente.
 *
 * Nunca importe em código client-side — usa process.env. Para expor ao client,
 * use getCapabilitiesFn (src/server/capabilities.fn.ts).
 */

/**
 * Verifica se um adapter de IA está configurado para um dado prefixo
 * (ex.: "MODULE_CHAT" → MODULE_CHAT_AI_PROVIDER / _AI_MODEL / _AI_API_KEY).
 *
 * Alinhado com createAdapterFromEnv de @iefa/ai-provider: provider + model são
 * obrigatórios; api key é exigida para todos os providers exceto ollama e
 * bedrock (que autenticam por host local / cadeia de credenciais AWS).
 */
const KEYLESS_PROVIDERS = new Set(["ollama", "bedrock"])

function hasAiEnv(prefix: string): boolean {
	const p = `${prefix}_`
	const provider = process.env[`${p}AI_PROVIDER`]
	const model = process.env[`${p}AI_MODEL`]
	if (!provider || !model) return false
	if (!KEYLESS_PROVIDERS.has(provider) && !process.env[`${p}AI_API_KEY`]) return false
	return true
}

export type ServerCapabilities = {
	/** Chat IA dos módulos (global/kitchen/unit/local-analytics) — MODULE_CHAT_AI_* */
	moduleChat: boolean
	/** Assistente IA de Analytics — ANALYTICS_AI_* */
	analyticsChat: boolean
}

export function getServerCapabilities(): ServerCapabilities {
	return {
		moduleChat: hasAiEnv("MODULE_CHAT"),
		analyticsChat: hasAiEnv("ANALYTICS"),
	}
}
