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
 * Aqui só a conta. A gravação é `finance.empenho_rp`, uma linha por (empenho, exercício, tipo).
 */

import { roundToCents } from "./liquidation-math.ts"

export type RestosAPagarKind = "processado" | "nao_processado"

export const RESTOS_A_PAGAR_LABELS: Record<RestosAPagarKind, string> = {
	processado: "RP processado",
	nao_processado: "RP não processado",
}

/** Saldos do empenho em 31/12, como em `finance.v_empenho_saldo`. */
export interface EmpenhoYearEndBalance {
	valorVigente: number
	valorLiquidado: number
	/** Pago ao credor + retenções recolhidas (o `valor_pago` da view). */
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

export interface RestosAPagarParcel {
	empenhoId: string
	exercicio: number
	tipo: RestosAPagarKind
	valor: number
}

/**
 * As parcelas a gravar para os empenhos de um exercício, sem repetir as que já existem.
 *
 * Idempotente: rodar o encerramento duas vezes não inscreve duas vezes (a unicidade
 * `(empenho_id, exercicio, tipo)` no banco é a segunda barreira). Empenho com as duas partes
 * zeradas não gera parcela.
 */
export function planRestosAPagarInscription(
	exercicio: number,
	empenhos: readonly (EmpenhoYearEndBalance & { empenhoId: string })[],
	existing: readonly { empenhoId: string; exercicio: number; tipo: string }[]
): RestosAPagarParcel[] {
	const already = new Set(existing.filter((row) => row.exercicio === exercicio).map((row) => `${row.empenhoId}:${row.tipo}`))
	const parcels: RestosAPagarParcel[] = []
	for (const empenho of empenhos) {
		const split = splitRestosAPagar(empenho)
		if (split.processado > 0 && !already.has(`${empenho.empenhoId}:processado`)) {
			parcels.push({ empenhoId: empenho.empenhoId, exercicio, tipo: "processado", valor: split.processado })
		}
		if (split.naoProcessado > 0 && !already.has(`${empenho.empenhoId}:nao_processado`)) {
			parcels.push({ empenhoId: empenho.empenhoId, exercicio, tipo: "nao_processado", valor: split.naoProcessado })
		}
	}
	return parcels
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
