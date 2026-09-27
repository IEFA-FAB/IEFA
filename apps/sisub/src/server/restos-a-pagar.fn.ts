/**
 * @module restos-a-pagar.fn
 * Inscrição em restos a pagar em DUAS parcelas por empenho (achado F6 da auditoria de
 * 2026-09-26): liquidado e não pago → RP processado; empenhado e não liquidado → RP não
 * processado (Lei 4.320, art. 36; Decreto 93.872/1986, arts. 67-68).
 *
 * A inscrição é do EXERCÍCIO, sobre o saldo de 31/12 (`empenhoBalanceAtYearEnd`), não sobre o
 * saldo do dia em que roda: a OB de janeiro paga RP e não muda o inscrito. Rodar de novo só
 * mexe no que mudou em 31/12 (lançamento retroativo), e aí o conjunto do empenho é
 * SUBSTITUÍDO, com trilha (`superseded_at`), nunca somado (`reconcileRestosAPagar`).
 *
 * Expand: empenho inscrito pelo caminho antigo (`rp_inscrito`, um tipo só) é migrado para
 * parcelas sem evento novo; `rp_inscrito/rp_tipo/rp_exercicio` continuam espelhados e o evento
 * `rp_inscricao` continua sendo gravado, um por parcela nova. `inscribeRestosAPagarFn`
 * (empenho.fn.ts) está desligado.
 * CLIENT: getDb (Drizzle) — leitura e gravação por SQL, a gravação numa transação.
 * AUTH: `unit` escopado — 1 leitura, 3 inscrever (encerramento do exercício, como o antigo).
 * TABLES: finance.empenho, finance.empenho_event, finance.liquidacao, finance.pagamento,
 *   finance.liquidacao_deduction, finance.empenho_rp_inscription.
 * @domain core
 * @migration 20260926216000_finance_compliance
 */

import type { TableRow } from "@iefa/database"
import {
	type ActiveRpParcel,
	type EmpenhoLedger,
	empenhoBalanceAtYearEnd,
	legacyRestosAPagarKind,
	type RestosAPagarAction,
	type RestosAPagarKind,
	reconcileRestosAPagar,
	splitRestosAPagar,
} from "@iefa/sisub-domain"
import { describeDriverError } from "@iefa/sisub-domain/utils"
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { getDb } from "@/lib/db.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

/**
 * Parcela vigente de `finance.empenho_rp_inscription`, com `kind` estreitado ao CHECK do banco. A
 * leitura é SQL cru (`loadRpInputs`): a inscrição roda na mesma transação, sob lock.
 */
export type RpInscriptionRow = Pick<TableRow<"finance", "empenho_rp_inscription">, "amount" | "inscribed_on"> & { kind: RestosAPagarKind }

export interface RestosAPagarPreviewRow {
	empenhoId: string
	numeroEmpenho: string
	favorecido: string | null
	/** Saldos em 31/12 do exercício. */
	valorVigente: number
	valorLiquidado: number
	valorPago: number
	/** Liquidado e não pago em 31/12 (inclui retenção ainda não recolhida). */
	processado: number
	/** Empenhado e não liquidado em 31/12. */
	naoProcessado: number
	/** Parcelas vigentes já gravadas para este exercício. */
	inscribed: RpInscriptionRow[]
	/** O que a inscrição faria com este empenho agora. */
	action: RestosAPagarAction["kind"]
}

type Executor = Pick<ReturnType<typeof getDb>, "execute">

interface EmpenhoRpInput {
	empenhoId: string
	numeroEmpenho: string
	favorecido: string | null
	rpInscrito: boolean
	rpExercicio: number | null
	ledger: EmpenhoLedger
	active: (ActiveRpParcel & { inscribed_on: string })[]
}

/**
 * Tudo o que a conta de 31/12 precisa, em seis leituras (sem N+1). Entram os empenhos do
 * exercício ativos, e os anulados por inteiro DEPOIS de 31/12 (em 31/12 eles ainda eram saldo).
 */
async function loadRpInputs(db: Executor, unitId: number, exercicio: number): Promise<EmpenhoRpInput[]> {
	const yearEnd = `${exercicio}-12-31`
	const scope = sql`
		select e.id from finance.empenho e
		 where e.unit_id = ${unitId} and e.exercicio = ${exercicio}
		   and (e.status = 'ativo' or exists (
		         select 1 from finance.empenho_event ev
		          where ev.empenho_id = e.id and ev.tipo in ('anulacao_total', 'cancelamento') and ev.data > ${yearEnd}::date))`

	const empenhos = await db.execute<{
		id: string
		numero_empenho: string
		favorecido: string | null
		valor_total: string
		rp_inscrito: boolean
		rp_exercicio: number | null
	}>(sql`
		select e.id, e.numero_empenho, coalesce(e.favorecido_nome, e.favorecido_cnpj) as favorecido,
		       e.valor_total::text, e.rp_inscrito, e.rp_exercicio
		  from finance.empenho e where e.id in (${scope}) order by e.numero_empenho`)
	if (empenhos.length === 0) return []

	const [events, liquidacoes, pagamentos, retencoes, active] = await Promise.all([
		db.execute<{ empenho_id: string; tipo: string; valor: string; data: string }>(sql`
			select ev.empenho_id, ev.tipo, ev.valor::text, ev.data::text from finance.empenho_event ev where ev.empenho_id in (${scope})`),
		db.execute<{ empenho_id: string; valor: string; data: string }>(sql`
			select l.empenho_id, l.valor::text, l.data::text from finance.liquidacao l where l.empenho_id in (${scope})`),
		db.execute<{ empenho_id: string; valor: string; data: string }>(sql`
			select l.empenho_id, p.valor::text, p.data::text
			  from finance.pagamento p join finance.liquidacao l on l.id = p.liquidacao_id where l.empenho_id in (${scope})`),
		db.execute<{ empenho_id: string; valor: string; data: string }>(sql`
			select l.empenho_id, d.amount::text as valor, d.paid_on::text as data
			  from finance.liquidacao_deduction d join finance.liquidacao l on l.id = d.liquidacao_id
			 where d.paid_on is not null and l.empenho_id in (${scope})`),
		db.execute<{ id: string; empenho_id: string; kind: string; amount: string; inscribed_on: string }>(sql`
			select r.id, r.empenho_id, r.kind, r.amount::text, r.inscribed_on::text
			  from finance.empenho_rp_inscription r
			 where r.fiscal_year = ${exercicio} and r.superseded_at is null and r.empenho_id in (${scope})`),
	])

	const group = <T extends { empenho_id: string }>(rows: Iterable<T>) => {
		const map = new Map<string, T[]>()
		for (const row of rows) {
			const list = map.get(row.empenho_id) ?? []
			list.push(row)
			map.set(row.empenho_id, list)
		}
		return map
	}
	const eventsBy = group(events)
	const liqBy = group(liquidacoes)
	const pagBy = group(pagamentos)
	const retBy = group(retencoes)
	const activeBy = group(active)
	const dated = (rows: { valor: string; data: string }[] | undefined) => (rows ?? []).map((row) => ({ valor: Number(row.valor), data: row.data }))

	return [...empenhos].map((row) => ({
		empenhoId: row.id,
		numeroEmpenho: row.numero_empenho,
		favorecido: row.favorecido,
		rpInscrito: row.rp_inscrito === true,
		rpExercicio: row.rp_exercicio == null ? null : Number(row.rp_exercicio),
		ledger: {
			valorOriginal: Number(row.valor_total),
			events: (eventsBy.get(row.id) ?? []).map((event) => ({ tipo: event.tipo, valor: Number(event.valor), data: event.data })),
			liquidacoes: dated(liqBy.get(row.id)),
			pagamentos: dated(pagBy.get(row.id)),
			retencoesRecolhidas: dated(retBy.get(row.id)),
		},
		active: (activeBy.get(row.id) ?? []).map((parcel) => ({
			id: parcel.id,
			kind: parcel.kind,
			amount: Number(parcel.amount),
			inscribed_on: parcel.inscribed_on,
		})),
	}))
}

function planFor(input: EmpenhoRpInput, exercicio: number) {
	const balance = empenhoBalanceAtYearEnd(input.ledger, exercicio)
	const split = splitRestosAPagar(balance)
	const action = reconcileRestosAPagar({
		empenhoId: input.empenhoId,
		exercicio,
		split,
		active: input.active,
		legacy: { rpInscrito: input.rpInscrito, rpExercicio: input.rpExercicio },
	})
	return { balance, split, action }
}

const exercicioInput = z.object({ unitId: z.number().int().positive(), exercicio: z.number().int().min(2000).max(2100) })

/** O que o encerramento do exercício inscreve, empenho a empenho, pelo saldo de 31/12. */
export const previewRestosAPagarFn = createServerFn({ method: "GET" })
	.validator(exercicioInput)
	.handler(async ({ data }): Promise<{ rows: RestosAPagarPreviewRow[]; hasPending: boolean }> => {
		await requireUnitScope(1, data.unitId)
		const inputs = await loadRpInputs(getDb(), data.unitId, data.exercicio)
		const rows = inputs.map((input) => {
			const { balance, split, action } = planFor(input, data.exercicio)
			return {
				empenhoId: input.empenhoId,
				numeroEmpenho: input.numeroEmpenho,
				favorecido: input.favorecido,
				...balance,
				processado: split.processado,
				naoProcessado: split.naoProcessado,
				inscribed: input.active.map((parcel) => ({ kind: parcel.kind as RestosAPagarKind, amount: parcel.amount, inscribed_on: parcel.inscribed_on })),
				action: action.kind,
			}
		})
		// o botão só fica ativo quando há de fato algo a gravar
		return { rows, hasPending: rows.some((row) => row.action !== "none") }
	})

/** Mesmo teto de espera do evento de empenho: vira erro com mensagem antes dos 60 s do ALB. */
const RP_LOCK_TIMEOUT = "10s"

/**
 * Inscreve em RP as parcelas do exercício pelo saldo de 31/12. Idempotente e sem soma dupla:
 * conjunto igual → nada; primeira vez → grava; inscrito pelo caminho antigo → migra para
 * parcelas; saldo de 31/12 mudou → substitui o conjunto (as antigas ficam como trilha).
 * Tudo numa transação, serializada por unidade e exercício.
 */
export const inscribeRpParcelsFn = createServerFn({ method: "POST" })
	.validator(exercicioInput)
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(3, data.unitId)
		const { userId } = ctx

		return withSensitiveAudit(
			"inscribeRpParcelsFn",
			ctx,
			async () => {
				try {
					return await getDb().transaction(async (tx) => {
						await tx.execute(sql`select set_config('lock_timeout', ${RP_LOCK_TIMEOUT}, true)`)
						await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`rp_inscription:${data.unitId}:${data.exercicio}`}::text, 42))`)

						const inputs = await loadRpInputs(tx, data.unitId, data.exercicio)
						const yearEnd = `${data.exercicio}-12-31`
						const counts = { inserted: 0, migrated: 0, replaced: 0, parcelas: 0, processado: 0, naoProcessado: 0 }

						for (const input of inputs) {
							const { split, action } = planFor(input, data.exercicio)
							if (action.kind === "none") continue

							if (action.kind === "replace") {
								const previous = input.active.map((p) => `${p.kind} R$ ${p.amount.toFixed(2)}`).join(", ")
								for (const id of action.supersede) {
									await tx.execute(sql`
										update finance.empenho_rp_inscription
										   set superseded_at = now(), superseded_by = ${userId}::uuid,
										       supersede_reason = ${`Saldo de 31/12/${data.exercicio} recalculado (antes: ${previous})`}
										 where id = ${id}::uuid and superseded_at is null`)
								}
							}

							for (const parcel of action.parcels) {
								const notes =
									action.kind === "migrate_legacy"
										? "Migrada da inscrição de um tipo só (rp_inscrito)"
										: action.kind === "replace"
											? "Recalculada: substitui a inscrição anterior do exercício"
											: null
								await tx.execute(sql`
									insert into finance.empenho_rp_inscription (empenho_id, fiscal_year, kind, amount, inscribed_on, notes, created_by)
									values (${parcel.empenhoId}::uuid, ${parcel.exercicio}, ${parcel.tipo}, ${parcel.valor}, ${yearEnd}::date, ${notes}, ${userId}::uuid)`)
								// histórico no livro do empenho (sinal 0: não altera o vigente). A migração do
								// legado não grava evento: o caminho antigo já gravou o dele.
								if (action.kind !== "migrate_legacy") {
									const verb = action.kind === "replace" ? "Reinscrição" : "Inscrição"
									await tx.execute(sql`
										insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa, created_by)
										values (
											${parcel.empenhoId}::uuid, 'rp_inscricao', ${parcel.valor}, ${yearEnd}::date,
											${`${verb} em restos a pagar ${parcel.tipo === "processado" ? "processados" : "não processados"} do exercício ${data.exercicio}`},
											${userId}::uuid
										)`)
								}
								counts.parcelas++
								if (parcel.tipo === "processado") counts.processado += parcel.valor
								else counts.naoProcessado += parcel.valor
							}

							// espelho legado (expand)
							await tx.execute(sql`
								update finance.empenho
								   set rp_inscrito = ${action.parcels.length > 0}, rp_tipo = ${legacyRestosAPagarKind(split)},
								       rp_exercicio = ${action.parcels.length > 0 ? data.exercicio : null}
								 where id = ${input.empenhoId}::uuid`)
							if (action.kind === "insert") counts.inserted++
							else if (action.kind === "migrate_legacy") counts.migrated++
							else counts.replaced++
						}

						return {
							...counts,
							empenhos: counts.inserted + counts.migrated + counts.replaced,
							processado: Math.round(counts.processado * 100) / 100,
							naoProcessado: Math.round(counts.naoProcessado * 100) / 100,
						}
					})
				} catch (error) {
					// biome-ignore lint/suspicious/noConsole: server-side — o detalhe do driver só vai para o log
					console.error("[inscribeRpParcelsFn]", describeDriverError(error))
					throw new Error("Erro ao inscrever restos a pagar. Tente novamente.")
				}
			},
			// A execução que não inscreveu nada também deixa linha: "nada a inscrever" é resposta.
			(result) => ({
				unitId: data.unitId,
				exercicio: data.exercicio,
				parcelas: result.parcelas,
				inseridos: result.inserted,
				migrados: result.migrated,
				recalculados: result.replaced,
			})
		)
	})
