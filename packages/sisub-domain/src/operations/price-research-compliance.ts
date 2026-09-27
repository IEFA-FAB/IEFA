/**
 * Conformidade da pesquisa de preços com a IN SEGES/ME 65/2021. Puro: roda no modal (ao vivo,
 * ao lado do campo de justificativa) e na gravação (o que vai para `non_compliance_reasons`).
 *
 * Nenhuma não conformidade trava o uso do preço. Ela fica registrada no item pesquisado, com a
 * base e o que fazer, e a justificativa correspondente a resolve. Preço acima da mediana e
 * unidade herdada não se justificam: só refazer a pesquisa resolve.
 *
 * Fonte: IN SEGES/ME 65/2021, texto consolidado em gov.br/compras (conferido em 2026-09-26):
 * - art. 5º, I: sistemas oficiais, "como Painel de Preços", com o índice de atualização de
 *   preços; é a fonte daqui (módulo de pesquisa de preço do Compras.gov.br). O sistema não
 *   aplica índice, então preço antigo fica sem a atualização que o inciso pede;
 * - art. 5º, II: contratações similares de até 1 (um) ano antes da DATA DA PESQUISA. O ano
 *   conta da pesquisa, não do edital (a divulgação do edital é o marco dos incisos III, IV e V,
 *   fontes que o sistema ainda não tem);
 * - art. 5º, § 3º: preço fora do prazo do inciso II só justificado, com o índice de atualização;
 * - art. 6º, caput: média, mediana ou o menor dos valores, sobre 3 ou mais preços;
 * - art. 6º, § 1º: outro método, justificado pelo gestor e aprovado pela autoridade competente;
 * - art. 6º, § 3º: critério de desconsideração fundamentado e descrito (e art. 3º, VI);
 * - art. 6º, § 5º: menos de 3 preços, justificado e aprovado;
 * - art. 6º, § 6º: base única no inciso I do art. 5º, o preço não passa da mediana.
 * - 3 UASGs distintas é critério da unidade: a IN não fixa número de órgãos.
 */

import { isSamePrice } from "./price-units.ts"

/** Métodos do art. 6º, caput: média, mediana ou o menor dos valores. */
export const PRICE_RESEARCH_METHODS = ["mean", "median", "lowest"] as const
export type PriceResearchMethod = (typeof PRICE_RESEARCH_METHODS)[number]

/**
 * Justificativas que resolvem não conformidade, uma por fundamento. Colunas `justification_*`
 * de `procurement.price_research_item` (migration 20260926211000).
 */
export const RESEARCH_JUSTIFICATION_KEYS = ["lowSample", "method", "outlierCriteria", "outOfPeriod"] as const
export type ResearchJustificationKey = (typeof RESEARCH_JUSTIFICATION_KEYS)[number]
export type ResearchJustifications = Partial<Record<ResearchJustificationKey, string | null>>

/** Rótulo do campo de justificativa, com a base. */
export const RESEARCH_JUSTIFICATION_LABELS: Record<ResearchJustificationKey, string> = {
	lowSample: "Justificativa da amostra reduzida (art. 6º, § 5º)",
	method: "Justificativa do método (art. 6º, § 1º)",
	outlierCriteria: "Critério de desconsideração das amostras (art. 6º, § 3º)",
	outOfPeriod: "Justificativa do preço fora do período de 1 ano (art. 5º, § 3º)",
}

/**
 * Tamanho mínimo, em caracteres, para a justificativa contar. Recusa "ok" e "-": ela vai aos
 * autos e à autoridade competente, e precisa dizer alguma coisa.
 */
export const MIN_JUSTIFICATION_LENGTH = 10

/** Mínimo de preços do art. 6º, caput. */
export const MIN_COMPLIANT_SAMPLES = 3
/** Mínimo de UASGs distintas: critério da unidade, sem previsão na IN 65/2021. */
export const MIN_DISTINCT_SOURCES = 3
/** Janela do art. 5º, II: contratações de até 1 ano antes da data da pesquisa. */
export const MAX_PERIOD_MONTHS = 12

/**
 * Parâmetro do art. 5º das amostras gravadas hoje: o módulo de pesquisa de preço do
 * Compras.gov.br (dados do Painel de Preços), que o inciso I cita como sistema oficial. Fonte
 * nova (cotação direta = IV, NF-e = V, mídia e sítios = III) grava o próprio inciso.
 */
export const COMPRAS_GOV_ART5_PARAMETER = "I"

export type ResearchFindingCode =
	| "low_sample"
	| "few_sources"
	| "above_median"
	| "unit_inferred"
	| "out_of_period"
	| "undated_samples"
	| "manual_exclusion"
	| "other_method"

/** Uma não conformidade: o que houve, a base, o que fazer, e se já está justificada. */
export type ResearchFinding = {
	code: ResearchFindingCode
	message: string
	/** Base normativa, ou "critério da unidade" quando a regra é interna. */
	basis: string
	/** O que resolve. */
	remedy: string
	/** Justificativa que resolve; null quando só refazer a pesquisa resolve. */
	justification: ResearchJustificationKey | null
	justified: boolean
}

/** Fatos da pesquisa que decidem a conformidade. */
export type ResearchComplianceFacts = {
	validCount: number
	referencePrice: number
	stats: { median: number; uniqueSources: number }
	measureUnit?: string | null
	unitInferred?: boolean
	/** Método gravado. Fora do caput do art. 6º pede justificativa. */
	method?: string
	/** Janela em meses; null/ausente = todo o histórico. */
	periodMonths?: number | null
	/** Amostras SEM data de referência que entraram no cálculo. */
	undatedCount?: number
	/** Amostras escolhidas à mão (seleção de linhas ou filtro de coluna), sem o IQR automático. */
	manualSelection?: boolean
	justifications?: ResearchJustifications
}

/** Mínimo de preços comparáveis para o descarte automático por IQR rodar. */
export const MIN_SAMPLES_FOR_IQR = 4

/**
 * Descarte automático de preços inexequíveis ou excessivos (art. 6º, § 3º): fora de
 * [Q1 − 1,5 × IIQ; Q3 + 1,5 × IIQ], com 4 ou mais preços e IIQ positivo. O critério descrito no
 * relatório; o modal, o lote e o servidor (que confere a classificação recebida) usam este mesmo.
 */
export function splitOutliersByIqr<T>(items: readonly T[], priceOf: (item: T) => number): { valid: T[]; outliers: T[] } {
	if (items.length < MIN_SAMPLES_FOR_IQR) return { valid: [...items], outliers: [] }
	const sorted = items.map(priceOf).toSorted((a, b) => a - b)
	const n = sorted.length
	const q1 = sorted[Math.floor(n * 0.25)]
	const q3 = sorted[Math.floor(n * 0.75)]
	const iqr = q3 - q1
	if (!(iqr > 0)) return { valid: [...items], outliers: [] }
	const lower = q1 - 1.5 * iqr
	const upper = q3 + 1.5 * iqr
	const valid: T[] = []
	const outliers: T[] = []
	for (const item of items) {
		const price = priceOf(item)
		if (price >= lower && price <= upper) valid.push(item)
		else outliers.push(item)
	}
	return { valid, outliers }
}

/** Não conformidade em aberto como o servidor a devolve: código estável, texto e se a justificativa resolve. */
export type OpenResearchFinding = Pick<ResearchFinding, "code" | "message" | "basis" | "remedy"> & { justifiable: boolean }

export function openFindingsOf(facts: ResearchComplianceFacts): OpenResearchFinding[] {
	return evaluateResearchCompliance(facts)
		.filter((f) => !f.justified)
		.map((f) => ({ code: f.code, message: f.message, basis: f.basis, remedy: f.remedy, justifiable: f.justification != null }))
}

export function isJustificationFilled(value: string | null | undefined): boolean {
	return (value?.trim().length ?? 0) >= MIN_JUSTIFICATION_LENGTH
}

function countLabel(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`
}

/** Não conformidades da pesquisa, justificadas ou não, na ordem em que o relatório as lista. */
export function evaluateResearchCompliance(facts: ResearchComplianceFacts): ResearchFinding[] {
	const findings: Omit<ResearchFinding, "justified">[] = []

	if (facts.validCount < MIN_COMPLIANT_SAMPLES)
		findings.push({
			code: "low_sample",
			message: `Menos de 3 preços válidos (${facts.validCount})`,
			basis: "IN SEGES/ME 65/2021, art. 6º, caput e § 5º",
			remedy: "Amplie a pesquisa ou justifique o preço com menos de 3 preços; a justificativa vai à aprovação da autoridade competente.",
			justification: "lowSample",
		})
	if (facts.stats.uniqueSources < MIN_DISTINCT_SOURCES)
		findings.push({
			code: "few_sources",
			message: `Menos de 3 UASGs distintas (${facts.stats.uniqueSources})`,
			basis: "Critério da unidade; a IN 65/2021 não fixa número de órgãos",
			remedy: "Amplie a pesquisa ou justifique a concentração das fontes.",
			justification: "lowSample",
		})
	if (facts.referencePrice > facts.stats.median && !isSamePrice(facts.referencePrice, facts.stats.median))
		findings.push({
			code: "above_median",
			message: "Preço estimado acima da mediana",
			basis: "IN SEGES/ME 65/2021, art. 6º, § 6º",
			remedy: "Use a mediana ou o menor preço: com base única no sistema oficial, o preço não pode passar da mediana.",
			justification: null,
		})
	if (facts.unitInferred)
		findings.push({
			code: "unit_inferred",
			message: `Item de compra sem unidade declarada: preço calculado por ${facts.measureUnit ?? "unidade predominante"}`,
			basis: "Critério da unidade: a quantidade do anexo precisa estar na unidade do preço",
			remedy: "Declare a unidade no item de compra e refaça a pesquisa.",
			justification: null,
		})
	if (facts.periodMonths == null || facts.periodMonths > MAX_PERIOD_MONTHS)
		findings.push({
			code: "out_of_period",
			message: facts.periodMonths == null ? "Pesquisa em todo o histórico, sem a janela de 1 ano" : `Janela de ${facts.periodMonths} meses, maior que 1 ano`,
			basis: "IN SEGES/ME 65/2021, art. 5º, I e II, e § 3º",
			remedy: "Refaça com a janela de 12 meses, ou justifique o preço fora do prazo, com o índice de atualização aplicado.",
			justification: "outOfPeriod",
		})
	const undated = facts.undatedCount ?? 0
	if (undated > 0)
		findings.push({
			code: "undated_samples",
			message: `${countLabel(undated, "amostra sem data de referência", "amostras sem data de referência")} no cálculo`,
			basis: "IN SEGES/ME 65/2021, art. 5º, II, e § 3º: sem data, não há como mostrar que o preço é de até 1 ano",
			remedy: "Tire as amostras sem data do cálculo, ou justifique mantê-las.",
			justification: "outOfPeriod",
		})
	if (facts.manualSelection)
		findings.push({
			code: "manual_exclusion",
			message: "Amostras escolhidas à mão (seleção ou filtro), sem o descarte automático por IQR",
			basis: "IN SEGES/ME 65/2021, art. 6º, § 3º, e art. 3º, VI",
			remedy: "Descreva o critério usado para desconsiderar as demais amostras.",
			justification: "outlierCriteria",
		})
	if (facts.method != null && !(PRICE_RESEARCH_METHODS as readonly string[]).includes(facts.method))
		findings.push({
			code: "other_method",
			message: `Método "${facts.method}" diferente de média, mediana ou menor valor`,
			basis: "IN SEGES/ME 65/2021, art. 6º, § 1º",
			remedy: "Justifique o método; a justificativa vai à aprovação da autoridade competente.",
			justification: "method",
		})

	const justifications = facts.justifications ?? {}
	return findings.map((f) => ({ ...f, justified: f.justification != null && isJustificationFilled(justifications[f.justification]) }))
}

/** Texto gravado de uma não conformidade em `non_compliance_reasons`. */
export function formatResearchFinding(finding: Pick<ResearchFinding, "message" | "basis">): string {
	return `${finding.message} (${finding.basis})`
}

/** Não conformidades em aberto (sem justificativa), como gravadas em `non_compliance_reasons`. Vazio = conforme. */
export function researchNonComplianceReasons(facts: ResearchComplianceFacts): string[] {
	return evaluateResearchCompliance(facts)
		.filter((f) => !f.justified)
		.map(formatResearchFinding)
}

/**
 * Justificativas a gravar: só as que respondem a uma não conformidade desta pesquisa, aparadas.
 * Justificativa curta demais não resolve e não vai para os autos.
 */
export function justificationsToPersist(facts: ResearchComplianceFacts): Record<ResearchJustificationKey, string | null> {
	const answered = new Set(evaluateResearchCompliance(facts).flatMap((f) => (f.justified && f.justification ? [f.justification] : [])))
	const pick = (key: ResearchJustificationKey) => (answered.has(key) ? (facts.justifications?.[key]?.trim() ?? null) : null)
	return { lowSample: pick("lowSample"), method: pick("method"), outlierCriteria: pick("outlierCriteria"), outOfPeriod: pick("outOfPeriod") }
}
