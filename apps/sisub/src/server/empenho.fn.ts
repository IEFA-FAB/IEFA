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
import { describeDriverError, unwrapPgError } from "@iefa/sisub-domain/utils"
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { getDb } from "@/lib/db.server"
import { planEmpenhoCancellation } from "@/lib/expense-execution"
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

/** Mesmo teto de espera do reset de treino: vira erro com mensagem antes dos 60 s do ALB. */
const EVENT_LOCK_TIMEOUT = "10s"

function floorMessage(vigenteApos: number, liquidado: number): string {
	return `Anulação deixaria o empenho (R$ ${vigenteApos.toFixed(2)}) abaixo do já liquidado (R$ ${liquidado.toFixed(2)})`
}

class EmpenhoFloorError extends Error {}

/**
 * Checa o piso e grava o evento NUMA transação, serializada pelo empenho.
 *
 * Antes, a checagem lia o saldo por um cliente e o insert ia por outro, sem lock: duas
 * anulações simultâneas liam o mesmo vigente, passavam as duas e juntas derrubavam o empenho
 * abaixo do já liquidado. As chaves dos dois advisory locks são as MESMAS dos triggers do banco
 * (`finance.check_empenho_event_floor` e `finance.check_liquidacao_within_empenho`): tomar as
 * duas serializa esta anulação contra outra anulação E contra uma liquidação em curso do mesmo
 * empenho — que, com chaves diferentes, se cruzavam (cada lado lia o valor do outro antes do
 * commit). A ordem é sempre evento → liquidação, e o trigger de liquidação só toma a segunda:
 * não há ciclo.
 */
export async function insertEmpenhoEventSerialized(input: {
	empenhoId: string
	tipo: "reforco" | "anulacao" | typeof EMPENHO_TOTAL_ANNULMENT_EVENT
	valor: number
	data: string
	documento?: string
	justificativa: string
	userId: string
}): Promise<void> {
	await getDb().transaction(async (tx) => {
		// `set_config(..., true)`: local à transação, volta ao padrão no commit (ver training.ts).
		await tx.execute(sql`select set_config('lock_timeout', ${EVENT_LOCK_TIMEOUT}, true)`)
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`empenho_event:${input.empenhoId}`}::text, 42))`)
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`liq_empenho:${input.empenhoId}`}::text, 42))`)

		if (input.tipo !== "reforco") {
			const [row] = await tx.execute<{ vigente: string | null; liquidado: string | null }>(sql`
				select
					(select valor_vigente from finance.v_empenho_vigente where empenho_id = ${input.empenhoId}::uuid)::text as vigente,
					(select coalesce(sum(valor), 0) from finance.liquidacao where empenho_id = ${input.empenhoId}::uuid)::text as liquidado
			`)
			const vigente = Number(row?.vigente ?? 0)
			const liquidado = Number(row?.liquidado ?? 0)
			if (vigente - input.valor < liquidado) throw new EmpenhoFloorError(floorMessage(vigente - input.valor, liquidado))
		}

		await tx.execute(sql`
			insert into finance.empenho_event (empenho_id, tipo, valor, data, documento, justificativa, created_by)
			values (
				${input.empenhoId}::uuid, ${input.tipo}, ${input.valor}, ${input.data}::date,
				${input.documento?.trim() || null}, ${input.justificativa.trim()}, ${input.userId}::uuid
			)
		`)

		// anulação total também marca o status do documento — na MESMA transação: antes o
		// update ia solto e, se falhasse, o evento ficava gravado com o empenho ainda "ativo".
		if (input.tipo === EMPENHO_TOTAL_ANNULMENT_EVENT) {
			await tx.execute(sql`update finance.empenho set status = 'anulado' where id = ${input.empenhoId}::uuid`)
		}
	})
}

/**
 * Anulação TOTAL da NE, com o valor lido DENTRO da transação e sob os mesmos locks do evento.
 *
 * Ler o vigente antes (fora da transação) e anular "esse valor" depois deixava uma janela: um
 * reforço concorrente entrava no meio, e a NE ficava `anulado` com valor vigente sobrando. Aqui o
 * vigente, o liquidado e o status são lidos depois dos locks, na mesma transação do evento e do
 * status. O piso do banco (liquidado e já pedido em OF) confere de novo no insert.
 */
export async function cancelEmpenhoSerialized(input: { empenhoId: string; data: string; justificativa: string; userId: string }): Promise<{ valor: number }> {
	return getDb().transaction(async (tx) => {
		await tx.execute(sql`select set_config('lock_timeout', ${EVENT_LOCK_TIMEOUT}, true)`)
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`empenho_event:${input.empenhoId}`}::text, 42))`)
		await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`liq_empenho:${input.empenhoId}`}::text, 42))`)

		const [row] = await tx.execute<{ numero: string; status: string; vigente: string | null; liquidado: string | null }>(sql`
			select
				e.numero_empenho as numero,
				e.status,
				(select valor_vigente from finance.v_empenho_vigente where empenho_id = e.id)::text as vigente,
				(select coalesce(sum(valor), 0) from finance.liquidacao where empenho_id = e.id)::text as liquidado
			from finance.empenho e
			where e.id = ${input.empenhoId}::uuid
			for update
		`)
		if (!row) throw new EmpenhoFloorError("Empenho não encontrado")
		const vigente = Number(row.vigente ?? 0)
		const liquidado = Number(row.liquidado ?? 0)
		const plan = planEmpenhoCancellation({ numero: row.numero, status: row.status, vigente, liquidado, aLiquidar: vigente - liquidado })
		if (!plan.ok) throw new EmpenhoFloorError(plan.message)

		await tx.execute(sql`
			insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa, created_by)
			values (${input.empenhoId}::uuid, 'cancelamento', ${plan.valor}, ${input.data}::date, ${input.justificativa.trim()}, ${input.userId}::uuid)
		`)
		await tx.execute(sql`update finance.empenho set status = 'anulado' where id = ${input.empenhoId}::uuid`)
		return { valor: plan.valor }
	})
}

/**
 * O erro que chega ao cliente. O do driver traz o SQL e os parâmetros na mensagem — isso fica
 * no log; o cliente lê o motivo de negócio (piso, espera esgotada) ou uma mensagem genérica.
 */
export function toEmpenhoEventError(error: unknown): Error {
	if (error instanceof EmpenhoFloorError) return error
	const pg = unwrapPgError(error)
	// O trigger do banco tem a mesma regra e a mesma frase — repassa a dele.
	if (pg.message?.startsWith("Anulação deixaria")) return new Error(pg.message)
	if (pg.code === "55P03") return new Error("Outro lançamento neste empenho está em andamento. Tente de novo em instantes.")
	// biome-ignore lint/suspicious/noConsole: server-side — o detalhe do driver só vai para o log
	console.error("[registerEmpenhoEventFn]", describeDriverError(error))
	return new Error("Erro ao registrar evento do empenho. Tente novamente.")
}

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
