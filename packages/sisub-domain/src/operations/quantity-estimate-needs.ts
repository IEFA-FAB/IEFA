/**
 * Cálculo puro das necessidades do anexo quantitativo: soma de insumos por seleção (cardápio ×
 * repetições), tradução para o item de compra e ordenação. Sem banco: `computeQuantityEstimateNeeds`
 * (quantity-estimate.ts) lê templates, receitas, pastas e vínculos e chama estas funções.
 */

import type { ProcurementNeed } from "../types/procurement.ts"
import { demandRoundingFor, resolveItemDemand, scaleIngredientQuantity } from "./demand-math.ts"
import type { NeedContribution } from "./quantity-estimate.ts"
import { resolveDeliveryCycle } from "./quantity-estimate-limits.ts"
import { eventItemBase } from "./template-event-meals.ts"

/** Uma seleção de cardápio do anexo, já com a cozinha. `repetitions` = vezes dentro da vigência. */
export type NeedSelection = { templateId: string; repetitions: number; kitchenId: number }

export type NeedTemplateItem = {
	recipeId: string | null
	headcountOverride: number | null
	dayOfWeek: number | null
	mealTypeId: string | null
	recommendedProportion: number | null
	eventMealId: string | null
}
export type NeedTemplate = { id: string; templateType: string | null; menuTemplateItemsInKitchens: NeedTemplateItem[] }

export type NeedIngredientRow = {
	id: string
	description: string | null
	measureUnit: string | null
	folderId: string | null
	defaultDeliveryCycle: string | null
}
export type NeedRecipe = {
	id: string
	portionYield: number | null
	recipeIngredientsInKitchens: { ingredientId: string | null; netQuantity: number | null; ingredientInKitchen: NeedIngredientRow | null }[]
}

export type NeedAccumulator = {
	ingredient: {
		id: string
		description: string | null
		measure_unit: string | null
		default_delivery_cycle: string | null
		folder_id: string | null
		folder?: { id: string; description: string | null } | null
	}
	estimated_quantity: number
}

export type PurchaseItemLink = {
	purchase_item_id: string
	purchase_item_description: string
	purchase_measure_unit: string | null
	catmat_item_codigo: number | null
	catmat_item_descricao: string | null
	unit_price: number | null
	conversion_factor: number
	conservation_class: string | null
}

/**
 * As seleções dos três regimes (weekly, event, exception). `repetitions` já chega normalizado
 * como "vezes dentro da vigência do anexo" — a projeção mensal da exceção é resolvida antes, no
 * wizard.
 */
export function collectNeedSelections(
	kitchenSelections: ReadonlyArray<{
		kitchenId: number
		templateSelections: ReadonlyArray<{ templateId: string; repetitions: number }>
		eventSelections: ReadonlyArray<{ templateId: string; repetitions: number }>
		supportMenuSelections?: ReadonlyArray<{ templateId: string; repetitions: number }>
	}>
): NeedSelection[] {
	return kitchenSelections.flatMap((ks) => [
		...ks.templateSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
		...ks.eventSelections.map((s) => ({ ...s, kitchenId: ks.kitchenId })),
		...(ks.supportMenuSelections ?? []).map((s) => ({ ...s, kitchenId: ks.kitchenId })),
	])
}

/** Efetivo base por (template → dia:refeição). Refeição sem efetivo fica de fora. */
export function buildBaseByTemplateCell(
	templates: readonly { id: string }[],
	mealsByTemplate: ReadonlyMap<string, readonly { dayOfWeek: number; mealTypeId: string; baseHeadcount: number | null }[]>
): Map<string, Map<string, number>> {
	const baseByTemplateCell = new Map<string, Map<string, number>>()
	for (const t of templates) {
		const cells = new Map<string, number>()
		for (const meal of mealsByTemplate.get(t.id) ?? []) {
			if (meal.baseHeadcount != null) cells.set(`${meal.dayOfWeek}:${meal.mealTypeId}`, meal.baseHeadcount)
		}
		baseByTemplateCell.set(t.id, cells)
	}
	return baseByTemplateCell
}

/**
 * Comensais de um item: quantidade direta do item, senão a porcentagem sobre o efetivo base da
 * refeição, senão o efetivo cheio. Sem nenhum dos três o item não tem efetivo dimensionável.
 */
export function resolveNeedHeadcount(
	item: NeedTemplateItem,
	templateType: string | null,
	baseByCell: ReadonlyMap<string, number> | undefined,
	eventMealBases: ReadonlyMap<string, number | null>
): number | null {
	return resolveItemDemand({
		headcountOverride: item.headcountOverride,
		baseHeadcount: eventItemBase(item.eventMealId, eventMealBases, baseByCell?.get(`${item.dayOfWeek}:${item.mealTypeId}`) ?? null),
		recommendedProportion: item.recommendedProportion != null ? Number(item.recommendedProportion) : null,
		rounding: demandRoundingFor(templateType),
	})
}

/** Insumo no formato do acumulador (snake_case), com a pasta resolvida. */
export function toNeedIngredient(
	ingredientRaw: NeedIngredientRow,
	folderById: ReadonlyMap<string, { id: string; description: string | null }>
): NeedAccumulator["ingredient"] {
	const folder = ingredientRaw.folderId ? (folderById.get(ingredientRaw.folderId) ?? null) : null
	return {
		id: ingredientRaw.id,
		description: ingredientRaw.description,
		measure_unit: ingredientRaw.measureUnit,
		default_delivery_cycle: ingredientRaw.defaultDeliveryCycle,
		folder_id: ingredientRaw.folderId,
		folder: folder ? { id: folder.id, description: folder.description } : null,
	}
}

/** Soma a parcela no acumulador do insumo (o primeiro que aparece define o insumo). */
function addToNeed(needsMap: Map<string, NeedAccumulator>, ingredientId: string, ingredient: NeedAccumulator["ingredient"], quantity: number): void {
	const existing = needsMap.get(ingredientId)
	if (existing) {
		existing.estimated_quantity += quantity
	} else {
		needsMap.set(ingredientId, { ingredient, estimated_quantity: quantity })
	}
}

export type NeedSources = {
	templateMap: ReadonlyMap<string, NeedTemplate>
	recipeById: ReadonlyMap<string, NeedRecipe>
	folderById: ReadonlyMap<string, { id: string; description: string | null }>
	baseByTemplateCell: ReadonlyMap<string, ReadonlyMap<string, number>>
	eventMealBases: ReadonlyMap<string, number | null>
}

/** Parcelas de UM item de cardápio numa seleção: uma por ingrediente da receita. */
function accumulateItemNeeds(
	needsMap: Map<string, NeedAccumulator>,
	selection: NeedSelection,
	template: NeedTemplate,
	item: NeedTemplateItem,
	recipeData: NeedRecipe,
	headcount: number,
	sources: NeedSources,
	collect: NeedContribution[] | undefined
): void {
	const portionYield = Number(recipeData.portionYield ?? 0)

	for (const ri of recipeData.recipeIngredientsInKitchens) {
		const ingredientRaw = ri.ingredientInKitchen
		if (!ingredientRaw || !ri.ingredientId) continue

		const ingredient = toNeedIngredient(ingredientRaw, sources.folderById)

		// Aquisição: projeta o cardápio × repetições da seleção do anexo.
		const quantityNeeded = scaleIngredientQuantity(Number(ri.netQuantity ?? 0), headcount, portionYield, selection.repetitions)
		collect?.push({
			ingredientId: ri.ingredientId,
			kitchenId: selection.kitchenId,
			templateId: selection.templateId,
			templateType: template.templateType ?? null,
			recipeId: item.recipeId as string,
			headcount,
			netQuantity: Number(ri.netQuantity ?? 0),
			portionYield,
			repetitions: selection.repetitions,
			quantity: quantityNeeded,
		})

		addToNeed(needsMap, ri.ingredientId, ingredient, quantityNeeded)
	}
}

/**
 * Quantidade de cada insumo somada sobre todas as seleções (weekly + events + exceptions). Com
 * `collect`, registra cada parcela na mesma travessia que produz o número.
 */
export function accumulateNeeds(selections: readonly NeedSelection[], sources: NeedSources, collect?: NeedContribution[]): Map<string, NeedAccumulator> {
	const needsMap = new Map<string, NeedAccumulator>()

	for (const selection of selections) {
		const template = sources.templateMap.get(selection.templateId)
		if (!template) continue
		const baseByCell = sources.baseByTemplateCell.get(selection.templateId)

		for (const item of template.menuTemplateItemsInKitchens) {
			const recipeData = item.recipeId ? sources.recipeById.get(item.recipeId) : undefined
			if (!recipeData) continue

			const headcount = resolveNeedHeadcount(item, template.templateType, baseByCell, sources.eventMealBases)
			// Sem efetivo a preparação não entra na conta. Não é silêncio: o fluxo "Prever demanda
			// para compra" lista o cardápio em "sem efetivo" antes do envio (menusWithoutHeadcount).
			if (!headcount) continue

			accumulateItemNeeds(needsMap, selection, template, item, recipeData, headcount, sources, collect)
		}
	}
	return needsMap
}

/** Necessidade final de um insumo, traduzida para o item de compra padrão quando há vínculo. */
export function toProcurementNeed(ingredientId: string, d: NeedAccumulator, pi: PurchaseItemLink | undefined): ProcurementNeed {
	const purchaseQuantity = pi ? Number((d.estimated_quantity / pi.conversion_factor).toFixed(4)) : null
	return {
		folder_id: d.ingredient.folder_id,
		folder_description: d.ingredient.folder?.description || null,
		ingredient_id: ingredientId,
		ingredient_name: d.ingredient.description || "",
		measure_unit: d.ingredient.measure_unit,
		estimated_quantity: Number(d.estimated_quantity.toFixed(4)),
		purchase_item_id: pi?.purchase_item_id ?? null,
		purchase_item_description: pi?.purchase_item_description ?? null,
		purchase_measure_unit: pi?.purchase_measure_unit ?? null,
		purchase_quantity: purchaseQuantity,
		conversion_factor: pi?.conversion_factor ?? null,
		catmat_item_codigo: pi?.catmat_item_codigo ?? null,
		catmat_item_descricao: pi?.catmat_item_descricao ?? null,
		unit_price: pi?.unit_price ?? null,
		item_description: null,
		conservation_class: pi?.conservation_class ?? null,
		ingredient_delivery_cycle: d.ingredient.default_delivery_cycle,
		// O cálculo já decide o ciclo deste anexo a partir do insumo; daqui em diante ele é
		// escolha GRAVADA no item, e mudar o insumo não mexe no anexo montado.
		delivery_cycle: resolveDeliveryCycle({ ingredientCycle: d.ingredient.default_delivery_cycle, conservationClass: pi?.conservation_class }).cycle,
	}
}

/** Ordem do anexo: pasta (sem pasta = "Sem categoria"), depois insumo, em pt-BR. */
export function compareProcurementNeeds(
	a: Pick<ProcurementNeed, "folder_description" | "ingredient_name">,
	b: Pick<ProcurementNeed, "folder_description" | "ingredient_name">
): number {
	const folderA = a.folder_description || "Sem categoria"
	const folderB = b.folder_description || "Sem categoria"
	if (folderA !== folderB) return folderA.localeCompare(folderB, "pt-BR")
	return a.ingredient_name.localeCompare(b.ingredient_name, "pt-BR")
}
