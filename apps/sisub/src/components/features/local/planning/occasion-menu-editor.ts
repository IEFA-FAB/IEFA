import type { EditScope } from "@iefa/sisub-domain"
import type { MealTypeInfo } from "@/components/features/local/planning/MealTypeSection"
import { type EventMealDraft, eventDraftFrom, newSupportKitMeal } from "@/lib/event-meals"
import {
	isSnackStandard as isSnackStandardTemplate,
	type OCCASION_MENU_COPY,
	type OccasionMenuType,
	parseMonthlyOccurrences,
	SNACK_MEAL_TYPE_NAME,
	type SnackStandardDraft,
	snackDraftFromTemplate,
	withLegacySnackPortions,
} from "@/lib/occasion-menu"
import { type CatalogFolder, catalogFolderPath } from "@/lib/template-catalog-tree"
import type { MenuTemplate, MenuTemplateWithItems, TemplateItemDraft } from "@/types/domain/planning"

/**
 * Derivações puras do editor de evento ou apoio (`OccasionMenuEditor`). Ficam aqui para o
 * componente só montar a tela e para cada regra ter teste.
 */

export type OccasionMenuCopy = (typeof OCCASION_MENU_COPY)[OccasionMenuType]

/** Cozinha da rota; `null` no catálogo global. */
export function kitchenIdOf(editContext: EditScope): number | null {
	return editContext.scope === "kitchen" ? editContext.kitchenId : null
}

// Template global aberto numa cozinha: salvar vai forkar. `menu_template` não é versionado,
// então a edição in-place de um global a partir da cozinha sobrescreveria o plano da FAB
// inteira sem histórico.
export function isForkOnSave(editContext: EditScope, template: Pick<MenuTemplate, "kitchen_id"> | null | undefined): boolean {
	return editContext.scope === "kitchen" && template != null && template.kitchen_id == null
}

// A rota global só edita o catálogo; um template de cozinha aberto por ela seria recusado
// no salvamento (TEMPLATE_SCOPE_MISMATCH) depois de o usuário já ter editado tudo.
export function isTemplateOutOfContext(
	template: Pick<MenuTemplate, "kitchen_id" | "template_type"> | null | undefined,
	templateType: OccasionMenuType,
	editContext: EditScope
): boolean {
	return template != null && (template.template_type !== templateType || (editContext.scope === "global" && template.kitchen_id != null))
}

/** O que cada contexto (cozinha ou catálogo, evento ou apoio, padrão de lanche) deixa a tela mostrar. */
export function deriveOccasionEditorFlags({
	editContext,
	templateType,
	isSupportMenu,
	snackEnabled,
	willFork,
	kitchenId,
}: {
	editContext: EditScope
	templateType: OccasionMenuType
	isSupportMenu: boolean
	snackEnabled: boolean
	willFork: boolean
	kitchenId: number | null
}) {
	const isSnackStandard = isSupportMenu && snackEnabled
	// Na cozinha tudo termina local (edição in-place ou cópia); no catálogo global é só molde.
	const isKitchenTemplate = editContext.scope === "kitchen"
	// Quantidade ABSOLUTA (pax, efetivo, kits, ocorrências) é da cozinha: o modelo global só guarda
	// a relativa (proporção, preparações por grupo). No padrão de lanche os kits vêm do pedido, e o
	// pax seria lido como porções por kit — por isso ele também não mostra efetivo nem pax.
	const allowAbsolutes = isKitchenTemplate
	const allowMealAbsolutes = allowAbsolutes && !isSnackStandard
	// Modelo global de evento é uma variante: uma refeição. Outra opção é outro modelo na pasta.
	const isGlobalEvent = editContext.scope === "global" && templateType === "event"
	// Evento da cozinha monta-se com refeições de modelos (composição, não herança).
	const canAddModelMeal = editContext.scope === "kitchen" && templateType === "event" && !willFork
	return {
		isSnackStandard,
		isKitchenTemplate,
		allowAbsolutes,
		allowMealAbsolutes,
		isGlobalEvent,
		canAddModelMeal,
		/** Ocorrências por mês são da cozinha: o modelo global não as tem. */
		showOccurrences: isSupportMenu && allowAbsolutes,
		// Aplicar é materializar no calendário de UMA cozinha — não existe no catálogo.
		// Padrão de lanche não entra por aqui: a produção dele nasce do aceite do pedido, e
		// nele o número do item é porções por KIT, não efetivo do dia.
		canApplyToCalendar: kitchenId !== null && !isSnackStandard,
		// No modelo global o horário é sugestão: a cozinha escolhe ao aplicar ou montar.
		isSuggestedSlot: editContext.scope === "global" && !isSnackStandard,
		headcountScope: isSupportMenu ? ("support-meal-kits" as const) : ("event-meal-base" as const),
	}
}

// O apoio sem refeição abre com o "Kit", e o horário dele depende dos tipos de refeição: a
// carga espera por eles (e pelo de sistema dos lanches) para não nascer sem horário.
export function areSlotsReady(isSupportMenu: boolean, mealTypesFetched: boolean, snackMealTypeFetched: boolean): boolean {
	return !isSupportMenu || (mealTypesFetched && snackMealTypeFetched)
}

/** Campos do template (não os itens) que o salvamento manda. */
export function buildOccasionUpdates({
	name,
	description,
	occurrences,
	isSupportMenu,
	allowAbsolutes,
}: {
	name: string
	description: string
	occurrences: string
	isSupportMenu: boolean
	allowAbsolutes: boolean
}) {
	return {
		name: name.trim(),
		description: description.trim() || null,
		// Só o apoio tem recorrência — e só na cozinha. No modelo global vai `null`: limpa o número
		// que um modelo antigo tenha (o servidor o recusaria). Mandar `null` num evento local
		// limparia a coluna à toa.
		...(isSupportMenu || !allowAbsolutes ? { expected_monthly_occurrences: allowAbsolutes ? parseMonthlyOccurrences(occurrences) : null } : {}),
	}
}

type SlotMealType = MealTypeInfo

/** Conteúdo com que o editor abre a partir do template gravado. */
export function buildInitialOccasionContent(
	template: Pick<MenuTemplateWithItems, "name" | "description" | "expected_monthly_occurrences" | "items" | "event_meals"> &
		Parameters<typeof isSnackStandardTemplate>[0] &
		Parameters<typeof snackDraftFromTemplate>[0],
	{
		isSupportMenu,
		templateType,
		mealTypes,
		snackMealType,
	}: {
		isSupportMenu: boolean
		templateType: OccasionMenuType
		mealTypes: readonly SlotMealType[] | undefined
		snackMealType: SlotMealType | null | undefined
	}
): { name: string; description: string; occurrences: string; meals: EventMealDraft[]; items: TemplateItemDraft[]; snack: SnackStandardDraft } {
	const name = template.name ?? ""
	const description = template.description ?? ""
	const occurrences = template.expected_monthly_occurrences != null ? String(template.expected_monthly_occurrences) : ""
	const isSnack = isSupportMenu && isSnackStandardTemplate(template)
	// Padrão gravado antes da proporção única guardava as porções por kit no pax.
	const storedItems = isSnack ? template.items.map(withLegacySnackPortions) : template.items
	const draft = eventDraftFrom(template.event_meals, storedItems, templateType)
	// Apoio sem refeição nenhuma: o kit simples, sem grupos. Padrão de lanche fica no horário de
	// sistema; os demais, no primeiro horário da cozinha (a refeição deixa trocar).
	if (isSupportMenu && draft.meals.length === 0) {
		const slot = (isSnack ? snackMealType?.id : undefined) ?? mealTypes?.[0]?.id ?? snackMealType?.id ?? ""
		draft.meals.push(newSupportKitMeal(slot))
	}
	const meals = isSnack && snackMealType ? draft.meals.map((m) => ({ ...m, meal_type_id: snackMealType.id })) : draft.meals
	return { name, description, occurrences, meals, items: draft.items, snack: snackDraftFromTemplate(template) }
}

/** Procedência das refeições: o nome e a pasta do modelo de onde vieram. */
export function describeMealOrigin(
	scopeTemplates: readonly Pick<MenuTemplate, "id" | "kitchen_id" | "folder_id" | "name">[] | undefined,
	folders: readonly CatalogFolder[] | null | undefined,
	sourceTemplateId: string | null | undefined
): string | null {
	if (!sourceTemplateId) return null
	const source = scopeTemplates?.find((t) => t.id === sourceTemplateId)
	if (!source) return "modelo removido"
	const path = source.kitchen_id == null ? catalogFolderPath(folders, source.folder_id) : null
	return path ? `${path} · ${source.name}` : (source.name ?? "modelo")
}

/**
 * Horários que a refeição pode escolher: os da cozinha e, num apoio com refeição no horário de
 * sistema dos lanches (padrão, ou padrão que deixou de ser), também ele.
 */
export function buildSlotOptions(
	mealTypes: readonly SlotMealType[] | undefined,
	snackMealType: SlotMealType | null | undefined,
	eventMeals: readonly Pick<EventMealDraft, "meal_type_id">[]
): MealTypeInfo[] {
	return [
		...(mealTypes ?? []),
		...(snackMealType && !mealTypes?.some((mt) => mt.id === snackMealType.id) && eventMeals.some((m) => m.meal_type_id === snackMealType.id)
			? [snackMealType]
			: []),
	]
}

/** Nome do horário (tipo de refeição) em que a refeição está. */
export function resolveSlotName(mealTypes: readonly SlotMealType[] | undefined, snackMealType: SlotMealType | null | undefined, mealTypeId: string) {
	return mealTypes?.find((mt) => mt.id === mealTypeId)?.name ?? (snackMealType?.id === mealTypeId ? (snackMealType.name ?? SNACK_MEAL_TYPE_NAME) : null)
}

/** Padrão de lanche: o horário é o de sistema, fixado pelo servidor ao salvar. */
export function lockedSlotNameFor(isSnackStandard: boolean, snackMealType: SlotMealType | null | undefined): string | null {
	return isSnackStandard ? (snackMealType?.name ?? SNACK_MEAL_TYPE_NAME) : null
}

/** Estado do diálogo de refeição: nova (ainda fora do rascunho) ou existente; `open` à parte do conteúdo. */
export type MealDialogState = { meal: EventMealDraft; isNew: boolean; open: boolean } | null

/** Props do diálogo de refeição a partir do estado (fechado e vazio quando não há refeição). */
export function mealDialogViewOf(mealDialog: MealDialogState) {
	return { open: mealDialog?.open ?? false, meal: mealDialog?.meal ?? null, isNew: mealDialog?.isNew ?? false }
}

/** Preparações já na refeição aberta no seletor (nenhuma, sem refeição aberta). */
export function recipeIdsInMeal(items: readonly TemplateItemDraft[], mealTypeId: string | null): string[] {
	return mealTypeId ? items.flatMap((i) => (i.meal_type_id === mealTypeId ? [i.recipe_id] : [])) : []
}

/** Dica do botão Imprimir: com edição pendente, ele salva antes. */
export function printTooltipLabel(hasPendingChanges: boolean, willFork: boolean, copy: OccasionMenuCopy): string {
	return !hasPendingChanges
		? `Imprimir / baixar PDF ${copy.article === "o" ? "do" : "da"} ${copy.noun}`
		: willFork
			? "Salvar a cópia desta cozinha e imprimir"
			: "Salvar e imprimir / baixar PDF"
}

/** Por que o Salvar não pode gravar agora (`null` = pode). Na ordem em que a tela cobra. */
export function saveBlockReason({
	name,
	hasSnackIssues,
	mealWithoutSlot,
	copy,
}: {
	name: string
	hasSnackIssues: boolean
	mealWithoutSlot: Pick<EventMealDraft, "name"> | undefined
	copy: OccasionMenuCopy
}): string | null {
	if (!name.trim()) return `Dê um nome ${copy.article === "o" ? "ao" : "à"} ${copy.noun} antes de salvar.`
	if (hasSnackIssues) return "Corrija os campos do padrão de lanche antes de salvar."
	if (mealWithoutSlot) return `Escolha o horário da refeição "${mealWithoutSlot.name}" antes de salvar.`
	return null
}
