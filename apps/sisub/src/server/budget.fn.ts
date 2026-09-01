/**
 * @module budget.fn
 * Crédito disponível (Fase 2 da execução orçamentária): snapshot do SIAFI por
 * classificação + comprometimento local + saldo projetado, e a verificação
 * (não-bloqueante) antes de empenhar.
 * CLIENT: getServerClient (service role, schemas finance/siafi_integration).
 * AUTH: `unit` escopado — nível 1 leitura, 2 aplicar snapshot de lote.
 * TABLES: finance.budget_credit, finance.empenho (leitura), siafi_integration.*
 * @domain core
 * @migration 20260731130000_finance_budget_credit
 */

import { type BudgetProjection, checkCreditForEmpenho, type LocalEmpenhoEntry, projectBudget } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const finance = () => getServerClient("finance") as unknown as LooseClient
const siafi = () => getServerClient("siafi_integration") as unknown as LooseClient

export interface BudgetCreditLine extends BudgetProjection {
	id: string
	ug: string | null
	nd: string
	ptres: string | null
	fonte: string | null
	competencia: string
}

/** Empenhos ativos da unidade — base do comprometimento local. */
async function fetchLocalEmpenhos(unitId: number): Promise<LocalEmpenhoEntry[]> {
	const { data } = await finance().from("empenho").select("data_empenho, valor_total, status").eq("unit_id", unitId).eq("status", "ativo").limit(1000)
	return (data ?? []).map((row: { data_empenho: string; valor_total: number; status: string }) => ({
		dataEmpenho: row.data_empenho,
		valor: Number(row.valor_total ?? 0),
		status: row.status,
	}))
}

/** Linhas de crédito da unidade com as três grandezas já projetadas. */
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
			.select("id, ug, nd, ptres, fonte, competencia, dotacao, empenhado_siafi, saldo_siafi, snapshot_at")
			.eq("unit_id", data.unitId)
			.order("competencia", { ascending: false })
			.order("nd")
		if (data.competencia) query = query.eq("competencia", `${data.competencia}-01`)

		const { data: rows, error } = await query
		if (error) throw new Error(`Erro ao consultar crédito: ${error.message}`)
		if ((rows ?? []).length === 0) return []

		const empenhos = await fetchLocalEmpenhos(data.unitId)
		return (rows ?? []).map(
			(row: {
				id: string
				ug: string | null
				nd: string
				ptres: string | null
				fonte: string | null
				competencia: string
				dotacao: number
				empenhado_siafi: number
				saldo_siafi: number
				snapshot_at: string
			}) => ({
				id: row.id,
				ug: row.ug,
				nd: row.nd,
				ptres: row.ptres,
				fonte: row.fonte,
				competencia: row.competencia,
				...projectBudget(
					{
						dotacao: Number(row.dotacao),
						empenhadoSiafi: Number(row.empenhado_siafi),
						saldoSiafi: Number(row.saldo_siafi),
						snapshotAt: row.snapshot_at,
					},
					empenhos
				),
			})
		)
	})

/**
 * Verificação de crédito antes de registrar empenho — ALERTA, nunca bloqueio
 * (o snapshot pode estar defasado; a decisão é do ordenador).
 */
export const checkBudgetForEmpenhoFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			valor: z.number().positive(),
			nd: z.string().optional(),
			ptres: z.string().optional(),
			fonte: z.string().optional(),
		})
	)
	.handler(async ({ data }) => {
		await requireUnitScope(1, data.unitId)

		let query = finance()
			.from("budget_credit")
			.select("dotacao, empenhado_siafi, saldo_siafi, snapshot_at")
			.eq("unit_id", data.unitId)
			.order("competencia", { ascending: false })
			.limit(1)
		if (data.nd) query = query.eq("nd", data.nd)
		if (data.ptres) query = query.eq("ptres", data.ptres)
		if (data.fonte) query = query.eq("fonte", data.fonte)

		const { data: rows } = await query
		const row = (rows ?? [])[0]
		if (!row) return checkCreditForEmpenho(data.valor, null)

		const empenhos = await fetchLocalEmpenhos(data.unitId)
		const projection = projectBudget(
			{
				dotacao: Number(row.dotacao),
				empenhadoSiafi: Number(row.empenhado_siafi),
				saldoSiafi: Number(row.saldo_siafi),
				snapshotAt: row.snapshot_at,
			},
			empenhos
		)
		return checkCreditForEmpenho(data.valor, projection)
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
		await requireUnitScope(2, Number(batch.unit_id))
		if (batch.report_type !== "credito") throw new Error(`Este lote é do tipo "${batch.report_type}" — use a aplicação correspondente`)
		// reserva sob advisory lock: dois cliques simultâneos não aplicam duas vezes
		const { error: claimError } = await si.rpc("claim_import_batch", { p_batch_id: data.batchId })
		if (claimError) throw new Error(claimError.message)

		const { data: rows } = await si.from("import_row").select("id, parsed").eq("batch_id", data.batchId).eq("parse_status", "parsed")
		const parsedRows = (rows ?? []) as { id: string; parsed: Record<string, unknown> }[]
		if (parsedRows.length === 0) throw new Error("Lote sem linhas válidas para aplicar")

		const competencia = batch.competencia ?? `${new Date().toISOString().substring(0, 7)}-01`
		const snapshotAt = new Date().toISOString()
		const payload = parsedRows.map(({ parsed }) => ({
			unit_id: batch.unit_id,
			ug: (parsed.ug as string) ?? null,
			nd: String(parsed.nd),
			ptres: (parsed.ptres as string) ?? null,
			fonte: (parsed.fonte as string) ?? null,
			competencia,
			dotacao: Number(parsed.dotacao ?? 0),
			empenhado_siafi: Number(parsed.empenhado ?? 0),
			saldo_siafi: Number(parsed.saldo ?? Number(parsed.dotacao ?? 0) - Number(parsed.empenhado ?? 0)),
			snapshot_at: snapshotAt,
			import_batch_id: data.batchId,
		}))

		const { error } = await finance().from("budget_credit").upsert(payload, { onConflict: "unit_id,ug,nd,ptres,fonte,competencia" })
		if (error) throw new Error(`Erro ao aplicar crédito: ${error.message}`)

		await si.from("import_batch").update({ status: "applied", applied_rows: payload.length, applied_at: snapshotAt }).eq("id", data.batchId)
		return { applied: payload.length }
	})
