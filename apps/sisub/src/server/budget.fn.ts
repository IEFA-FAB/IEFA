/**
 * @module budget.fn
 * Crédito disponível (Fase 2 da execução orçamentária): snapshot do SIAFI por
 * classificação + comprometimento local FILTRADO pela classificação + saldo
 * projetado; a verificação (não-bloqueante) ao registrar a NE; e as Notas de
 * Crédito (NC) que explicam o crédito recebido.
 * CLIENT: getServerClient (service role, schemas finance/siafi_integration).
 * AUTH: `unit` escopado — nível 1 leitura, 2 aplicar snapshot de lote e registrar NC.
 * TABLES: finance.budget_credit, finance.credit_note, finance.empenho(_event),
 *   finance.v_empenho_vigente (leitura), siafi_integration.*
 * @domain core
 * @migration 20260731130000_finance_budget_credit, 20260926216000_finance_compliance
 */

import type { TableRow } from "@iefa/database"
import {
	type BudgetProjection,
	type ClassifiedCreditCheck,
	type ClassifiedEmpenhoEntry,
	type CreditLineSnapshot,
	type CreditNoteEntry,
	checkCreditForClassifiedEmpenho,
	projectCreditLine,
	sumCreditNotesForLine,
} from "@iefa/sisub-domain"
import { getBrasiliaCurrentMonth, getBrasiliaToday } from "@iefa/sisub-domain/civil-date"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { selectColumns } from "@/lib/select-columns"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"
import { publicDbMessage } from "@/lib/db-error-message"

const finance = () => getServerClient("finance")
const siafi = () => getServerClient("siafi_integration")

const BUDGET_CREDIT_COLUMNS = [
	"id",
	"ug",
	"nd",
	"ptres",
	"fonte",
	"pi",
	"ugr",
	"competencia",
	"received_credit",
	"empenhado_siafi",
	"available_credit_siafi",
	"snapshot_at",
] as const

type BudgetCreditDbRow = Pick<TableRow<"finance", "budget_credit">, (typeof BUDGET_CREDIT_COLUMNS)[number]>

const CREDIT_NOTE_COLUMNS = [
	"id",
	"number",
	"issued_on",
	"kind",
	"issuer_ug",
	"beneficiary_ug",
	"budget_sphere",
	"ptres",
	"fonte",
	"nd",
	"pi",
	"ugr",
	"amount",
	"notes",
	"origin",
	"created_at",
] as const

/**
 * Linha de `finance.credit_note` como `CREDIT_NOTE_COLUMNS` a lê; `kind`, `budget_sphere` e `origin`
 * estreitados aos valores dos CHECKs do banco.
 */
export type CreditNoteRow = Omit<Pick<TableRow<"finance", "credit_note">, (typeof CREDIT_NOTE_COLUMNS)[number]>, "kind" | "budget_sphere" | "origin"> & {
	kind: "descentralizacao" | "anulacao"
	budget_sphere: "1" | "2" | "3" | null
	origin: "manual" | "siafi"
}

export interface BudgetCreditLine extends BudgetProjection {
	id: string
	ug: string | null
	nd: string
	ptres: string | null
	fonte: string | null
	pi: string | null
	ugr: string | null
	competencia: string
	/** Σ das NC registradas no sisub que alimentam a linha no exercício (conferência, não saldo). */
	notasCredito: number
}

function toCreditLineSnapshot(row: BudgetCreditDbRow): CreditLineSnapshot & { id: string; pi: string | null; ugr: string | null } {
	return {
		id: row.id,
		ug: row.ug,
		nd: row.nd,
		ptres: row.ptres,
		fonte: row.fonte,
		pi: row.pi ?? null,
		ugr: row.ugr ?? null,
		competencia: row.competencia,
		receivedCredit: Number(row.received_credit),
		empenhadoSiafi: Number(row.empenhado_siafi),
		availableCreditSiafi: Number(row.available_credit_siafi),
		snapshotAt: row.snapshot_at,
	}
}

/**
 * Empenhos da unidade com classificação, valor VIGENTE e eventos — a base do
 * comprometimento filtrado. Anulados entram também: a anulação posterior ao
 * snapshot devolve crédito à linha.
 */
async function fetchClassifiedEmpenhos(unitId: number): Promise<ClassifiedEmpenhoEntry[]> {
	const fin = finance()
	const [{ data: rows, error }, { data: vigentes, error: vigenteError }] = await Promise.all([
		fin
			.from("empenho")
			.select("id, data_empenho, status, nd, ptres, fonte, issuer_ug, exercicio, empenho_event(tipo, valor, data)")
			.eq("unit_id", unitId)
			.order("data_empenho", { ascending: false })
			.limit(2000),
		fin.from("v_empenho_vigente").select("empenho_id, valor_vigente").eq("unit_id", unitId).limit(2000),
	])
	if (error) throw new Error(`Erro ao consultar empenhos: ${publicDbMessage(error)}`)
	if (vigenteError) throw new Error(`Erro ao consultar o valor vigente dos empenhos: ${publicDbMessage(vigenteError)}`)
	const vigenteById = new Map((vigentes ?? []).map((row) => [row.empenho_id, Number(row.valor_vigente)]))
	return (rows ?? []).map((row) => ({
		id: row.id,
		dataEmpenho: row.data_empenho,
		status: row.status,
		nd: row.nd,
		ptres: row.ptres,
		fonte: row.fonte,
		ug: row.issuer_ug,
		exercicio: row.exercicio,
		valorVigente: vigenteById.get(row.id) ?? 0,
		events: (row.empenho_event ?? []).map((event) => ({ tipo: event.tipo, valor: Number(event.valor), data: event.data })),
	}))
}

async function fetchCreditNoteEntries(unitId: number): Promise<CreditNoteEntry[]> {
	const { data, error } = await finance()
		.from("credit_note")
		.select("kind, amount, issued_on, beneficiary_ug, nd, ptres, fonte")
		.eq("unit_id", unitId)
		.limit(2000)
	if (error) throw new Error(`Erro ao consultar notas de crédito: ${publicDbMessage(error)}`)
	return (data ?? []).map((row) => ({
		tipo: row.kind,
		valor: Number(row.amount),
		dataEmissao: row.issued_on,
		ugFavorecida: row.beneficiary_ug,
		nd: row.nd,
		ptres: row.ptres,
		fonte: row.fonte,
	}))
}

/** Linhas de crédito da unidade com as três grandezas já projetadas, por classificação. */
export const fetchBudgetCreditFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			competencia: z
				.string()
				.regex(/^\d{4}-\d{2}$/)
				.optional(),
		})
	)
	.handler(async ({ data }): Promise<BudgetCreditLine[]> => {
		await requireUnitScope(1, data.unitId)

		let query = finance()
			.from("budget_credit")
			.select(selectColumns(BUDGET_CREDIT_COLUMNS))
			.eq("unit_id", data.unitId)
			.order("competencia", { ascending: false })
			.order("nd")
		if (data.competencia) query = query.eq("competencia", `${data.competencia}-01`)

		const { data: rows, error } = await query
		if (error) throw new Error(`Erro ao consultar crédito: ${publicDbMessage(error)}`)
		if ((rows ?? []).length === 0) return []

		const [empenhos, notes] = await Promise.all([fetchClassifiedEmpenhos(data.unitId), fetchCreditNoteEntries(data.unitId)])
		const now = Date.now()
		return (rows ?? []).map((row) => {
			const line = toCreditLineSnapshot(row)
			return {
				...line,
				...projectCreditLine(line, empenhos, now),
				notasCredito: sumCreditNotesForLine(line, notes),
			}
		})
	})

const creditCheckInput = z.object({
	unitId: z.number().int().positive(),
	valor: z.number().positive(),
	nd: z.string().trim().min(1).nullable().optional(),
	ptres: z.string().trim().nullable().optional(),
	fonte: z.string().trim().nullable().optional(),
	/** UG emitente da NE; sem ela, qualquer UG da unidade. */
	ug: z.string().trim().nullable().optional(),
	/** `YYYY-MM-DD` da NE; decide o exercício e se o comprometimento é anterior ao snapshot. */
	dataEmpenho: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	exercicio: z.number().int().optional(),
	/** A NE já registrada que está sendo completada: fica fora do próprio comprometimento. */
	excludeEmpenhoId: z.uuid().optional(),
})

export type BudgetCheckForEmpenhoInput = z.infer<typeof creditCheckInput>

/**
 * Conferência de crédito ao registrar (ou completar) uma NE — AVISO, nunca bloqueio.
 *
 * O sisub registra o ato já praticado no SIAFI; a vedação de empenho sem crédito
 * (Lei 4.320, art. 59) vira alerta com a classificação e a idade do snapshot. A
 * linha conferida é a da classificação da NE (UG/ND/PTRES/fonte/exercício), e o
 * comprometimento soma só os empenhos DAQUELA classificação, pelo valor vigente.
 *
 * Uso pela tela de NE: `useBudgetCheckForEmpenho` (`@/hooks/data/useBudgetCheck`).
 */
export const checkBudgetForEmpenhoFn = createServerFn({ method: "GET" })
	.validator(creditCheckInput)
	.handler(async ({ data }): Promise<ClassifiedCreditCheck> => {
		await requireUnitScope(1, data.unitId)

		const { data: rows, error } = await finance()
			.from("budget_credit")
			.select(selectColumns(BUDGET_CREDIT_COLUMNS))
			.eq("unit_id", data.unitId)
			.order("competencia", { ascending: false })
			.limit(500)
		if (error) throw new Error(`Erro ao consultar crédito: ${publicDbMessage(error)}`)
		const lines = (rows ?? []).map(toCreditLineSnapshot)

		const dataEmpenho = data.dataEmpenho ?? getBrasiliaToday()
		const empenhos = lines.length > 0 ? await fetchClassifiedEmpenhos(data.unitId) : []
		return checkCreditForClassifiedEmpenho(
			data.valor,
			{
				nd: data.nd ?? null,
				ptres: data.ptres || null,
				fonte: data.fonte || null,
				ug: data.ug || null,
				exercicio: data.exercicio ?? Number(dataEmpenho.substring(0, 4)),
				dataEmpenho,
			},
			lines,
			empenhos,
			Date.now(),
			{ excludeEmpenhoId: data.excludeEmpenhoId }
		)
	})

/**
 * Aplica um lote de crédito já parseado ao domínio: cada linha vira/substitui
 * o snapshot da classificação naquela competência (upsert por chave única).
 */
export const applyCreditBatchFn = createServerFn({ method: "POST" })
	.validator(z.object({ batchId: z.uuid() }))
	.handler(async ({ data }) => {
		const si = siafi()
		const { data: batch, error: batchError } = await si.from("import_batch").select("*").eq("id", data.batchId).single()
		if (batchError || !batch) throw new Error("Lote não encontrado")
		const ctx = await requireUnitScope(2, Number(batch.unit_id))
		if (batch.report_type !== "credito") throw new Error(`Este lote é do tipo "${batch.report_type}" — use a aplicação correspondente`)

		return withSensitiveAudit(
			"applyCreditBatchFn",
			ctx,
			async () => {
				// reserva sob advisory lock: dois cliques simultâneos não aplicam duas vezes
				const { error: claimError } = await si.rpc("claim_import_batch", { p_batch_id: data.batchId })
				if (claimError) throw new Error(publicDbMessage(claimError))

				const { data: rows } = await si.from("import_row").select("id, parsed").eq("batch_id", data.batchId).eq("parse_status", "parsed")
				const parsedRows = (rows ?? []) as { id: string; parsed: Record<string, unknown> }[]
				if (parsedRows.length === 0) throw new Error("Lote sem linhas válidas para aplicar")

				const competencia = batch.competencia ?? `${getBrasiliaCurrentMonth()}-01`
				const snapshotAt = new Date().toISOString()
				const payload = parsedRows.map(({ parsed }) => ({
					unit_id: batch.unit_id,
					ug: (parsed.ug as string) ?? null,
					nd: String(parsed.nd),
					ptres: (parsed.ptres as string) ?? null,
					fonte: (parsed.fonte as string) ?? null,
					// PI e UGR vêm quando o relatório os traz; fora da chave única nesta fase
					pi: (parsed.pi as string) ?? null,
					ugr: (parsed.ugr as string) ?? null,
					competencia,
					// `parsed.dotacao`/`parsed.saldo` são as colunas do relatório do Tesouro Gerencial
					// ("DOTAÇÃO ATUALIZADA", "SALDO"), como o parser as nomeia; no banco, crédito
					// recebido e crédito disponível.
					received_credit: Number(parsed.dotacao ?? 0),
					empenhado_siafi: Number(parsed.empenhado ?? 0),
					available_credit_siafi: Number(parsed.saldo ?? Number(parsed.dotacao ?? 0) - Number(parsed.empenhado ?? 0)),
					snapshot_at: snapshotAt,
					import_batch_id: data.batchId,
				}))

				const { error } = await finance().from("budget_credit").upsert(payload, { onConflict: "unit_id,ug,nd,ptres,fonte,competencia" })
				if (error) throw new Error(`Erro ao aplicar crédito: ${publicDbMessage(error)}`)

				await si.from("import_batch").update({ status: "applied", applied_rows: payload.length, applied_at: snapshotAt }).eq("id", data.batchId)
				return { applied: payload.length, competencia }
			},
			// O lote identifica o alvo; as linhas de crédito que ele gravou carregam
			// `import_batch_id` e voltam por ele.
			// `competencia` é a EFETIVA (a mesma que as linhas receberam, incluindo o mês
			// corrente quando o lote não a trazia). Gravar o `null` do lote diria que o
			// crédito não tem competência, quando ele tem — e é a competência que decide
			// a qual mês o dinheiro foi lançado.
			(result) => ({ batchId: data.batchId, unitId: Number(batch.unit_id), competencia: result.competencia, applied: result.applied })
		)
	})

// ============================================================================
// Notas de Crédito (NC)
// ============================================================================

/** NC da unidade, mais recentes primeiro. */
export const listCreditNotesFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive(), exercicio: z.number().int().optional() }))
	.handler(async ({ data }): Promise<CreditNoteRow[]> => {
		await requireUnitScope(1, data.unitId)
		let query = finance()
			.from("credit_note")
			.select(selectColumns(CREDIT_NOTE_COLUMNS))
			.eq("unit_id", data.unitId)
			.order("issued_on", { ascending: false })
			.order("created_at", { ascending: false })
			.limit(500)
		if (data.exercicio) query = query.gte("issued_on", `${data.exercicio}-01-01`).lte("issued_on", `${data.exercicio}-12-31`)
		const { data: rows, error } = await query
		if (error) throw new Error(`Erro ao listar notas de crédito: ${publicDbMessage(error)}`)
		return (rows ?? []).map((row) => ({
			...row,
			amount: Number(row.amount),
			kind: row.kind as CreditNoteRow["kind"],
			budget_sphere: row.budget_sphere as CreditNoteRow["budget_sphere"],
			origin: row.origin as CreditNoteRow["origin"],
		}))
	})

const optionalCode = (pattern: RegExp, message: string) =>
	z
		.string()
		.trim()
		.transform((value) => (value === "" ? null : value))
		.nullable()
		.optional()
		.refine((value) => value == null || pattern.test(value), message)

const optionalText = z
	.string()
	.trim()
	.transform((value) => (value === "" ? null : value))
	.nullable()
	.optional()

/** Registra a NC que chegou (ou a anulação dela). O ato é do SIAFI; aqui é registro. */
export const createCreditNoteFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			number: z.string().trim().min(1, "Informe o número da NC"),
			issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			kind: z.enum(["descentralizacao", "anulacao"]).default("descentralizacao"),
			issuerUg: optionalCode(/^\d{6}$/, "UG emitente tem 6 dígitos"),
			beneficiaryUg: optionalCode(/^\d{6}$/, "UG favorecida tem 6 dígitos"),
			budgetSphere: z.enum(["1", "2", "3"]).nullable().optional(),
			ptres: optionalText,
			fonte: optionalText,
			nd: optionalCode(/^\d{6}(\d{2})?$/, "ND com 6 ou 8 dígitos, sem pontos"),
			pi: optionalText,
			ugr: optionalText,
			amount: z.number().positive(),
			notes: optionalText,
		})
	)
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		const number = data.number.toUpperCase()

		return withSensitiveAudit(
			"createCreditNoteFn",
			ctx,
			async () => {
				const { data: row, error } = await finance()
					.from("credit_note")
					.insert({
						unit_id: data.unitId,
						number,
						issued_on: data.issuedOn,
						kind: data.kind,
						issuer_ug: data.issuerUg ?? null,
						beneficiary_ug: data.beneficiaryUg ?? null,
						budget_sphere: data.budgetSphere ?? null,
						ptres: data.ptres ?? null,
						fonte: data.fonte ?? null,
						nd: data.nd ?? null,
						pi: data.pi ?? null,
						ugr: data.ugr ?? null,
						amount: data.amount,
						notes: data.notes ?? null,
						origin: "manual",
						created_by: ctx.userId,
					})
					.select("id")
					.single()
				if (error || !row) {
					if (error?.code === "23505") throw new Error(`NC "${number}" já registrada para esta UG emitente`)
					throw new Error(`Erro ao registrar a nota de crédito: ${publicDbMessage(error)}`)
				}
				return { creditNoteId: row.id as string }
			},
			(result) => ({ creditNoteId: result.creditNoteId, unitId: data.unitId, number, kind: data.kind, amount: data.amount, nd: data.nd ?? null })
		)
	})

/**
 * Apaga uma NC registrada à mão por engano (número ou valor errado). A anulação de
 * uma NC verdadeira não é isto: é outra NC, do tipo `anulacao`.
 */
export const deleteCreditNoteFn = createServerFn({ method: "POST" })
	.validator(z.object({ unitId: z.number().int().positive(), creditNoteId: z.uuid() }))
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(2, data.unitId)
		const fin = finance()
		const { data: row, error } = await fin.from("credit_note").select("id, number, origin").eq("id", data.creditNoteId).eq("unit_id", data.unitId).maybeSingle()
		if (error) throw new Error(`Erro ao conferir a nota de crédito: ${publicDbMessage(error)}`)
		if (!row) throw new Error("Nota de crédito não encontrada nesta unidade")
		if (row.origin !== "manual") throw new Error("NC importada do SIAFI não se apaga aqui: registre a NC de anulação")

		return withSensitiveAudit(
			"deleteCreditNoteFn",
			ctx,
			async () => {
				// `origin = 'manual'` NA escrita, não só na leitura: a NC que o import do SIAFI
				// completou entre a conferência e o delete não sai por aqui.
				const { data: deleted, error: deleteError } = await fin
					.from("credit_note")
					.delete()
					.eq("id", data.creditNoteId)
					.eq("unit_id", data.unitId)
					.eq("origin", "manual")
					.select("id")
				if (deleteError) throw new Error(`Erro ao apagar a nota de crédito: ${publicDbMessage(deleteError)}`)
				if ((deleted ?? []).length === 0) throw new Error("NC importada do SIAFI não se apaga aqui: registre a NC de anulação")
			},
			() => ({ creditNoteId: data.creditNoteId, unitId: data.unitId, number: row.number as string })
		)
	})
