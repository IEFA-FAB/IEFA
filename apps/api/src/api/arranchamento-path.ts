// ─── Arranchamento: caminho novo e alias depreciado ────────────────────────────
//
// O militar se ARRANCHA (declara que vai comer numa data, refeição e refeitório); a tabela é
// `kitchen.arranchamento` (lote 7 de `sisub-ubiquitous-language`, D7 e D11). O caminho antigo,
// `/api/rancho_previsoes`, fica como alias com `Deprecation`, `Link` para o sucessor e log de uso,
// e continua em `RESTRICTED_PATHS`: alias fora da lista seria rota anônima para o rastro de quem
// come onde.
//
// TODO(2026-09-27): o alias sai quando o mantenedor retirar, depois de o log de uso ficar vazio.
// O contract 20260927140000 só derruba a camada do banco; o alias já lê a tabela nova.

export const ARRANCHAMENTO_PATH = "/arranchamentos"
export const LEGACY_ARRANCHAMENTO_PATH = "/rancho_previsoes"

/** Quando o caminho antigo foi depreciado (o expand do lote 7): 2026-09-27T00:00:00Z. */
export const LEGACY_ARRANCHAMENTO_DEPRECATED_AT = Date.UTC(2026, 8, 27) / 1000

/**
 * Cabeçalhos de depreciação: `Deprecation` como data de Structured Field (`@<epoch>`, RFC 9745) e
 * `Link` para o sucessor (RFC 8288).
 */
export function arranchamentoDeprecationHeaders(successor: string): Record<string, string> {
	return { Deprecation: `@${LEGACY_ARRANCHAMENTO_DEPRECATED_AT}`, Link: `<${successor}>; rel="successor-version"` }
}

/**
 * Log de uso do alias, para achar o chamador antes de desligar. Leva o `user-agent` (que costuma
 * nomear o integrador), não o IP: a rota é autenticada por segredo compartilhado, e o IP é dado
 * pessoal sem ganho para achar quem chama.
 */
export function logDeprecatedArranchamentoPath(method: string, userAgent: string | undefined): void {
	const agent = (userAgent ?? "sem user-agent").slice(0, 200)
	console.warn(`[api] rota depreciada ${method} /api${LEGACY_ARRANCHAMENTO_PATH} usada (${agent}); use /api${ARRANCHAMENTO_PATH}`)
}
