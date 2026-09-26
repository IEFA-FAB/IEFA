/**
 * A demanda do requisitante, estruturada antes de virar documento.
 *
 * A ordem dos blocos segue o Value-Focused Thinking (Keeney, 1992):
 *   1. contexto da decisão: o problema, quem ele atinge e o que acontece se nada for feito;
 *   2. objetivos: os fundamentais (o que se quer de fato) separados dos objetivos-meio (como
 *      se chega lá), cada fundamental com o atributo que mede o seu atendimento;
 *   3. alternativas geradas a partir dos objetivos, e não o contrário. Contratar é uma delas;
 *      usar ata vigente, resolver com meios próprios e não fazer nada também;
 *   4. só então a solução escolhida, os itens, os preços e os riscos.
 *
 * Cada bloco alimenta um campo da Lei nº 14.133/2021, art. 18, § 1º: o problema é a
 * descrição da necessidade (I); os objetivos fundamentais, com seus atributos, são os
 * resultados pretendidos (IX); os objetivos-meio viram requisitos (III); as alternativas são o
 * levantamento de mercado (V); a escolhida é a descrição da solução (VII). É por isso que a
 * estrutura vem antes do texto: o texto sai dela.
 *
 * Rascunho é gravado a cada edição, então todo campo tem default e a forma aceita o que ainda
 * está pela metade. O que falta para enviar quem diz é `checkDemand`, não o parse.
 */

import { z } from "zod"

const text = (max: number) => z.string().max(max).default("")
const id = z.string().min(1).max(64)
/** Data de calendário `YYYY-MM-DD`, sem fuso: é prazo de processo, não instante. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const money = z.number().finite().nonnegative()

export const DEMAND_SCHEMA_VERSION = 1

// ─────────────────────────────────────────────────────────────────────────────
// 1. Contexto da decisão
// ─────────────────────────────────────────────────────────────────────────────

export const DemandContextSchema = z.object({
	/** O que acontece hoje, em fatos: o que falta, o que falha, desde quando. */
	problem: text(6000),
	/** Quem sofre o problema: setor, efetivo, usuários, bens expostos. */
	affected: text(2000),
	/** O que acontece se nada for feito, e em quanto tempo. */
	consequence: text(3000),
	/** O que tornou a necessidade atual: fato novo, cessão de área, quebra, norma. */
	trigger: text(2000),
	/** Até quando a contratação precisa estar concluída. */
	deadline: isoDate.nullable().default(null),
	deadlineReason: text(1000),
	/** A necessidade surgiu depois do prazo do PCA: vai para o Acompanhamento do DFD. */
	supervening: z.boolean().default(false),
	priority: z.enum(["baixa", "media", "alta"]).default("media"),
	priorityReason: text(1000),
})
export type DemandContext = z.infer<typeof DemandContextSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 2. Objetivos (fundamentais e meio) e atributos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Como se mede o atendimento de um objetivo fundamental.
 *
 * `natural`: medida direta (m² vedados, horas de indisponibilidade). `constructed`: escala
 * definida para o caso (0 = sem vedação, 1 = parcial, 2 = total). `proxy`: medida indireta,
 * quando a direta não existe (ocorrências registradas de infiltração).
 */
export const ObjectiveAttributeSchema = z.object({
	name: text(300),
	kind: z.enum(["natural", "constructed", "proxy"]).default("natural"),
	/** Situação atual no atributo. */
	baseline: text(300),
	/** Meta que a contratação precisa atingir. */
	target: text(300),
})
export type ObjectiveAttribute = z.infer<typeof ObjectiveAttributeSchema>

export const ObjectiveSchema = z.object({
	id,
	text: text(500),
	/**
	 * `fundamental`: vale por si ("proteger os equipamentos do laboratório").
	 * `means`: vale porque leva a um fundamental ("janelas com vedação contra chuva").
	 * A pergunta que separa os dois é "por que isso importa?": se a resposta for outro
	 * objetivo, este é meio.
	 */
	kind: z.enum(["fundamental", "means"]).default("fundamental"),
	/** Resposta a "por que isso importa?". */
	why: text(1000),
	/** Objetivos fundamentais que este objetivo-meio sustenta. */
	supports: z.array(id).max(20).default([]),
	attribute: ObjectiveAttributeSchema.default(() => ObjectiveAttributeSchema.parse({})),
})
export type Objective = z.infer<typeof ObjectiveSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 3. Alternativas
// ─────────────────────────────────────────────────────────────────────────────

export const ALTERNATIVE_KINDS = ["contratar", "ata_vigente", "meios_proprios", "nao_fazer", "outra"] as const
export type AlternativeKind = (typeof ALTERNATIVE_KINDS)[number]

export const RATINGS = ["atende", "parcial", "nao_atende"] as const
export type Rating = (typeof RATINGS)[number]

export const AlternativeSchema = z.object({
	id,
	name: text(300),
	kind: z.enum(ALTERNATIVE_KINDS).default("contratar"),
	description: text(3000),
	/** Nota por objetivo fundamental (id → nota). */
	ratings: z.record(z.string(), z.enum(RATINGS)).default({}),
	/** Custo aproximado, só para comparar; o valor estimado sai da pesquisa de preços. */
	estimatedCost: money.nullable().default(null),
	/** Por que foi descartada, ou o que a torna preferível. */
	notes: text(2000),
})
export type Alternative = z.infer<typeof AlternativeSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 4. Solução
// ─────────────────────────────────────────────────────────────────────────────

export const NATURES = ["bem", "servico", "servico_engenharia", "obra", "tic"] as const
export type Nature = (typeof NATURES)[number]

export const REQUIREMENT_KINDS = ["tecnico", "entrega", "garantia", "sustentabilidade", "qualificacao", "outro"] as const
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number]

export const RequirementSchema = z.object({
	id,
	text: text(1500),
	kind: z.enum(REQUIREMENT_KINDS).default("tecnico"),
	/** Objetivo que o requisito realiza: é o que impede requisito sem motivo. */
	objectiveId: id.nullable().default(null),
})
export type Requirement = z.infer<typeof RequirementSchema>

export const ExclusionSchema = z.object({
	id,
	text: text(500),
	reason: text(1000),
})
export type Exclusion = z.infer<typeof ExclusionSchema>

export const SolutionSchema = z.object({
	nature: z.enum(NATURES).nullable().default(null),
	/** O objeto em uma frase, como vai no DFD e no cabeçalho de cada peça. */
	object: text(600),
	description: text(6000),
	requirements: z.array(RequirementSchema).max(60).default([]),
	/** O que fica fora do objeto, com o motivo (vai ao ETP e ao TR). */
	exclusions: z.array(ExclusionSchema).max(30).default([]),
	parcelamento: z
		.object({
			decision: z.enum(["por_item", "grupo_unico", "item_unico"]).default("por_item"),
			rationale: text(2000),
		})
		.default(() => ({ decision: "por_item" as const, rationale: "" })),
	deliveryPlace: text(500),
	deliveryDays: z.number().int().positive().max(3650).nullable().default(null),
	warrantyMonths: z.number().int().nonnegative().max(240).nullable().default(null),
	/** Fornecedor exclusivo: leva à inexigibilidade (art. 74, I) em vez da dispensa. */
	exclusivity: z
		.object({
			isExclusive: z.boolean().default(false),
			supplier: text(300),
			evidence: text(1000),
		})
		.default(() => ({ isExclusive: false, supplier: "", evidence: "" })),
	sustainability: text(2000),
})
export type Solution = z.infer<typeof SolutionSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 5. Itens
// ─────────────────────────────────────────────────────────────────────────────

export const ItemSchema = z.object({
	id,
	description: text(1000),
	catalogKind: z.enum(["CATMAT", "CATSER"]).default("CATMAT"),
	/** Código do Catálogo de Materiais e Serviços (só dígitos). */
	catalogCode: z
		.string()
		.regex(/^\d{0,9}$/)
		.default(""),
	unit: text(40),
	quantity: z.number().finite().nonnegative().nullable().default(null),
	/** Memória de cálculo da quantidade (art. 18, § 1º, IV). */
	quantityRationale: text(2000),
	/** Natureza de despesa, `3.3.90.30.24`. */
	expenseNature: z
		.string()
		.regex(/^(\d\.\d\.\d{2}\.\d{2}(\.\d{2})?)?$/)
		.default(""),
})
export type Item = z.infer<typeof ItemSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 6. Pesquisa de preços
// ─────────────────────────────────────────────────────────────────────────────

/** Fontes do art. 5º da IN SEGES/ME nº 65/2021. */
export const QUOTE_SOURCES = ["proposta", "painel_precos", "contratacao_similar", "midia_especializada", "nota_fiscal", "tabela_referencia"] as const
export type QuoteSource = (typeof QUOTE_SOURCES)[number]

export const QuoteSchema = z.object({
	id,
	source: z.enum(QUOTE_SOURCES).default("proposta"),
	supplier: text(300),
	/** CNPJ só com dígitos. */
	supplierDocument: z
		.string()
		.regex(/^\d{0,14}$/)
		.default(""),
	/** E-mail de quem respondeu: domínio igual entre "concorrentes" é sinal de cotação dependente. */
	contactEmail: text(200),
	reference: text(300),
	date: isoDate.nullable().default(null),
	validUntil: isoDate.nullable().default(null),
	/** Preço unitário por item (id do item → valor). Item sem preço não foi cotado. */
	prices: z.record(z.string(), money).default({}),
	/** Cotação afastada da estimativa, com o motivo (fica registrada, não some). */
	excludedReason: text(1000),
})
export type Quote = z.infer<typeof QuoteSchema>

export const PRICE_METHODS = ["auto", "media", "mediana", "menor"] as const
export type PriceMethod = (typeof PRICE_METHODS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// 7. Riscos
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_PHASES = ["planejamento", "selecao", "gestao"] as const
export type RiskPhase = (typeof RISK_PHASES)[number]

const scale = z.number().int().min(1).max(5)

export const RiskSchema = z.object({
	id,
	/** Evento + onde ou em quê + consequência. */
	risk: text(500),
	cause: text(1500),
	phase: z.enum(RISK_PHASES).default("gestao"),
	probability: scale.nullable().default(null),
	impact: scale.nullable().default(null),
	allocatedTo: z.enum(["contratada", "administracao"]).default("contratada"),
	/** Por que cabe a essa parte, consequência contratual e fronteira com o risco vizinho. */
	allocationDetail: text(2000),
	damage: text(1500),
	preventiveAction: text(1500),
	preventiveOwner: text(200),
	contingencyAction: text(1500),
	contingencyOwner: text(200),
})
export type Risk = z.infer<typeof RiskSchema>

// ─────────────────────────────────────────────────────────────────────────────
// 8. Planejamento e equipe
// ─────────────────────────────────────────────────────────────────────────────

export const TEAM_ROLES = ["requisitante", "tecnica", "planejamento", "fiscal", "gestor"] as const
export type TeamRole = (typeof TEAM_ROLES)[number]

/**
 * Integrante da equipe. Sem CPF de propósito: o Compras.gov.br o exige nos Responsáveis, mas
 * guardá-lo aqui seria dado pessoal sem necessidade (LGPD). O guia lembra de tê-lo em mãos.
 */
export const TeamMemberSchema = z.object({
	id,
	name: text(200),
	position: text(200),
	role: z.enum(TEAM_ROLES).default("requisitante"),
})
export type TeamMember = z.infer<typeof TeamMemberSchema>

export const PlanningSchema = z.object({
	nup: text(40),
	uasg: z
		.string()
		.regex(/^\d{0,6}$/)
		.default(""),
	dfdNumber: text(20),
	/** Identificador da contratação no PCA (PNCP). */
	pcaId: text(80),
	budget: z
		.object({
			fonte: text(40),
			ptres: text(40),
			pi: text(40),
			acao: text(80),
		})
		.default(() => ({ fonte: "", ptres: "", pi: "", acao: "" })),
	/** Já gasto no exercício com objeto da mesma natureza: soma no limite do art. 75, § 1º. */
	sameNatureSpent: money.default(0),
	related: z
		.array(
			z.object({
				id,
				description: text(500),
				relation: z.enum(["correlata", "interdependente"]).default("interdependente"),
			})
		)
		.max(20)
		.default([]),
	/** Providências a adotar antes da contratação (ETP, campo 13). */
	priorActions: z
		.array(
			z.object({
				id,
				action: text(500),
				owner: text(200),
				precedes: text(200),
			})
		)
		.max(20)
		.default([]),
	environmentalImpacts: text(2000),
	team: z.array(TeamMemberSchema).max(20).default([]),
})
export type Planning = z.infer<typeof PlanningSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Demanda
// ─────────────────────────────────────────────────────────────────────────────

export const DemandPayloadSchema = z.object({
	version: z.literal(DEMAND_SCHEMA_VERSION).default(DEMAND_SCHEMA_VERSION),
	/** Área requisitante como aparece no sistema (ex.: "Escritório do IEFA em São José dos Campos"). */
	requestingArea: text(300),
	context: DemandContextSchema.default(() => DemandContextSchema.parse({})),
	objectives: z.array(ObjectiveSchema).max(30).default([]),
	alternatives: z.array(AlternativeSchema).max(12).default([]),
	chosenAlternativeId: id.nullable().default(null),
	choiceRationale: text(3000),
	solution: SolutionSchema.default(() => SolutionSchema.parse({})),
	items: z.array(ItemSchema).max(200).default([]),
	quotes: z.array(QuoteSchema).max(40).default([]),
	priceMethod: z.enum(PRICE_METHODS).default("auto"),
	risks: z.array(RiskSchema).max(20).default([]),
	planning: PlanningSchema.default(() => PlanningSchema.parse({})),
})
export type DemandPayload = z.infer<typeof DemandPayloadSchema>

/** Demanda vazia, pronta para o primeiro passo. */
export function emptyDemand(): DemandPayload {
	return DemandPayloadSchema.parse({})
}

/** Id curto para item novo de lista (objetivo, alternativa, risco…). Só precisa ser único na demanda. */
export function newId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}
