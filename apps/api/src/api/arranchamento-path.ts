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

/** Cabeçalhos de depreciação: `Deprecation` (RFC 9745) e `Link` para o sucessor (RFC 8288). */
export function arranchamentoDeprecationHeaders(successor: string): Record<string, string> {
	return { Deprecation: "true", Link: `<${successor}>; rel="successor-version"` }
}

export function logDeprecatedArranchamentoPath(method: string): void {
	console.warn(`[api] rota depreciada ${method} /api${LEGACY_ARRANCHAMENTO_PATH} usada; use /api${ARRANCHAMENTO_PATH}`)
}
