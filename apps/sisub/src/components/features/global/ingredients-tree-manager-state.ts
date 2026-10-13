import type { FlatIngredientTree, Folder, IngredientDialogState } from "@/types/domain/ingredients"

/**
 * Contagem do que está efetivamente visível (após busca + chips). `byId` contém todos os
 * nós incluídos, independente de expand/collapse → reflete o filtro.
 */
export function countVisibleNodes(flatTree: FlatIngredientTree | null | undefined): { folders: number; ingredients: number } {
	let folders = 0
	let ingredients = 0
	if (flatTree) {
		for (const node of Object.values(flatTree.byId)) {
			if (node.type === "folder") folders++
			else if (node.type === "ingredient") ingredients++
		}
	}
	return { folders, ingredients }
}

/** Pasta a editar no dialog: só em modo edição e só quando o dado é de fato uma pasta. */
export function folderToEdit(dialogState: IngredientDialogState): Folder | undefined {
	return dialogState.mode === "edit" && dialogState.data && "parent_id" in dialogState.data ? (dialogState.data as Folder) : undefined
}

/**
 * Dica abaixo do "nada encontrado". Com busca ativa, a dica é ajustar a busca: culpar o
 * recorte do cardápio global mandaria desligar um filtro que não é a causa.
 */
export function pickEmptyTreeHint(
	filters: { onlyNotReviewed: boolean; urlSearch: string; onlyGlobalMenu: boolean },
	texts: { emptyReview: string; emptyGlobalMenu: string }
): string | null {
	if (filters.onlyNotReviewed) return texts.emptyReview
	if (filters.urlSearch) return "Tente ajustar os filtros de busca"
	return filters.onlyGlobalMenu ? texts.emptyGlobalMenu : null
}
