/**
 * Detecção de capacidades opcionais por presença de env var — SERVER-ONLY.
 *
 * Mesma regra do sisub e do sucont: fluxo de IA não é essencial e por isso nunca
 * derruba o boot. Sem `PORTAL_AI_*`, a redação assistida simplesmente não existe — a
 * server function responde 503 e o resto do portal (journal, facilidades, publicações)
 * sobe normalmente.
 *
 * Nunca importe em código client-side: usa `process.env`.
 */

/** bedrock e ollama autenticam por cadeia de credenciais AWS / host local — sem API key. */
const KEYLESS_PROVIDERS = new Set(["ollama", "bedrock"])

/** Alinhado com `createAdapterFromEnv`: provider + model obrigatórios; API key só para provider não keyless. */
function hasAiEnv(prefix: string): boolean {
	const p = `${prefix}_`
	const provider = process.env[`${p}AI_PROVIDER`]
	const model = process.env[`${p}AI_MODEL`]
	if (!provider || !model) return false
	if (!KEYLESS_PROVIDERS.has(provider) && !process.env[`${p}AI_API_KEY`]) return false
	return true
}

export type ServerCapabilities = {
	/** Redação assistida das comunicações oficiais — `PORTAL_AI_*`. */
	documentAi: boolean
}

export function getServerCapabilities(): ServerCapabilities {
	return { documentAi: hasAiEnv("PORTAL") }
}
