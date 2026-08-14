/**
 * Detecção de capacidades opcionais por presença de env vars — SERVER-ONLY.
 *
 * Princípio (mesmo do sisub): secret de fluxo NÃO essencial nunca quebra o boot.
 * Sem `SUCONT_AI_*` o oráculo simplesmente não está configurado — o endpoint
 * responde 503 e o resto do hub sobe normalmente.
 *
 * Nunca importe em código client-side — usa process.env.
 */

/** bedrock e ollama autenticam por cadeia de credenciais AWS / host local — sem API key. */
const KEYLESS_PROVIDERS = new Set(["ollama", "bedrock"])

/**
 * Alinhado com `createAdapterFromEnv` de @iefa/ai-provider: provider + model são
 * obrigatórios; API key é exigida para todo provider que não seja keyless.
 */
function hasAiEnv(prefix: string): boolean {
	const p = `${prefix}_`
	const provider = process.env[`${p}AI_PROVIDER`]
	const model = process.env[`${p}AI_MODEL`]
	if (!provider || !model) return false
	if (!KEYLESS_PROVIDERS.has(provider) && !process.env[`${p}AI_API_KEY`]) return false
	return true
}

export type ServerCapabilities = {
	/** Oráculo SUCONT (chat + geração de documentos) — SUCONT_AI_* */
	oracle: boolean
}

export function getServerCapabilities(): ServerCapabilities {
	return { oracle: hasAiEnv("SUCONT") }
}
