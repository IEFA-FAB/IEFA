/**
 * Quais modelos do Bedrock têm prompt caching — o `cachePoint` enviado a um modelo sem ele
 * não é ignorado: a chamada volta 403 (medido com `openai.gpt-oss-120b-1:0` em 2026-09-22).
 * Puro, para o teste não precisar do `env`.
 */

/** Família com prompt caching no Bedrock, pelo id (com ou sem prefixo de inference profile). */
export function modelHasPromptCaching(modelId: string): boolean {
	return /(^|\.)anthropic\.claude|(^|\.)amazon\.nova/.test(modelId)
}
