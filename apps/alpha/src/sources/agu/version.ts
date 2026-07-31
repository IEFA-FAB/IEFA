/**
 * Versão dos modelos da AGU.
 *
 * A AGU publica cada modelo como `.docx` com o mês e o ano no fim do nome do
 * arquivo — `...-lei-no-14-133-mai-26.docx`. É o único marcador de versão
 * confiável: o texto do link vem vazio, quebrado em vários `<a>` ou com o mês
 * por extenso, dependendo do modelo.
 */

const MONTHS: Record<string, number> = {
	jan: 1,
	fev: 2,
	mar: 3,
	abr: 4,
	mai: 5,
	jun: 6,
	jul: 7,
	ago: 8,
	set: 9,
	out: 10,
	nov: 11,
	dez: 12,
}

/** `-mai-26` / `-dez-25` imediatamente antes da extensão. */
const VERSION_SUFFIX = /-(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)-(\d{2})\.docx$/i

export interface ParsedVersion {
	label: string
	effective_from: string
	/** Ordenável: ano * 12 + mês. */
	rank: number
}

export function parseVersionFromUrl(url: string): ParsedVersion | null {
	const match = VERSION_SUFFIX.exec(url)
	if (!match) return null

	const month = MONTHS[match[1].toLowerCase()]
	const year = 2000 + Number(match[2])

	return {
		label: `${match[1].toLowerCase()}-${match[2]}`,
		effective_from: `${year}-${String(month).padStart(2, "0")}-01`,
		rank: year * 12 + month,
	}
}

/**
 * Identidade do modelo sem a versão — vira `external_id`.
 *
 * Sem isso, `modelo-de-edital-credenciamento-...-set-25.docx` e
 * `...-abr-26.docx` (ambos listados na mesma página) seriam dois documentos
 * distintos em vez de duas versões do mesmo.
 */
export function stripVersionFromUrl(url: string): string {
	return url.replace(VERSION_SUFFIX, ".docx")
}
