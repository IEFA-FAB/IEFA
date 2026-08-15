/**
 * @module empenho.fn
 * Empenho como documento orçamentário (Fase 3): classificação completa,
 * reforço/anulação por EVENTO (o valor nunca é editado) e saldos derivados
 * da view finance.v_empenho_saldo. Inscrição em restos a pagar é ação
 * explícita no encerramento do exercício.
 * CLIENT: getServerClient (service role, schema finance).
 * AUTH: `unit` escopado — 1 leitura, 2 lançar evento, 3 encerrar exercício.
 * TABLES: finance.empenho, empenho_event, v_empenho_saldo.
 * @domain core
 * @migration 20260731140000_finance_empenho_document
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen
type LooseClient = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

const finance = () => getServerClient("finance") as unknown as LooseClient

export interface EmpenhoSaldo {
	valor_original: number
	ajustes: number
	valor_vigente: number
	valor_liquidado: number
	valor_pago: number
	saldo_a_liquidar: number
	valor_a_pagar: number
}

export interface EmpenhoRow extends Partial<EmpenhoSaldo> {
	id: string
	numero_empenho: string
	data_empenho: string
	tipo: string | null
	favorecido_cnpj: string | null
	favorecido_nome: string | null
	nd: string | null
	ptres: string | null
	fonte: string | null
	exercicio: number | null
	status: string
	origem: string
	rp_inscrito: boolean
	rp_tipo: string | null
}

/** Saldos por empenho (view única — mesma fonte do painel da ATA). */
async function fetchSaldos(empenhoIds: string[]): Promise<Map<string, EmpenhoSaldo>> {
	const map = new Map<string, EmpenhoSaldo>()
	if (empenhoIds.length === 0) return map
	const { data } = await finance().from("v_empenho_saldo").select("*").in("empenho_id", empenhoIds)
	for (const row of data ?? []) {
		map.set(row.empenho_id, {
			valor_original: Number(row.valor_original ?? 0),
			ajustes: Number(row.ajustes ?? 0),
			valor_vigente: Number(row.valor_vigente ?? 0),
			valor_liquidado: Number(row.valor_liquidado ?? 0),
			valor_pago: Number(row.valor_pago ?? 0),
			saldo_a_liquidar: Number(row.saldo_a_liquidar ?? 0),
			valor_a_pagar: Number(row.valor_a_pagar ?? 0),
		})
	}
	return map
}

export const listEmpenhosFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			unitId: z.number().int().positive(),
			exercicio: z.number().int().optional(),
			nd: z.string().optional(),
			status: z.enum(["ativo", "anulado"]).optional(),
		})
	)
	.handler(async ({ data }): Promise<EmpenhoRow[]> => {
		await requireUnitScope(1, data.unitId)

		let query = finance()
			.from("empenho")
			.select("id, numero_empenho, data_empenho, tipo, favorecido_cnpj, favorecido_nome, nd, ptres, fonte, exercicio, status, origem, rp_inscrito, rp_tipo")
			.eq("unit_id", data.unitId)
			.order("data_empenho", { ascending: false })
			.limit(200)
		if (data.exercicio) query = query.eq("exercicio", data.exercicio)
		if (data.nd) query = query.eq("nd", data.nd)
		if (data.status) query = query.eq("status", data.status)

		const { data: rows, error } = await query
		if (error) throw new Error(`Erro ao listar empenhos: ${error.message}`)
		const empenhos = (rows ?? []) as EmpenhoRow[]
		const saldos = await fetchSaldos(empenhos.map((e) => e.id))
		return empenhos.map((empenho) => ({ ...empenho, ...saldos.get(empenho.id) }))
	})

/** Detalhe com histórico de eventos e saldos. */
export const fetchEmpenhoFn = createServerFn({ method: "GET" })
	.validator(z.object({ empenhoId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const fin = finance()
		const { data: empenho, error } = await fin.from("empenho").select("*").eq("id", data.empenhoId).single()
		if (error || !empenho) throw new Error("Empenho não encontrado")
		await requireUnitScope(1, Number(empenho.unit_id))

		const [{ data: events }, saldos] = await Promise.all([
			fin.from("empenho_event").select("*").eq("empenho_id", data.empenhoId).order("data", { ascending: false }),
			fetchSaldos([data.empenhoId]),
		])
		return { ...empenho, events: events ?? [], saldo: saldos.get(data.empenhoId) ?? null }
	})

/** Atualiza a classificação orçamentária (não toca em valor — isso é evento). */
export const updateEmpenhoClassificationFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			empenhoId: z.string().uuid(),
			tipo: z.enum(["ordinario", "estimativo", "global"]).optional(),
			favorecidoCnpj: z
				.string()
				.regex(/^\d{14}$/)
				.nullable()
				.optional(),
			favorecidoNome: z.string().nullable().optional(),
			nd: z.string().nullable().optional(),
			ptres: z.string().nullable().optional(),
			fonte: z.string().nullable().optional(),
			ugEmitente: z.string().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		const fin = finance()
		const { data: empenho } = await fin.from("empenho").select("unit_id").eq("id", data.empenhoId).maybeSingle()
		if (!empenho) throw new Error("Empenho não encontrado")
		await requireUnitScope(2, Number(empenho.unit_id))

		const { error } = await fin
			.from("empenho")
			.update({
				tipo: data.tipo ?? null,
				favorecido_cnpj: data.favorecidoCnpj ?? null,
				favorecido_nome: data.favorecidoNome ?? null,
				nd: data.nd ?? null,
				ptres: data.ptres ?? null,
				fonte: data.fonte ?? null,
				ug_emitente: data.ugEmitente ?? null,
			})
			.eq("id", data.empenhoId)
		if (error) throw new Error(`Erro ao atualizar empenho: ${error.message}`)
	})

/**
 * Reforço / anulação / cancelamento — o valor do empenho NUNCA é editado.
 * Justificativa é obrigatória (constraint no banco também).
 */
export const registerEmpenhoEventFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			empenhoId: z.string().uuid(),
			tipo: z.enum(["reforco", "anulacao", "cancelamento"]),
			valor: z.number().positive(),
			data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			documento: z.string().optional(),
			justificativa: z.string().min(5, "Justificativa obrigatória"),
		})
	)
	.handler(async ({ data }) => {
		const fin = finance()
		const { data: empenho } = await fin.from("empenho").select("unit_id").eq("id", data.empenhoId).maybeSingle()
		if (!empenho) throw new Error("Empenho não encontrado")
		const { userId } = await requireUnitScope(2, Number(empenho.unit_id))

		// anulação não pode derrubar o vigente abaixo do já liquidado
		if (data.tipo !== "reforco") {
			const saldos = await fetchSaldos([data.empenhoId])
			const saldo = saldos.get(data.empenhoId)
			if (saldo && saldo.valor_vigente - data.valor < saldo.valor_liquidado) {
				throw new Error(
					`Anulação deixaria o empenho (R$ ${(saldo.valor_vigente - data.valor).toFixed(2)}) abaixo do já liquidado (R$ ${saldo.valor_liquidado.toFixed(2)})`
				)
			}
		}

		const { error } = await fin.from("empenho_event").insert({
			empenho_id: data.empenhoId,
			tipo: data.tipo,
			valor: data.valor,
			data: data.data,
			documento: data.documento?.trim() || null,
			justificativa: data.justificativa.trim(),
			created_by: userId,
		})
		if (error) throw new Error(`Erro ao registrar evento: ${error.message}`)

		// cancelamento total também marca o status do documento
		if (data.tipo === "cancelamento") {
			await fin.from("empenho").update({ status: "anulado" }).eq("id", data.empenhoId)
		}
	})

/**
 * Inscrição em restos a pagar no encerramento do exercício: saldo a liquidar
 * → não-processado; liquidado e não pago → processado. Ação explícita.
 */
export const inscribeRestosAPagarFn = createServerFn({ method: "POST" })
	.validator(z.object({ unitId: z.number().int().positive(), exercicio: z.number().int() }))
	.handler(async ({ data }) => {
		const { userId } = await requireUnitScope(3, data.unitId)
		const fin = finance()

		const { data: rows } = await fin
			.from("empenho")
			.select("id")
			.eq("unit_id", data.unitId)
			.eq("exercicio", data.exercicio)
			.eq("status", "ativo")
			.eq("rp_inscrito", false)
		const ids = (rows ?? []).map((row: { id: string }) => row.id)
		if (ids.length === 0) return { inscritos: 0 }

		const saldos = await fetchSaldos(ids)
		let inscritos = 0
		for (const [empenhoId, saldo] of saldos) {
			const tipo = saldo.saldo_a_liquidar > 0 ? "nao_processado" : saldo.valor_a_pagar > 0 ? "processado" : null
			if (!tipo) continue

			await fin.from("empenho").update({ rp_inscrito: true, rp_tipo: tipo, rp_exercicio: data.exercicio }).eq("id", empenhoId)
			await fin.from("empenho_event").insert({
				empenho_id: empenhoId,
				tipo: "rp_inscricao",
				valor: tipo === "nao_processado" ? saldo.saldo_a_liquidar : saldo.valor_a_pagar,
				data: `${data.exercicio}-12-31`,
				justificativa: `Inscrição em restos a pagar ${tipo === "nao_processado" ? "não-processados" : "processados"} do exercício ${data.exercicio}`,
				created_by: userId,
			})
			inscritos++
		}
		return { inscritos }
	})
