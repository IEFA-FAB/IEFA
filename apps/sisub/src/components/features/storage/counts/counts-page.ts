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
 * envio da linha e é reaproveitada até a confirmação, MESMO que o valor mude: a tentativa anterior
 * pode ter sido gravada (resposta perdida), e o servidor corrige o lançamento daquela chave para o
 * valor novo em vez de somar os dois (e a resposta diz que corrigiu).
 *
 * Confirmação é o sucesso ({@link releaseEntryKey}) OU a folha relida já trazer o lançamento da
 * chave ({@link settleRecordedEntryKeys}). Sem a segunda, a linha mostrava os 15 gravados e o 10
 * digitado depois (outra prateleira) ia com a chave antiga: o servidor tratava como correção e a
 * linha ficava 10 em vez de 25.
 */
/** Quantidade nas mensagens: as 4 casas que o banco guarda. */
const QTY = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 })

export type PendingEntry = { clientEventId: string; quantity: number }
export type EntryIntentKeys = Map<string, PendingEntry>

/** Chave do lançamento da linha: a da intenção ainda não confirmada, ou uma nova. */
export function claimEntryKey(keys: EntryIntentKeys, lineKey: string, quantity: number, generateId: () => string = () => crypto.randomUUID()): string {
	const pending = keys.get(lineKey)
	const clientEventId = pending?.clientEventId ?? generateId()
	// a quantidade é a do último envio: é ela que a folha relida pode mostrar gravada
	keys.set(lineKey, { clientEventId, quantity })
	return clientEventId
}

/** Depois do sucesso, a linha volta a aceitar um lançamento novo (com outra chave). */
export function releaseEntryKey(keys: EntryIntentKeys, lineKey: string, clientEventId: string): void {
	// Só a chave que foi enviada: um envio posterior pode já ter renovado a intenção.
	if (keys.get(lineKey)?.clientEventId === clientEventId) keys.delete(lineKey)
}

export type SettledEntry = { lineKey: string; quantity: number }

/**
 * Libera as intenções que a folha relida já mostra gravadas (a resposta se perdeu, o lançamento
 * entrou). Devolve as liberadas, para a tela limpar o campo e avisar.
 */
export function settleRecordedEntryKeys(keys: EntryIntentKeys, recordedKeys: Iterable<string>): SettledEntry[] {
	const recorded = new Set(recordedKeys)
	const settled: SettledEntry[] = []
	for (const [lineKey, pending] of keys) {
		if (!recorded.has(pending.clientEventId)) continue
		keys.delete(lineKey)
		settled.push({ lineKey, quantity: pending.quantity })
	}
	return settled
}

/** Quantidade digitada no campo, ou nula se não for número. */
export function parseCountQuantity(text: string): number | null {
	const value = Number(text.replace(",", "."))
	return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Campos das linhas liberadas: limpa o que ainda mostra o valor gravado (lançar de novo somaria
 * o mesmo número). O que o operador já trocou fica.
 */
export function clearSettledQuantities(quantities: Record<string, string>, settled: readonly SettledEntry[]): Record<string, string> {
	let next = quantities
	for (const { lineKey, quantity } of settled) {
		const typed = quantities[lineKey]
		if (typed == null || parseCountQuantity(typed) !== quantity) continue
		if (next === quantities) next = { ...quantities }
		next[lineKey] = ""
	}
	return next
}

/** Chave de linha do alvo lido pelo scanner. */
export function getScanLineKey(scanned: Pick<ScannedTarget, "ingredientId" | "lotId">): string {
	return `scan:${scanned.ingredientId}:${scanned.lotId ?? "item"}`
}

/** Aviso das intenções que a folha mostrou gravadas. */
export function describeSettledEntries(settled: readonly SettledEntry[]): string {
	if (settled.length === 1) {
		return `O lançamento de ${QTY.format(settled[0].quantity)} já estava gravado (a resposta tinha se perdido) e aparece na folha. Um novo lançamento da linha soma.`
	}
	return `${settled.length} lançamentos já estavam gravados (a resposta tinha se perdido) e aparecem na folha. Um novo lançamento da linha soma.`
}

/** Mensagem de sucesso do envio, dizendo quando um envio anterior foi corrigido. */
export function describePostedEntry(result: { corrected: number }, quantity: number): string {
	return result.corrected > 0
		? `O envio anterior desta linha tinha sido gravado; o lançamento foi corrigido para ${QTY.format(quantity)}`
		: "Lançamento registrado"
}
