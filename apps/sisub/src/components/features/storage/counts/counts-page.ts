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
export function scopeValueLabel(scope: string): string {
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
