/**
 * Só aceita caminhos internos: começam com "/" mas não "//" (nem "/\").
 * Fecha open redirect para URLs externas via `?redirect=https://phishing` ou
 * `?redirect=//evil.com` (que o browser trata como protocol-relative).
 */
export function isInternalPath(value: unknown): value is string {
	return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
}

/** Normaliza o `redirect` da query para um caminho interno seguro, ou undefined. */
export function safeRedirect(value: unknown): string | undefined {
	return isInternalPath(value) ? value : undefined
}
