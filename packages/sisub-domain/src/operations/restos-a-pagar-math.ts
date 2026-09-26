/**
 * Inscrição em restos a pagar em DUAS parcelas (achado F6 da auditoria de 2026-09-26).
 *
 * Restos a pagar são as despesas empenhadas e não pagas até 31 de dezembro, distinguindo-se as
 * processadas das não processadas (Lei 4.320, art. 36). Um mesmo empenho costuma ter as duas:
 * a parte liquidada e não paga é RP processado; a parte empenhada e não liquidada é RP não
 * processado (Decreto 93.872/1986, arts. 67-68). `finance.empenho.rp_tipo` só guardava UM tipo,
 * e a inscrição escolhia o não processado sempre que sobrava saldo a liquidar — o processado
 * do mesmo empenho sumia do encerramento.
 *
 * A inscrição é do EXERCÍCIO e se calcula sobre o saldo de 31/12 — não sobre o saldo do dia em
 * que o encerramento roda. A OB de janeiro paga RP; ela não muda o que foi inscrito. Rodar de
 * novo só mexe nas parcelas se o saldo de 31/12 mudou (lançamento retroativo), e aí o CONJUNTO
 * é recalculado: as parcelas vigentes são substituídas, com trilha, nunca somadas.
 *
 * Aqui só a conta. A gravação é `finance.empenho_rp_inscription`.
 */

import { empenhoEventSign } from "./empenho-events.ts"
import { roundToCents } from "./liquidation-math.ts"

export type RestosAPagarKind = "processado" | "nao_processado"

export const RESTOS_A_PAGAR_LABELS: Record<RestosAPagarKind, string> = {
	processado: "RP processado",
	nao_processado: "RP não processado",
}

/** Saldos do empenho em 31/12. */
export interface EmpenhoYearEndBalance {
	valorVigente: number
	valorLiquidado: number
	/** Pago ao credor + retenções recolhidas até 31/12. */
	valorPago: number
}

export interface RestosAPagarSplit {
	/** Liquidado e não pago. */
	processado: number
	/** Empenhado e não liquidado. */
	naoProcessado: number
}

/** As duas parcelas; nenhuma fica negativa (saldo incoerente não vira RP). */
export function splitRestosAPagar(balance: EmpenhoYearEndBalance): RestosAPagarSplit {
	const processado = roundToCents(Number(balance.valorLiquidado) - Number(balance.valorPago))
	const naoProcessado = roundToCents(Number(balance.valorVigente) - Number(balance.valorLiquidado))
	return { processado: Math.max(0, processado), naoProcessado: Math.max(0, naoProcessado) }
}

export interface DatedAmount {
	valor: number
	/** `YYYY-MM-DD` (data civil do documento). */
	data: string
}

/** Os lançamentos do empenho, com data, de onde sai o saldo de uma data de corte. */
export interface EmpenhoLedger {
	valorOriginal: number
	/** Eventos do empenho (reforço, anulação parcial/total, inscrição em RP). */
	events: readonly (DatedAmount & { tipo: string })[]
	/** NS (bruto). */
	liquidacoes: readonly DatedAmount[]
	/** OB ao credor. */
	pagamentos: readonly DatedAmount[]
	/** Retenções recolhidas (data do recolhimento). */
	retencoesRecolhidas: readonly DatedAmount[]
}

/**
 * Saldo do empenho em 31/12 do exercício: só entra o que tem data até o dia 31.
 * NS de dezembro liquidada, OB de janeiro: é RP processado, mesmo que o encerramento rode em
 * janeiro, depois da OB.
 */
export function empenhoBalanceAtYearEnd(ledger: EmpenhoLedger, exercicio: number): EmpenhoYearEndBalance {
	const cutoff = `${exercicio}-12-31`
	const upTo = (rows: readonly DatedAmount[]) => rows.filter((row) => row.data.substring(0, 10) <= cutoff).reduce((acc, row) => acc + Number(row.valor), 0)
	const ajustes = ledger.events
		.filter((event) => event.data.substring(0, 10) <= cutoff)
		.reduce((acc, event) => acc + empenhoEventSign(event.tipo) * Number(event.valor), 0)
	return {
		valorVigente: roundToCents(Number(ledger.valorOriginal) + ajustes),
		valorLiquidado: roundToCents(upTo(ledger.liquidacoes)),
		valorPago: roundToCents(upTo(ledger.pagamentos) + upTo(ledger.retencoesRecolhidas)),
	}
}

export interface RestosAPagarParcel {
	empenhoId: string
	exercicio: number
	tipo: RestosAPagarKind
	valor: number
}

/** Parcela vigente (não substituída) já gravada para o exercício. */
export interface ActiveRpParcel {
	id: string
	kind: string
	amount: number
}

export type RestosAPagarAction =
	/** Nada a fazer: as parcelas vigentes são o saldo de 31/12 (ou não há saldo nem parcela). */
	| { kind: "none"; parcels: []; supersede: [] }
	/** Primeira inscrição. */
	| { kind: "insert"; parcels: RestosAPagarParcel[]; supersede: [] }
	/** Inscrito pelo caminho antigo (`rp_inscrito`, um tipo só): vira parcelas, sem evento novo. */
	| { kind: "migrate_legacy"; parcels: RestosAPagarParcel[]; supersede: [] }
	/** O saldo de 31/12 mudou (lançamento retroativo): o conjunto é substituído, com trilha. */
	| { kind: "replace"; parcels: RestosAPagarParcel[]; supersede: string[] }

function parcelsOf(empenhoId: string, exercicio: number, split: RestosAPagarSplit): RestosAPagarParcel[] {
	const parcels: RestosAPagarParcel[] = []
	if (split.processado > 0) parcels.push({ empenhoId, exercicio, tipo: "processado", valor: split.processado })
	if (split.naoProcessado > 0) parcels.push({ empenhoId, exercicio, tipo: "nao_processado", valor: split.naoProcessado })
	return parcels
}

/**
 * O que a inscrição do exercício faz com UM empenho. Nunca soma parcela nova às vigentes:
 * ou o conjunto já é o saldo de 31/12 (nada), ou é a primeira vez (grava), ou o saldo mudou
 * (substitui tudo). É esta a regra que o botão usa para dizer se há algo a inscrever.
 */
export function reconcileRestosAPagar(input: {
	empenhoId: string
	exercicio: number
	split: RestosAPagarSplit
	active: readonly ActiveRpParcel[]
	legacy: { rpInscrito: boolean; rpExercicio: number | null }
}): RestosAPagarAction {
	const target = parcelsOf(input.empenhoId, input.exercicio, input.split)
	if (input.active.length === 0) {
		if (target.length === 0) return { kind: "none", parcels: [], supersede: [] }
		if (input.legacy.rpInscrito && input.legacy.rpExercicio === input.exercicio) return { kind: "migrate_legacy", parcels: target, supersede: [] }
		return { kind: "insert", parcels: target, supersede: [] }
	}
	const current = new Map(input.active.map((parcel) => [parcel.kind, roundToCents(Number(parcel.amount))]))
	const same = current.size === target.length && target.every((parcel) => current.get(parcel.tipo) === parcel.valor)
	if (same) return { kind: "none", parcels: [], supersede: [] }
	return { kind: "replace", parcels: target, supersede: input.active.map((parcel) => parcel.id) }
}

/**
 * O `rp_tipo` legado (uma coluna só), mantido durante o expand para o código que ainda o lê:
 * não processado quando há alguma parcela não processada, senão processado. É a mesma escolha
 * que a inscrição antiga fazia.
 */
export function legacyRestosAPagarKind(split: RestosAPagarSplit): RestosAPagarKind | null {
	if (split.naoProcessado > 0) return "nao_processado"
	if (split.processado > 0) return "processado"
	return null
}
