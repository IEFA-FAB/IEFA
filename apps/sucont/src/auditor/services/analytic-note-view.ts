// Extraído de auditor/components/AnalyticNoteModal.tsx (port do SIAFI-x-SILOMS-Auditor):
// rótulos e linhas das tabelas da Nota Analítica, montadas a partir do `ReportDataset`.

import { formatCurrency } from "./dataProcessor"
import { NET_DIFFERENCE_LABEL } from "./net-difference"
import type { ReportDataset, ReportOffender, ReportTrendItem } from "./report"

export const GROUP_LABEL: Record<string, string> = {
	BMP: "Bens Móveis Permanentes",
	CONSUMO: "Bens de Consumo",
	INTANGIVEL: "Bens Intangíveis",
}

export const SCOPE_LABEL: Record<string, string> = {
	MENSAL: "Mensal",
	TRIMESTRAL: "Trimestral",
	SEMESTRAL: "Semestral",
	ANUAL: "Anual",
}

export const groupLabel = (group: string) => GROUP_LABEL[group] ?? group

export const percent = (value: number | null) => (value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`)

/** Escopo como o cabeçalho do modal o escreve (`Mensal`); valor fora do dicionário sai cru. */
export const describeTimeFilter = (timeFilter: string | undefined) => SCOPE_LABEL[timeFilter ?? ""] ?? timeFilter

/** Tabela "O que será analisado", antes da geração. */
export function buildPreviewRows(dataset: ReportDataset): string[][] {
	return [
		["Competência", dataset.competenceLabel],
		["Recorte", dataset.scopeLabel],
		["Unidades Gestoras", String(dataset.ugCount)],
		["Registros (UG × grupo)", String(dataset.recordCount)],
		["Divergência total", formatCurrency(dataset.totals.absoluteDifference)],
		[NET_DIFFERENCE_LABEL, formatCurrency(dataset.totals.netDifference)],
		["Competência anterior", dataset.previous ? dataset.previous.label : "não consta na base carregada"],
	]
}

/** Seção 1 — indicadores do sumário executivo. */
export function buildSummaryRows(snapshot: ReportDataset): string[][] {
	return [
		["Saldo total SIAFI", formatCurrency(snapshot.totals.siafi)],
		["Saldo total SILOMS", formatCurrency(snapshot.totals.siloms)],
		["Divergência total (soma dos módulos)", formatCurrency(snapshot.totals.absoluteDifference)],
		[NET_DIFFERENCE_LABEL, formatCurrency(snapshot.totals.netDifference)],
		["Unidades Gestoras analisadas", String(snapshot.ugCount)],
		[
			"Preponderância",
			`SIAFI maior em ${snapshot.preponderance.siafi} · SILOMS maior em ${snapshot.preponderance.siloms} · equilibrados ${snapshot.preponderance.equal}`,
		],
		[
			`Competência anterior (${snapshot.previous?.label ?? "—"})`,
			snapshot.previous ? formatCurrency(snapshot.previous.totals.absoluteDifference) : "não consta na base carregada",
		],
	]
}

/** Situação da UG pelo sistema preponderante. */
export const preponderanceLabel = (preponderance: ReportOffender["preponderance"]) =>
	preponderance === "EQUAL" ? "Equilibrado" : preponderance === "SIAFI" ? "SIAFI > SILOMS" : "SILOMS > SIAFI"

/** Seção 2 — maiores divergências. */
export function buildOffenderRows(topOffenders: ReportOffender[]): string[][] {
	return topOffenders.map((o) => [
		o.ug,
		o.cod,
		groupLabel(o.group),
		formatCurrency(o.difference),
		formatCurrency(o.siafi),
		formatCurrency(o.siloms),
		preponderanceLabel(o.preponderance),
		o.riskLevel ?? "—",
	])
}

/** Seção 3-A — hipóteses de transferência entre OMs. */
export function buildInterOmRows(interOm: ReportDataset["interOm"]): string[][] {
	return interOm.map((t) => [`${t.ugA} (${t.codA})`, `${t.ugB} (${t.codB})`, groupLabel(t.group), formatCurrency(t.value), formatCurrency(t.residual)])
}

/** Seção 4 — agravamento ou melhoria de um escopo (as duas tabelas têm o mesmo formato). */
export function buildTrendRows(items: ReportTrendItem[]): string[][] {
	return items.map((i) => [
		i.ug,
		i.cod,
		groupLabel(i.group),
		formatCurrency(i.delta),
		percent(i.deltaPct),
		formatCurrency(i.difference),
		formatCurrency(i.previousDifference),
	])
}

/** Seção 5 — gargalos por natureza de bem. */
export function buildGroupRows(groups: ReportDataset["groups"]): string[][] {
	return groups.map((g) => [groupLabel(g.group), formatCurrency(g.difference), formatCurrency(g.siafi), formatCurrency(g.siloms), String(g.ugCount)])
}
