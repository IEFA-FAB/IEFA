/**
 * Vocabulário dos eventos de `finance.empenho_event` (achado F8 da auditoria de 2026-09-26).
 *
 * "Cancelamento" é termo de restos a pagar: é o que se faz com o RP não pago que prescreve ou
 * deixa de ser devido (Decreto 93.872/1986, arts. 68-70). A anulação total da NE no próprio
 * exercício é ANULAÇÃO (Lei 4.320, art. 38; a NE de anulação no SIAFI). O banco gravava
 * `cancelamento` para as duas coisas.
 *
 * Expand/contract (migration 20260926216000):
 * - expand (agora): o CHECK aceita `anulacao_total`; views, triggers e esta leitura tratam
 *   `cancelamento` e `anulacao_total` como a mesma coisa; código novo grava `anulacao_total`.
 * - contract (PR posterior, depois de um ciclo): `update … set tipo = 'anulacao_total' where
 *   tipo = 'cancelamento'`, e `cancelamento` fica reservado ao cancelamento de RP.
 */

/** Anulação total da NE no exercício. É o valor que código novo grava. */
export const EMPENHO_TOTAL_ANNULMENT_EVENT = "anulacao_total"

/** Valor legado com o mesmo sentido; só lido, nunca gravado por código novo. */
export const LEGACY_EMPENHO_TOTAL_ANNULMENT_EVENT = "cancelamento"

export const EMPENHO_EVENT_KINDS = ["reforco", "anulacao", EMPENHO_TOTAL_ANNULMENT_EVENT, LEGACY_EMPENHO_TOTAL_ANNULMENT_EVENT, "rp_inscricao"] as const

export type EmpenhoEventKind = (typeof EMPENHO_EVENT_KINDS)[number]

/** Rótulo para a tela: o legado aparece com o nome certo. */
export const EMPENHO_EVENT_LABELS: Record<EmpenhoEventKind, string> = {
	reforco: "Reforço",
	anulacao: "Anulação parcial",
	anulacao_total: "Anulação total",
	cancelamento: "Anulação total",
	rp_inscricao: "Inscrição em RP",
}

/** Anulação total, com o nome novo ou o legado. */
export function isTotalAnnulmentEvent(tipo: string): boolean {
	return tipo === EMPENHO_TOTAL_ANNULMENT_EVENT || tipo === LEGACY_EMPENHO_TOTAL_ANNULMENT_EVENT
}

/** Qualquer anulação (parcial ou total): é o que o piso do empenho confere. */
export function isAnnulmentEvent(tipo: string): boolean {
	return tipo === "anulacao" || isTotalAnnulmentEvent(tipo)
}

/** Efeito do evento no valor vigente: +1 reforço, −1 anulação, 0 o que é só registro (RP). */
export function empenhoEventSign(tipo: string): 1 | -1 | 0 {
	if (tipo === "reforco") return 1
	if (isAnnulmentEvent(tipo)) return -1
	return 0
}
