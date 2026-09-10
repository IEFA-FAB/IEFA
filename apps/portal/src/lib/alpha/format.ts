/**
 * Formatação compartilhada pelas telas do α.
 *
 * Um lugar só, e com fuso explícito: o relatório do lado do α renderiza em
 * `America/Sao_Paulo`, e o navegador de quem abre a tela pode estar em outro —
 * a mesma data apareceria com horas diferentes no PDF e na página, para o
 * mesmo processo. O fuso também elimina a divergência entre SSR e cliente.
 */
const DATE_TIME = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })

export function formatDateTime(value: string | null | undefined, empty = "—"): string {
	if (!value) return empty
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? empty : DATE_TIME.format(date)
}
