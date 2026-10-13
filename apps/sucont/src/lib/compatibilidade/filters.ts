/**
 * @module lib/compatibilidade/filters
 * Extraído de routes/analista-compatibilidade.tsx (port do analistacompatibilidade):
 * descrição do filtro ativo no cabeçalho da aba operacional.
 */

export function describeReportFilter(conferenteFilter: string, racFilter: string, userProfile: string | null) {
	return conferenteFilter === "all" && racFilter === "all"
		? "Panorama geral"
		: `Filtrado por: ${conferenteFilter === "minhas" ? `Minhas UGs (${userProfile})` : conferenteFilter !== "all" ? conferenteFilter : ""} ${racFilter !== "all" ? (conferenteFilter !== "all" ? " + " : "") + racFilter : ""}`
}
