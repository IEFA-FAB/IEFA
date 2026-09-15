import type { RecipeSummary } from "@iefa/sisub-domain"
import { useMemo } from "react"
import { findOutdatedRecipes, indexLatestByLineage, type OutdatedRecipe, type RecipeVersionRef } from "@/lib/recipe-versions"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

/**
 * Índice de versões para um editor de cardápio.
 *
 * `recipeById` junta as linhas que o template carregou (`recipe_origin`, inclusive versões
 * antigas) com a listagem (só a vencedora de cada linhagem, cobre o que o usuário acabou de
 * adicionar). Resolver o item só pela listagem era o que fazia a versão antiga sumir da tela.
 */
export function useTemplateRecipeVersions(
	templateItems: MenuTemplateWithItems["items"] | undefined,
	catalog: RecipeSummary[] | undefined,
	items: readonly { recipe_id: string }[]
) {
	const recipeById = useMemo(() => {
		const byId = new Map<string, RecipeVersionRef>()
		for (const item of templateItems ?? []) {
			if (item.recipe_origin) byId.set(item.recipe_origin.id, item.recipe_origin)
		}
		for (const recipe of catalog ?? []) byId.set(recipe.id, recipe)
		return byId
	}, [templateItems, catalog])

	const latestByLineage = useMemo(() => indexLatestByLineage(catalog ?? []), [catalog])

	const outdated = useMemo(
		() =>
			findOutdatedRecipes(
				items.map((i) => i.recipe_id),
				recipeById,
				latestByLineage
			),
		[items, recipeById, latestByLineage]
	)

	const outdatedById = useMemo(() => new Map<string, OutdatedRecipe>(outdated.map((o) => [o.current.id, o])), [outdated])

	return { recipeById, outdated, outdatedById }
}
