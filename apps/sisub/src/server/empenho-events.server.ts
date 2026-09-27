/**
 * Gravação serializada dos eventos do empenho (reforço, anulação, anulação total).
 *
 * Mora num módulo `.server.ts` porque usa o Drizzle (`getDb`) fora de `createServerFn`: num
 * `*.fn.ts`, o compilador de server fns mantém no bundle do CLIENTE todo export que não é
 * server fn, e o import de `@/lib/db.server` vazava para o navegador — o import protection do
 * TanStack Start derrubava o build do sisub.
 */

import { EMPENHO_TOTAL_ANNULMENT_EVENT } from "@iefa/sisub-domain"
import { describeDriverError, unwrapPgError } from "@iefa/sisub-domain/utils"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db.server"
import { planEmpenhoCancellation } from "@/lib/expense-execution"

/** Mesmo teto de espera do reset de treino: vira erro com mensagem antes dos 60 s do ALB. */
const EVENT_LOCK_TIMEOUT = "10s"

export function floorMessage(vigenteApos: number, liquidado: number): string {
	return `Anulação deixaria o empenho (R$ ${vigenteApos.toFixed(2)}) abaixo do já liquidado (R$ ${liquidado.toFixed(2)})`
}

export class EmpenhoFloorError extends Error {}

type EventTx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]

/**
 * Serializa o lançamento no empenho. As chaves são as MESMAS dos triggers do banco
 * (`finance.check_empenho_event_floor` e `finance.check_liquidacao_within_empenho`), e a ordem é
 * sempre evento → liquidação — o trigger de liquidação só toma a segunda, então não há ciclo.
 * `set_config(..., true)`: local à transação, volta ao padrão no commit (ver training.ts).
 */
async function lockEmpenhoForEvent(tx: EventTx, empenhoId: string): Promise<void> {
	await tx.execute(sql`select set_config('lock_timeout', ${EVENT_LOCK_TIMEOUT}, true)`)
	await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`empenho_event:${empenhoId}`}::text, 42))`)
	await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`liq_empenho:${empenhoId}`}::text, 42))`)
}

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
		await lockEmpenhoForEvent(tx, input.empenhoId)

		if (input.tipo !== "reforco") {
			const [row] = await tx.execute<{ status: string | null; vigente: string | null; liquidado: string | null }>(sql`
				select
					(select status from finance.empenho where id = ${input.empenhoId}::uuid) as status,
					(select valor_vigente from finance.v_empenho_vigente where empenho_id = ${input.empenhoId}::uuid)::text as vigente,
					(select coalesce(sum(valor), 0) from finance.liquidacao where empenho_id = ${input.empenhoId}::uuid)::text as liquidado
			`)
			if (row?.status === "anulado") throw new EmpenhoFloorError("Empenho já anulado — não aceita nova anulação")
			const vigente = Number(row?.vigente ?? 0)
			const liquidado = Number(row?.liquidado ?? 0)
			// Anulação total é do saldo VIGENTE lido aqui, sob o lock — não do valor que a tela viu
			// antes: um reforço concorrente deixaria a NE "anulada" com saldo sobrando.
			if (input.tipo === EMPENHO_TOTAL_ANNULMENT_EVENT && Math.abs(input.valor - vigente) > 0.009) {
				throw new EmpenhoFloorError(
					`Anulação total é do saldo vigente (R$ ${vigente.toFixed(2)}); o valor mudou desde que a tela foi aberta — confira e tente de novo`
				)
			}
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
		await lockEmpenhoForEvent(tx, input.empenhoId)

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
			values (${input.empenhoId}::uuid, ${EMPENHO_TOTAL_ANNULMENT_EVENT}, ${plan.valor}, ${input.data}::date, ${input.justificativa.trim()}, ${input.userId}::uuid)
		`)
		await tx.execute(sql`update finance.empenho set status = 'anulado' where id = ${input.empenhoId}::uuid`)
		return { valor: plan.valor }
	})
}

/**
 * O erro que chega ao cliente. O do driver traz o SQL e os parâmetros na mensagem — isso fica
 * no log; o cliente lê o motivo de negócio (piso, espera esgotada) ou uma mensagem genérica.
 */
export function toEmpenhoEventError(error: unknown, source = "registerEmpenhoEventFn"): Error {
	if (error instanceof EmpenhoFloorError) return error
	const pg = unwrapPgError(error)
	// O trigger do banco tem a mesma regra e a mesma frase — repassa a dele.
	if (pg.message?.startsWith("Anulação deixaria")) return new Error(pg.message)
	if (pg.code === "55P03") return new Error("Outro lançamento neste empenho está em andamento. Tente de novo em instantes.")
	// biome-ignore lint/suspicious/noConsole: server-side — o detalhe do driver só vai para o log
	console.error(`[${source}]`, describeDriverError(error))
	return new Error("Erro ao registrar evento do empenho. Tente novamente.")
}
