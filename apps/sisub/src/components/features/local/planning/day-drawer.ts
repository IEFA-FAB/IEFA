import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { findOutdatedRecipes, indexLatestByLineage, type OutdatedRecipe, type RecipeVersionRef } from "@/lib/recipe-versions"
import type { DailyMenuWithItems, MenuItem } from "@/types/domain/planning"

/** Derivações puras da gaveta do dia (`DayDrawer`). */

/** Data do dia no formato da URL e das server functions; "" sem dia aberto. */
export function toIsoDate(date: Date | null): string {
	return date ? format(date, "yyyy-MM-dd") : ""
}

/** Título da gaveta: "segunda-feira, 13 de outubro"; "" sem dia aberto. */
export function formatDayTitle(date: Date | null): string {
	return date ? format(date, "EEEE, dd 'de' MMMM", { locale: ptBR }) : ""
}

type DayMenu = Pick<DailyMenuWithItems, "meal_type_id"> & {
	menu_items?: readonly { recipe_origin?: RecipeVersionRef | null }[] | null
}

/**
 * Fichas do dia em versão antiga. O dia congela a ficha na aplicação; `recipe_origin` traz a
 * linha exata (com versão e linhagem), e o catálogo da cozinha diz qual é a vencedora.
 */
export function collectOutdatedById(dayMenus: readonly DayMenu[] | undefined, catalog: readonly RecipeVersionRef[] | undefined): Map<string, OutdatedRecipe> {
	const byId = new Map<string, RecipeVersionRef>()
	const ids: string[] = []
	for (const menu of dayMenus ?? []) {
		for (const item of menu.menu_items ?? []) {
			if (!item.recipe_origin) continue
			byId.set(item.recipe_origin.id, item.recipe_origin)
			ids.push(item.recipe_origin.id)
		}
	}
	const outdated = findOutdatedRecipes(ids, byId, indexLatestByLineage(catalog ?? []))
	return new Map<string, OutdatedRecipe>(outdated.map((o) => [o.current.id, o]))
}

/** Refeições do dia, uma por tipo de refeição da cozinha, com o cardápio do dia quando houver. */
export function buildDayMeals<T extends { id: string }, M extends Pick<DailyMenuWithItems, "meal_type_id">>(
	mealTypes: readonly T[] | undefined,
	dayMenus: readonly M[] | undefined
): { mealType: T; menu: M | undefined }[] {
	return (
		mealTypes?.map((mealType) => ({
			mealType,
			menu: dayMenus?.find((m) => m.meal_type_id === mealType.id),
		})) || []
	)
}

/** Cardápio do dia no tipo de refeição de sistema dos lanches (fora de `mealTypes`). */
export function findSnackMenu<M extends Pick<DailyMenuWithItems, "meal_type_id">>(
	snackMealType: { id: string } | null | undefined,
	dayMenus: readonly M[] | undefined
): M | undefined {
	return snackMealType ? dayMenus?.find((m) => m.meal_type_id === snackMealType.id) : undefined
}

/** Descrição do seletor de troca de preparação. */
export function replaceRecipeDescription(replaceItem: Pick<MenuItem, "recipe"> | null): string {
	return `No lugar de “${(replaceItem?.recipe as { name?: string } | null)?.name ?? "preparação"}”. Porções, grupo e origem ficam.`
}
