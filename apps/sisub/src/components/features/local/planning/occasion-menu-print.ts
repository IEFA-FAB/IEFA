import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { PrintScope } from "@/components/features/local/planning/MenuPrintParts"
import { collectPreparationSources } from "@/components/features/local/planning/menu-print-data"
import type { PreparationSource } from "@/lib/cardapio-print"
import type { OccasionMenuType } from "@/lib/occasion-menu"
import type { OutdatedRecipe } from "@/lib/recipe-versions"
import type { MenuTemplateWithItems } from "@/types/domain/planning"

/**
 * Derivações da folha impressa de evento e de apoio (`OccasionMenuPrint`), fora do componente
 * para serem testáveis.
 */

type TemplateItem = MenuTemplateWithItems["items"][number]

/** Cardápio de outro tipo, ou de outra cozinha, que esta rota não imprime (ver o chamador). */
export function isOccasionOutOfContext(
	template: Pick<MenuTemplateWithItems, "template_type" | "kitchen_id"> | null | undefined,
	templateType: OccasionMenuType,
	scope: PrintScope
): boolean {
	return (
		template != null &&
		(template.template_type !== templateType ||
			(scope.kind === "global" && template.kitchen_id != null) ||
			(scope.kind === "kitchen" && template.kitchen_id != null && template.kitchen_id !== scope.kitchenId))
	)
}

/** Impressão (e DOCX) segura enquanto falta dado; o porquê de cada parte está no chamador. */
export function isOccasionPrintBlocked(state: {
	ingredientsPending: boolean
	mealTypesPending: boolean
	isSupportMenu: boolean
	snackMealTypePending: boolean
	templateFetching: boolean
}): boolean {
	const slotsPending = state.mealTypesPending || (state.isSupportMenu && state.snackMealTypePending)
	return state.ingredientsPending || slotsPending || state.templateFetching
}

/** Lista de preparações: fichas distintas da folha, só das preparações colocadas numa refeição. */
export function collectOccasionPreparationSources(
	items: readonly Pick<TemplateItem, "recipe_id" | "recipe_origin">[],
	printedRecipeIds: ReadonlySet<string>,
	outdatedById: ReadonlyMap<string, OutdatedRecipe>
): PreparationSource[] {
	return collectPreparationSources(
		items.filter((item) => item.recipe_id && printedRecipeIds.has(item.recipe_id)),
		outdatedById
	)
}

/** Data do evento por extenso, em caixa alta; vazia sem data ou com data inválida. */
export function formatOccasionDateLabel(date: string | undefined): string {
	const parsedDate = date ? parseISO(date) : null
	return parsedDate && !Number.isNaN(parsedDate.getTime()) ? format(parsedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }).toUpperCase() : ""
}
