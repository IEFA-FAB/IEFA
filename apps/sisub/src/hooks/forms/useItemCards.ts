import { useState } from "react"
import { draftStore } from "@/lib/drafts/draft-store"
import { useDraftKeys } from "./useDraft"

/** Chave do rascunho de um item de lista; `new:<escopo>` para o item em criação. */
export function itemDraftKey(prefix: string, id: string | null | undefined, scopeId: string): string {
	return `${prefix}:${id ?? `new:${scopeId}`}`
}

/**
 * Estado de uma lista de itens editados no próprio card (`CollapsibleItemCard`): um aberto
 * por vez, card "novo" que continua à vista enquanto houver rascunho dele, e o selo de
 * rascunho por item. O editor de cada card monta a mesma chave com `itemDraftKey`.
 */
export function useItemCards(prefix: string, scopeId: string) {
	const draftKeys = useDraftKeys()
	const [openCard, setOpenCard] = useState<string | null>(null)
	const newDraft = draftKeys.has(itemDraftKey(prefix, null, scopeId))

	return {
		isOpen: (card: string) => openCard === card,
		toggle: (card: string) => (open: boolean) => setOpenCard(open ? card : null),
		open: (card: string) => setOpenCard(card),
		close: () => setOpenCard(null),
		hasDraft: (id: string) => draftKeys.has(itemDraftKey(prefix, id, scopeId)),
		hasNewDraft: newDraft,
		showNewCard: openCard === "new" || newDraft,
		/** Item removido: some o rascunho e o card, se estava aberto. */
		forget: (id: string) => {
			draftStore.delete(itemDraftKey(prefix, id, scopeId))
			setOpenCard((current) => (current === id ? null : current))
		},
	}
}
