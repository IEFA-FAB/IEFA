/**
 * Rótulos e derivações puras da tela de inventário (`storage/$kitchenId/counts`).
 */

import { INVENTORY_COUNT_TYPE_LABELS } from "@iefa/sisub-domain"

export const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 })

export const TYPE_LABELS: Record<string, string> = INVENTORY_COUNT_TYPE_LABELS

export const SCOPE_LABELS: Record<string, string> = {
	full: "Estoque inteiro",
	conservation_class: "Por classe de conservação",
	location: "Por local",
	item_list: "Lista de itens",
	menu_cycle: "Ciclo do cardápio",
}

export const STATUS_LABELS: Record<string, string> = {
	draft: "Rascunho",
	counting: "Em contagem",
	review: "Em revisão",
	recount: "Recontagem aberta",
	approved: "Aprovada",
	rejected: "Rejeitada",
	expired: "Expirada",
	confirmed: "Confirmada",
}

export type ScannedTarget = { ingredientId: string; lotId: string | null; description: string }

type SheetLike<L> = { count: { status: string }; lines: L[] }

/** Estado da folha aberta: coleta, revisão, alvo lido no escopo e linhas a recontar. */
export function deriveCountState<L extends { ingredientId: unknown; ownRound: boolean; needsRecount: unknown }>(
	sheet: SheetLike<L> | null,
	scanned: ScannedTarget | null
) {
	const open = sheet?.count.status === "counting"
	const scannedInScope = scanned != null && (sheet?.lines ?? []).some((line) => line.ingredientId === scanned.ingredientId)
	const inReview = sheet?.count.status === "review"
	// só as linhas DESTA rodada se recontam; as da rodada anterior já ficaram decididas
	const divergent = (sheet?.lines ?? []).filter((line) => line.ownRound && line.needsRecount === true)
	return { open, scannedInScope, inReview, divergent }
}

/** Escopo com valor livre: o rótulo do campo. */
export function getScopeValueLabel(scope: string): string {
	return scope === "menu_cycle" ? "Dias do ciclo" : scope === "location" ? "Local" : "Classe"
}

/** Escopo que pede valor (ciclo, local, classe); estoque inteiro e lista de itens não. */
export function hasScopeValue(scope: string): boolean {
	return scope !== "full" && scope !== "item_list"
}

/** Parâmetros do escopo na abertura do inventário. */
export function buildScopeParams(scope: string, scopeValue: string): Record<string, unknown> {
	const params: Record<string, unknown> = {}
	if (scope === "menu_cycle") params.days = Number(scopeValue) || 7
	if (scope === "location") params.location = scopeValue
	if (scope === "conservation_class") params.conservation_class = scopeValue
	return params
}

/**
 * Chaves de idempotência dos lançamentos, uma por INTENÇÃO: o lançamento da linha que ainda não
 * foi confirmado.
 *
 * O índice único `(count_id, client_event_id)` só deduplica se o reenvio levar a mesma chave.
 * Gerada por tentativa (com `Date.now()`), dois cliques seguidos, ou o reenvio depois de a rede
 * cair com o lançamento já gravado, viravam dois lançamentos. Aqui a chave nasce no primeiro
 * envio da linha e é reaproveitada até o sucesso ({@link releaseEntryKey}), MESMO que o valor
 * mude: a tentativa anterior pode ter sido gravada (resposta perdida), e o servidor corrige o
 * lançamento daquela chave para o valor novo em vez de somar os dois. Depois do sucesso, o
 * próximo lançamento da mesma linha é outra contagem e ganha outra chave.
 */
export type EntryIntentKeys = Map<string, string>

/** Chave do lançamento da linha: a da intenção ainda não confirmada, ou uma nova. */
export function claimEntryKey(keys: EntryIntentKeys, lineKey: string, generateId: () => string = () => crypto.randomUUID()): string {
	const pending = keys.get(lineKey)
	if (pending) return pending
	const clientEventId = generateId()
	keys.set(lineKey, clientEventId)
	return clientEventId
}

/** Depois do sucesso, a linha volta a aceitar um lançamento novo (com outra chave). */
export function releaseEntryKey(keys: EntryIntentKeys, lineKey: string, clientEventId: string): void {
	// Só a chave que foi enviada: um envio posterior pode já ter renovado a intenção.
	if (keys.get(lineKey) === clientEventId) keys.delete(lineKey)
}
