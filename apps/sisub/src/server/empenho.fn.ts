/**
 * @module empenho.fn
 * Empenho como documento orçamentário (Fase 3): classificação completa,
 * reforço/anulação por EVENTO (o valor nunca é editado) e saldos derivados
 * da view finance.v_empenho_saldo. Inscrição em restos a pagar é ação
 * explícita no encerramento do exercício.
 * CLIENT: getServerClient (service role, schema finance); getDb (Drizzle) só para o
 * evento de empenho, que precisa de transação com lock.
 * AUTH: `unit` escopado — 1 leitura, 2 lançar evento, 3 encerrar exercício.
 * TABLES: finance.empenho, empenho_event, v_empenho_saldo.
 * @domain core
 * @migration 20260731140000_finance_empenho_document
 */

import { EMPENHO_TOTAL_ANNULMENT_EVENT, LEGACY_EMPENHO_TOTAL_ANNULMENT_EVENT } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"
import { floorMessage, insertEmpenhoEventSerialized, toEmpenhoEventError } from "@/server/empenho-events.server"

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

/** Saldos por empenho (view única — mesma fonte do painel do anexo quantitativo). */
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
	.validator(z.object({ empenhoId: z.uuid() }))
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
			empenhoId: z.uuid(),
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
		const ctx = await requireUnitScope(2, Number(empenho.unit_id))

		return withSensitiveAudit(
			"updateEmpenhoClassificationFn",
			ctx,
			async () => {
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
			},
			// A classificação nova vai junto: o que muda AQUI é para onde a despesa é
			// imputada, e sem ela a linha diria apenas que alguém mexeu no empenho.
			() => ({
				empenhoId: data.empenhoId,
				unitId: Number(empenho.unit_id),
				nd: data.nd ?? null,
				ptres: data.ptres ?? null,
				fonte: data.fonte ?? null,
			})
		)
	})

/**
 * Reforço / anulação parcial / anulação total — o valor do empenho NUNCA é editado.
 * A anulação total grava `anulacao_total` (F8, migration 20260926216000): `cancelamento` é
 * termo de restos a pagar. O valor legado ainda é aceito na entrada e gravado com o nome novo.
 * Justificativa é obrigatória (constraint no banco também).
 */
export const registerEmpenhoEventFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			empenhoId: z.uuid(),
			tipo: z
				.enum(["reforco", "anulacao", EMPENHO_TOTAL_ANNULMENT_EVENT, LEGACY_EMPENHO_TOTAL_ANNULMENT_EVENT])
				.transform((tipo) => (tipo === LEGACY_EMPENHO_TOTAL_ANNULMENT_EVENT ? EMPENHO_TOTAL_ANNULMENT_EVENT : tipo)),
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
		const ctx = await requireUnitScope(2, Number(empenho.unit_id))
		const { userId } = ctx

		// Pré-checagem para a mensagem boa no caso comum; a decisão que vale é a de dentro da
		// transação abaixo, sob o lock.
		if (data.tipo !== "reforco") {
			const saldos = await fetchSaldos([data.empenhoId])
			const saldo = saldos.get(data.empenhoId)
			if (saldo && saldo.valor_vigente - data.valor < saldo.valor_liquidado) {
				throw new Error(floorMessage(saldo.valor_vigente - data.valor, saldo.valor_liquidado))
			}
		}

		return withSensitiveAudit(
			"registerEmpenhoEventFn",
			ctx,
			async () => {
				try {
					await insertEmpenhoEventSerialized({ ...data, userId })
				} catch (error) {
					throw toEmpenhoEventError(error)
				}
			},
			() => ({ empenhoId: data.empenhoId, unitId: Number(empenho.unit_id), tipo: data.tipo, valor: data.valor, data: data.data })
		)
	})

/**
 * Caminho antigo da inscrição em restos a pagar: gravava UM tipo por empenho
 * (`rp_tipo`) e escolhia o não processado sempre que havia saldo a liquidar, perdendo a
 * parte processada do mesmo empenho (Lei 4.320, art. 36). Desligado: a inscrição é
 * `inscribeRpParcelsFn` (restos-a-pagar.fn.ts), em duas parcelas pelo saldo de 31/12, que
 * também migra para parcelas o que este caminho já tinha gravado. Mantido só para recusar
 * com instrução quem ainda o chame (a fn continua classificada no registro de garantia).
 */
export const inscribeRestosAPagarFn = createServerFn({ method: "POST" })
	.validator(z.object({ unitId: z.number().int().positive(), exercicio: z.number().int() }))
	.handler(async ({ data }): Promise<{ inscritos: number }> => {
		const ctx = await requireUnitScope(3, data.unitId)
		// continua no envelope de auditoria (contrato `audit-wiring`); o corpo só recusa, e
		// execução recusada não grava linha
		return withSensitiveAudit("inscribeRestosAPagarFn", ctx, async (): Promise<{ inscritos: number }> => {
			throw new Error("A inscrição em restos a pagar passou para Pagamentos → Restos a pagar, em duas parcelas por empenho (processado e não processado).")
		})
	})
