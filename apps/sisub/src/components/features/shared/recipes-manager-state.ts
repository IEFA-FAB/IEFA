/** Dica abaixo do "Nenhuma preparação encontrada": o filtro mais restritivo ligado explica o vazio. */
export function pickEmptyRecipesHint(filters: { onlyNotReviewed: boolean; onlyWeeklyMenu: boolean; urlSearch: string }): string | null {
	if (filters.onlyNotReviewed) return "Nenhuma preparação pendente de revisão neste filtro"
	if (filters.onlyWeeklyMenu) return "Nenhuma preparação em plano semanal — ajuste o filtro em Opções"
	return filters.urlSearch ? "Tente ajustar os filtros de busca" : null
}

/**
 * Rótulos do "Selecionar Visíveis". Com a tela abrindo recolhida, o visível pode ser ZERO:
 * o nome acessível explica por que o botão está desabilitado, e o texto mostra a contagem.
 */
export function describeSelectVisible(visibleRecipeCount: number): { ariaLabel: string; countSuffix: string } {
	return {
		ariaLabel:
			visibleRecipeCount === 0
				? "Nenhuma preparação visível — expanda uma pasta para selecionar"
				: visibleRecipeCount === 1
					? "Selecionar a preparação visível"
					: `Selecionar as ${visibleRecipeCount} preparações visíveis`,
		countSuffix: visibleRecipeCount > 0 ? ` (${visibleRecipeCount})` : "",
	}
}
