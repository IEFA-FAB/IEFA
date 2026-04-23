/**
 * Classify LLM errors into user-friendly Portuguese messages.
 * Inspects error message strings from OpenAI-compatible APIs
 * (OpenRouter, NVIDIA NIM, OpenAI, etc.) and returns a safe,
 * actionable message suitable for display to end users.
 */
export function classifyLLMError(e: unknown): string {
	const msg = e instanceof Error ? e.message : String(e)
	const lower = msg.toLowerCase()

	// HTTP 402 — insufficient credits / billing
	if (lower.includes("402") || lower.includes("credit") || lower.includes("insufficient") || lower.includes("billing") || lower.includes("quota")) {
		return "Créditos insuficientes. Contate o administrador para recarregar os créditos da IA."
	}

	// HTTP 429 — rate limit / too many requests
	if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many")) {
		return "Muitas requisições simultâneas. Aguarde alguns segundos e tente novamente."
	}

	// HTTP 401 — authentication error
	if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid api key")) {
		return "Erro de autenticação com o serviço de IA. Contate o administrador."
	}

	// HTTP 503 / model unavailable
	if (lower.includes("503") || lower.includes("unavailable") || lower.includes("overloaded")) {
		return "O serviço de IA está temporariamente indisponível. Tente novamente em instantes."
	}

	// Context length exceeded
	if (lower.includes("context length") || lower.includes("maximum context") || lower.includes("too long")) {
		return "Mensagem muito longa para o modelo. Reduza o tamanho da conversa e tente novamente."
	}

	// Network / timeout
	if (lower.includes("timeout") || lower.includes("timed out")) {
		return "A requisição à IA expirou. Tente novamente."
	}

	// Generic fallback
	return "Erro ao processar sua mensagem. Tente novamente."
}
