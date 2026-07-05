/**
 * Só aceita caminhos internos: começam com "/" mas não "//" (nem "/\").
 * Fecha open redirect para URLs externas via `?redirect=https://phishing` ou
 * `?redirect=//evil.com` (que o browser trata como protocol-relative).
 *
 * Boundary aceito conscientemente: `/%2Fevil.com` passa (começa com um único "/").
 * Não é um open redirect real aqui — o valor vira `to` de um navigate/redirect do
 * TanStack Router (SPA), que o trata como segmento de rota literal, nunca como host;
 * não há decode para `//` antes da navegação. Coberto por teste para explicitar o limite.
 */
export function isInternalPath(value: unknown): value is string {
	return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
}

/** Normaliza o `redirect` da query para um caminho interno seguro, ou undefined. */
export function safeRedirect(value: unknown): string | undefined {
	return isInternalPath(value) ? value : undefined
}
