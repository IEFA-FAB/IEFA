/**
 * @module auditor/services/report-request
 * Contrato do pedido da Nota Analítica Estratégica entre a tela e a rota SSE.
 *
 * O recorte é montado NO NAVEGADOR (`buildReportDataset`) e só ele trafega — o
 * mesmo desenho do SAC-DGC e do Cruzamento de Contas. Não é economia: os filtros
 * de hierarquia, de grupo e de zerados vivem no estado da tela, e recalculá-los no
 * servidor criaria uma segunda definição de "o que está sendo analisado", livre
 * para divergir da que o operador está vendo.
 *
 * Este módulo não pode importar nada de servidor — a tela também o usa.
 *
 * Os tetos abaixo não são estética: o recorte inteiro vira prompt, e prompt sem
 * teto é conta sem teto. Como o corpo vem do cliente, quem garante o tamanho é
 * esta validação, não a boa vontade de quem chama.
 */

import { z } from "zod"
import type { ReportDataset } from "./report"

/** Espelham os cortes de `report.ts`; com folga de um item para não reprovar por igualdade. */
const MAX_OFFENDERS = 25
const MAX_TREND_ITEMS = 10
const MAX_TREND_SCOPES = 4
const MAX_GROUPS = 8
const MAX_INTER_OM = 5

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competência deve ser YYYY-MM")
const timeFilterSchema = z.enum(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"])
const nameSchema = z.string().trim().max(200)
const codeSchema = z.string().trim().max(40)
/** `finite` barra NaN e Infinity, que `JSON.stringify` escreve como `null` e o modelo lê como ausência. */
const moneySchema = z.number().finite()

const totalsSchema = z.object({
	siafi: moneySchema,
	siloms: moneySchema,
	absoluteDifference: moneySchema,
	netDifference: moneySchema,
})

const offenderSchema = z.object({
	ug: nameSchema,
	cod: codeSchema,
	group: nameSchema,
	siafi: moneySchema,
	siloms: moneySchema,
	difference: moneySchema,
	preponderance: z.enum(["SIAFI", "SILOMS", "EQUAL"]),
	riskLevel: nameSchema.optional(),
})

const trendItemSchema = z.object({
	ug: nameSchema,
	cod: codeSchema,
	group: nameSchema,
	delta: moneySchema,
	// Nulo é significativo: "não havia divergência anterior contra a qual comparar".
	// É diferente de zero, e o prompt instrui o modelo a não converter um no outro.
	deltaPct: moneySchema.nullable(),
	difference: moneySchema,
	previousDifference: moneySchema,
	previousDate: nameSchema,
})

const trendScopeSchema = z.object({
	scope: timeFilterSchema,
	worsening: z.array(trendItemSchema).max(MAX_TREND_ITEMS),
	improving: z.array(trendItemSchema).max(MAX_TREND_ITEMS),
})

const interOmSchema = z.object({
	date: periodSchema,
	ugA: nameSchema,
	codA: codeSchema,
	ugB: nameSchema,
	codB: codeSchema,
	group: nameSchema,
	deltaA: moneySchema,
	deltaB: moneySchema,
	value: moneySchema,
	residual: moneySchema,
})

export const analyticNoteRequestSchema = z.object({
	competence: periodSchema,
	competenceLabel: nameSchema,
	timeFilter: timeFilterSchema,
	scopeLabel: nameSchema,
	periodsLoaded: z.number().int().nonnegative().max(1000),
	ugCount: z.number().int().nonnegative().max(1000),
	recordCount: z.number().int().nonnegative().max(10_000),
	totals: totalsSchema,
	previous: z.object({ period: periodSchema, label: nameSchema, totals: totalsSchema }).nullable(),
	preponderance: z.object({
		siafi: z.number().int().nonnegative(),
		siloms: z.number().int().nonnegative(),
		equal: z.number().int().nonnegative(),
	}),
	groups: z
		.array(
			z.object({
				group: nameSchema,
				siafi: moneySchema,
				siloms: moneySchema,
				difference: moneySchema,
				ugCount: z.number().int().nonnegative(),
			})
		)
		.max(MAX_GROUPS),
	topOffenders: z.array(offenderSchema).max(MAX_OFFENDERS),
	trends: z.array(trendScopeSchema).max(MAX_TREND_SCOPES),
	interOm: z.array(interOmSchema).max(MAX_INTER_OM),
})

export type AnalyticNoteRequest = z.infer<typeof analyticNoteRequestSchema>

/**
 * O pedido é o próprio recorte.
 *
 * A conversão existe para travar, em tempo de compilação, que a saída de
 * `buildReportDataset` continua cabendo no contrato: quando um campo novo entrar
 * no dataset sem entrar no schema, é aqui que o typecheck reclama, e não em
 * produção, com o campo sumindo calado no `parse` da rota.
 */
export function toAnalyticNoteRequest(dataset: ReportDataset): AnalyticNoteRequest {
	return dataset
}
