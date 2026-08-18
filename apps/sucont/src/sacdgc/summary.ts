/**
 * @module sacdgc/summary
 * Contagens derivadas de uma análise.
 *
 * Existe como função pura, e não inline no componente, porque o mesmo número
 * aparece em três lugares (tabela de UGs, resumo da rodada e coluna gerada do
 * banco). Três leituras independentes do mesmo jsonb é como um "9 alertas" vira
 * "limpa" numa das telas.
 */

import type { DgcAnalysis } from "#/sacdgc/types"

export interface DgcAnalysisCounts {
	alertas: number
	apontamentos: number
}

export function countAnalysis(analysis: DgcAnalysis): DgcAnalysisCounts {
	return {
		alertas: analysis.alertasDeCriticidade.length,
		apontamentos: analysis.checklistAec.perguntas.filter((p) => p.resposta === "SIM").length,
	}
}

const MONTHS: Record<string, string> = {
	JANEIRO: "01",
	FEVEREIRO: "02",
	MARÇO: "03",
	MARCO: "03",
	ABRIL: "04",
	MAIO: "05",
	JUNHO: "06",
	JULHO: "07",
	AGOSTO: "08",
	SETEMBRO: "09",
	OUTUBRO: "10",
	NOVEMBRO: "11",
	DEZEMBRO: "12",
}

/**
 * "JULHO/2026" → "2026-07-01". Devolve `null` quando a carga misturou meses
 * ("JULHO/2026, AGOSTO/2026") ou quando o rótulo não é reconhecível — a coluna
 * `period` aceita null justamente para não inventar uma data que o arquivo não tem.
 */
export function competenceToPeriod(competence: string): string | null {
	const label = competence.trim().toUpperCase()
	if (!label || label.includes(",")) return null

	const [monthName, year] = label.split("/")
	const month = MONTHS[monthName?.trim() ?? ""]
	if (!month || !/^\d{4}$/.test(year?.trim() ?? "")) return null
	return `${year.trim()}-${month}-01`
}
