/**
 * Enquadramento da contratação: por onde ela passa (dispensa, inexigibilidade ou licitação) e
 * o que isso decide no Compras.gov.br (modelo de TR, categoria de cada artefato).
 *
 * É orientação para o requisitante, não decisão: quem enquadra é a unidade de contratação. Por
 * isso cada saída carrega o fundamento e os avisos, e a tela os mostra em vez de só o rótulo.
 */

import type { DemandPayload, Nature } from "./schema"

/**
 * Valores do art. 75, I e II, da Lei nº 14.133/2021, atualizados por decreto a cada 1º de
 * janeiro (art. 182). `engineering` vale para obras, serviços de engenharia e manutenção de
 * veículos (inciso I); `other`, para as demais compras e serviços (inciso II).
 */
export const DIRECT_PURCHASE_LIMITS: Readonly<Record<number, { engineering: number; other: number; decree: string }>> = {
	2025: { engineering: 125_451.15, other: 62_725.59, decree: "Decreto nº 12.343/2024" },
	2026: { engineering: 130_984.2, other: 65_492.11, decree: "Decreto nº 12.807/2025" },
}

/** Limites do ano, ou os do ano mais recente conhecido (com o aviso de que podem ter mudado). */
export function limitsFor(year: number): { engineering: number; other: number; decree: string; year: number; isStale: boolean } {
	const known = DIRECT_PURCHASE_LIMITS[year]
	if (known) return { ...known, year, isStale: false }

	const latest = Math.max(...Object.keys(DIRECT_PURCHASE_LIMITS).map(Number))
	return { ...(DIRECT_PURCHASE_LIMITS[latest] as { engineering: number; other: number; decree: string }), year: latest, isStale: true }
}

export type Route = "dispensa_75_I" | "dispensa_75_II" | "inexigibilidade_74_I" | "licitacao"

export const ROUTE_LABEL: Record<Route, string> = {
	dispensa_75_I: "Dispensa de licitação em razão do valor (art. 75, I)",
	dispensa_75_II: "Dispensa de licitação em razão do valor (art. 75, II)",
	inexigibilidade_74_I: "Inexigibilidade por fornecedor exclusivo (art. 74, I)",
	licitacao: "Licitação",
}

export interface Framing {
	route: Route | null
	label: string
	/** Fundamento para citar nas peças. */
	legalBasis: string
	/** Forma de seleção do fornecedor, como vai no TR. */
	selection: string
	/** Valor que pesa contra o limite: a estimativa mais o já gasto no exercício (art. 75, § 1º). */
	aggregateValue: number
	limit: number | null
	limitsDecree: string
	/** Modelo de TR a escolher em Artefatos Digitais. */
	trModel: string
	/** Categoria/subcategoria das Informações Básicas do TR. */
	trCategory: string
	/** Categoria do ETP Digital e do Mapa de Riscos. */
	artifactCategory: string
	/** Objeto do α (`submission.objeto`). */
	alphaObjeto: "COMPRAS" | "SERVICOS" | "OBRAS" | "TIC"
	warnings: string[]
}

const ENGINEERING_NATURES: ReadonlySet<Nature> = new Set(["servico_engenharia", "obra"])

const ALPHA_OBJETO: Record<Nature, Framing["alphaObjeto"]> = {
	bem: "COMPRAS",
	servico: "SERVICOS",
	servico_engenharia: "OBRAS",
	obra: "OBRAS",
	tic: "TIC",
}

const ARTIFACT_CATEGORY: Record<Nature, string> = {
	bem: "Bens",
	servico: "Serviços",
	servico_engenharia: "Serviços",
	obra: "Obras",
	tic: "Soluções de TIC",
}

function trModelFor(nature: Nature, direct: boolean): string {
	const branch = direct ? "Contratação direta" : "Licitação"
	switch (nature) {
		case "bem":
			return `${branch} > Termo de Referência > Termo de Referência Compras Lei 14.133 (dezembro/2025)`
		case "tic":
			return "Bens e serviços de TIC > TR - Bens de TIC - Licitação e Contratação Direta (bens) ou Termo de Referência Serviços TIC - Lei 14.133 (Abril/26) (serviços)"
		default:
			return direct
				? "Contratação direta > Termo de Referência > Termo de Referência único serviços (com, sem, engenharia) e obras Lei 14.133 (dezembro/2025) - Dispensa"
				: "Licitação > Termo de Referência > Termo de Referência único serviços (com, sem, engenharia) e obras Lei 14.133 (dezembro/2025)"
	}
}

/** Subcategoria do TR de compra pela natureza de despesa dos itens. */
function trCategoryFor(nature: Nature, demand: DemandPayload): string {
	switch (nature) {
		case "bem": {
			const permanent = demand.items.some((item) => item.expenseNature.startsWith("4.4.90.52"))
			return `II - compra, inclusive por encomenda: ${permanent ? "Bens permanentes" : "Bens de consumo"}`
		}
		case "servico":
			return "V - prestação de serviços, inclusive os técnico-profissionais especializados: Serviço não-continuado (ou continuado, conforme a vigência)"
		case "servico_engenharia":
			return "VI - obras e serviços de arquitetura e engenharia: Serviços comuns de engenharia"
		case "obra":
			return "VI - obras e serviços de arquitetura e engenharia: Obras"
		case "tic":
			return "Soluções de TIC (bens ou serviços, conforme o objeto)"
	}
}

/**
 * Enquadra a demanda pelo que ela já tem: natureza, exclusividade e valor estimado.
 *
 * `estimatedTotal` vem da pesquisa de preços (`summarizePrices`); sem ele (pesquisa ainda
 * vazia), o enquadramento por valor fica em aberto, e o aviso diz por quê.
 */
export function frameProcurement(demand: DemandPayload, estimatedTotal: number | null, today: Date = new Date()): Framing {
	const nature = demand.solution.nature
	const limits = limitsFor(today.getFullYear())
	const warnings: string[] = []
	if (limits.isStale)
		warnings.push(
			`Limites de ${today.getFullYear()} não cadastrados: usados os de ${limits.year} (${limits.decree}). Confira o decreto de atualização vigente.`
		)

	if (nature === null) {
		return {
			route: null,
			label: "Defina a natureza do objeto para enquadrar a contratação",
			legalBasis: "",
			selection: "",
			aggregateValue: 0,
			limit: null,
			limitsDecree: limits.decree,
			trModel: "",
			trCategory: "",
			artifactCategory: "",
			alphaObjeto: "COMPRAS",
			warnings,
		}
	}

	const aggregateValue = (estimatedTotal ?? 0) + demand.planning.sameNatureSpent
	const isEngineering = ENGINEERING_NATURES.has(nature)
	const limit = isEngineering ? limits.engineering : limits.other
	const base = {
		aggregateValue,
		limit,
		limitsDecree: limits.decree,
		trCategory: trCategoryFor(nature, demand),
		artifactCategory: ARTIFACT_CATEGORY[nature],
		alphaObjeto: ALPHA_OBJETO[nature],
	}

	if (demand.solution.exclusivity.isExclusive) {
		warnings.push(
			"Inexigibilidade exige a comprovação da exclusividade por atestado, contrato, declaração do fabricante ou documento equivalente (art. 74, § 1º), e a justificativa do preço com notas fiscais ou contratos do próprio fornecedor (art. 72, VII)."
		)
		if (!demand.solution.exclusivity.evidence.trim()) warnings.push("Descreva o documento que comprova a exclusividade.")
		return {
			...base,
			route: "inexigibilidade_74_I",
			label: ROUTE_LABEL.inexigibilidade_74_I,
			legalBasis: "art. 74, I, da Lei nº 14.133/2021",
			selection: "Contratação direta por inexigibilidade de licitação, com fundamento no art. 74, I, da Lei nº 14.133/2021.",
			trModel: trModelFor(nature, true),
			warnings,
		}
	}

	if (estimatedTotal === null) {
		warnings.push("Sem preço estimado ainda: o enquadramento por valor depende da pesquisa de preços.")
		return {
			...base,
			route: null,
			label: "Enquadramento por valor pendente da pesquisa de preços",
			legalBasis: "",
			selection: "",
			trModel: trModelFor(nature, true),
			warnings,
		}
	}

	if (aggregateValue < limit) {
		const route: Route = isEngineering ? "dispensa_75_I" : "dispensa_75_II"
		const inciso = isEngineering ? "I" : "II"
		if (aggregateValue >= limit * 0.9) {
			warnings.push(
				"O valor está a menos de 10% do limite da dispensa. Confira o somatório do exercício com objetos da mesma natureza (art. 75, § 1º): se a soma passar do limite, a contratação vai para licitação."
			)
		}
		return {
			...base,
			route,
			label: ROUTE_LABEL[route],
			legalBasis: `art. 75, ${inciso}, da Lei nº 14.133/2021`,
			selection: `Contratação direta por dispensa de licitação em razão do valor, com fundamento no art. 75, ${inciso}, da Lei nº 14.133/2021, preferencialmente na forma eletrônica (dispensa eletrônica, art. 75, § 3º), com seleção pelo critério de menor preço.`,
			trModel: trModelFor(nature, true),
			warnings,
		}
	}

	const modality = nature === "obra" ? "concorrência" : "pregão eletrônico"
	warnings.push(
		`O valor (somado ao já gasto no exercício com a mesma natureza) alcança o limite da dispensa (${formatBRL(limit)}): a contratação vai para licitação, na modalidade ${modality}.`
	)
	return {
		...base,
		route: "licitacao",
		label: `${ROUTE_LABEL.licitacao} (${modality})`,
		legalBasis: nature === "obra" ? "art. 28, II, da Lei nº 14.133/2021" : "art. 28, I, da Lei nº 14.133/2021",
		selection: `Seleção do fornecedor por licitação, na modalidade ${modality}, com critério de julgamento de menor preço.`,
		trModel: trModelFor(nature, false),
		warnings,
	}
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export function formatBRL(value: number): string {
	return BRL.format(value)
}

/** Valor como o campo numérico do sistema aceita: vírgula decimal, sem milhar (`50946,28`). */
export function formatSystemNumber(value: number): string {
	return value.toFixed(2).replace(".", ",")
}
