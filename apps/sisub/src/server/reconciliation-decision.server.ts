/**
 * Resolução de divergência da conciliação SIAFI × sisub numa transação só.
 *
 * Antes eram três escritas soltas pelo PostgREST (evento no empenho, origem do empenho, decisão)
 * com os valores do payload: o cliente escolhia o tamanho do reforço/anulação, e o segundo clique
 * gravava um segundo evento. Aqui a linha da conciliação é LIDA dentro da transação, sob lock do
 * documento (e do empenho, nas mesmas chaves dos triggers de evento e liquidação), e a decisão,
 * o evento e a origem gravam juntos ou não gravam.
 *
 * Mora num `.server.ts` porque usa o Drizzle (`getDb`): num `*.fn.ts` o import vazaria para o
 * bundle do cliente (ver `empenho-events.server.ts`).
 */

import { describeDriverError, unwrapPgError } from "@iefa/sisub-domain/utils"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db.server"
import {
	planDivergenceResolution,
	type ReconciliationDecision,
	type ReconciliationDocumentType,
	type ReconciliationSnapshot,
} from "@/lib/reconciliation-decision"

/** Mesmo teto de espera dos eventos do empenho: vira erro com mensagem antes dos 60 s do ALB. */
const LOCK_TIMEOUT = "10s"

export class ReconciliationDecisionError extends Error {}

export interface ResolveDivergenceInput {
	unitId: number
	documentoTipo: ReconciliationDocumentType
	numeroDocumento: string
	decisao: ReconciliationDecision
	justificativa: string | null
	/** A versão que a tela viu: os valores da linha quando o usuário clicou. */
	seenValorSisub: number | null
	seenValorSiafi: number | null
	userId: string
}

export interface ResolvedDivergence {
	valorSisub: number | null
	valorSiafi: number | null
	empenhoEvent: { tipo: "reforco" | "anulacao"; valor: number } | null
}

function toNumber(value: string | null | undefined): number | null {
	return value == null ? null : Number(value)
}

export async function resolveDivergenceAtomically(input: ResolveDivergenceInput): Promise<ResolvedDivergence> {
	return getDb().transaction(async (tx) => {
		await tx.execute(sql`select set_config('lock_timeout', ${LOCK_TIMEOUT}, true)`)
		// Serializa decisões sobre o MESMO documento: o duplo clique espera o primeiro terminar e
		// lê a conciliação já resolvida.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`reconciliation:${input.unitId}:${input.documentoTipo}:${input.numeroDocumento}`}::text, 42))`
		)

		let empenhoId: string | null = null
		if (input.documentoTipo === "ne") {
			const [empenho] = await tx.execute<{ id: string }>(sql`
				select id from finance.empenho
				where unit_id = ${input.unitId} and numero_empenho = ${input.numeroDocumento}
				limit 1
			`)
			empenhoId = empenho?.id ?? null
			if (empenhoId) {
				// As MESMAS chaves de `finance.check_empenho_event_floor` e de
				// `finance.check_liquidacao_within_empenho`, na mesma ordem (evento → liquidação) de
				// `empenho-events.server.ts`: o valor vigente lido abaixo não muda até o commit.
				await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`empenho_event:${empenhoId}`}::text, 42))`)
				await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`liq_empenho:${empenhoId}`}::text, 42))`)
			}
		}

		const [row] = await tx.execute<{ situacao: string; valor_sisub: string | null; valor_siafi: string | null; decisao_vigente: boolean }>(sql`
			select situacao, valor_sisub::text, valor_siafi::text, decisao_vigente
			from finance.v_siafi_reconciliation
			where unit_id = ${input.unitId} and documento_tipo = ${input.documentoTipo} and numero_documento = ${input.numeroDocumento}
			limit 1
		`)
		const snapshot: ReconciliationSnapshot | null = row
			? {
					situacao: row.situacao,
					valorSisub: toNumber(row.valor_sisub),
					valorSiafi: toNumber(row.valor_siafi),
					hasCurrentDecision: Boolean(row.decisao_vigente),
				}
			: null

		const plan = planDivergenceResolution({
			snapshot,
			documentoTipo: input.documentoTipo,
			decisao: input.decisao,
			seen: { valorSisub: input.seenValorSisub, valorSiafi: input.seenValorSiafi },
			hasEmpenho: empenhoId != null,
		})
		if (!plan.ok) throw new ReconciliationDecisionError(plan.message)

		// Adotar o SIAFI num empenho entra como EVENTO (o valor nunca é editado). O piso do banco
		// (`empenho_event_floor`) confere a anulação contra o já liquidado no insert.
		if (input.decisao === "adotado_siafi" && empenhoId) {
			if (plan.empenhoEvent) {
				await tx.execute(sql`
					insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa, origem, created_by)
					values (
						${empenhoId}::uuid, ${plan.empenhoEvent.tipo}, ${plan.empenhoEvent.valor},
						(now() at time zone 'America/Sao_Paulo')::date, ${plan.empenhoEvent.justificativa}, 'siafi', ${input.userId}::uuid
					)
				`)
			}
			await tx.execute(sql`update finance.empenho set origem = 'siafi', siafi_synced_at = now() where id = ${empenhoId}::uuid`)
		}

		await tx.execute(sql`
			insert into finance.reconciliation_decision
				(unit_id, documento_tipo, numero_documento, valor_sisub, valor_siafi, decisao, justificativa, decided_by, decided_at)
			values (
				${input.unitId}, ${input.documentoTipo}, ${input.numeroDocumento}, ${plan.valorSisub}, ${plan.valorSiafi},
				${input.decisao}, ${input.justificativa}, ${input.userId}::uuid, now()
			)
			on conflict (unit_id, documento_tipo, numero_documento) do update set
				valor_sisub = excluded.valor_sisub,
				valor_siafi = excluded.valor_siafi,
				decisao = excluded.decisao,
				justificativa = excluded.justificativa,
				decided_by = excluded.decided_by,
				decided_at = excluded.decided_at
		`)

		return {
			valorSisub: plan.valorSisub,
			valorSiafi: plan.valorSiafi,
			empenhoEvent: plan.empenhoEvent ? { tipo: plan.empenhoEvent.tipo, valor: plan.empenhoEvent.valor } : null,
		}
	})
}

/** O erro que chega ao cliente: o motivo de negócio, ou uma frase genérica (o detalhe do driver vai para o log). */
export function toReconciliationDecisionError(error: unknown): Error {
	if (error instanceof ReconciliationDecisionError) return error
	const pg = unwrapPgError(error)
	// O piso do empenho tem frase própria no trigger — repassa a dele.
	if (pg.message?.startsWith("Anulação deixaria")) return new Error(pg.message)
	if (pg.code === "55P03") return new Error("Outro lançamento neste documento está em andamento. Tente de novo em instantes.")
	// biome-ignore lint/suspicious/noConsole: server-side — o detalhe do driver só vai para o log
	console.error("[resolveDivergenceFn]", describeDriverError(error))
	return new Error("Erro ao registrar a decisão da conciliação. Nada foi gravado; tente novamente.")
}
