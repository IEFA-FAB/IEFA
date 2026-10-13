/**
 * Cálculo puro da aplicação de um cardápio-modelo ao calendário: quais datas, que dia do modelo
 * cai em cada data, como os itens se agrupam por refeição e que linhas de `daily_menu` e
 * `menu_items` saem disso. Sem banco: `applyTemplate` e `applyEventTemplate` (templates.ts) leem,
 * chamam estas funções e gravam o resultado na transação deles.
 */

import type { dailyMenuInKitchen, menuItemsInKitchen, menuTemplateItemsInKitchen } from "@iefa/database/drizzle/sisub"
import { toWire } from "../utils/index.ts"
import { demandRoundingFor, resolveItemDemand } from "./demand-math.ts"
import type { TemplateEventMealWire } from "./template-event-meals.ts"
import { eventItemBase, mergeSlotItems } from "./template-event-meals.ts"

type TemplateItemRow = typeof menuTemplateItemsInKitchen.$inferSelect
type DailyMenuInsert = typeof dailyMenuInKitchen.$inferInsert
type MenuItemInsert = typeof menuItemsInKitchen.$inferInsert

/** Item do modelo com o que a materialização lê: a célula, a demanda e a receita de origem (com ingredientes). */
export type MaterializableItem = Pick<
	TemplateItemRow,
	"dayOfWeek" | "mealTypeId" | "recipeId" | "headcountOverride" | "recommendedProportion" | "itemGroup" | "sortOrder" | "eventMealId"
> & { recipesInKitchen: unknown }

// ── Semanal ──

/**
 * Datas (YYYY-MM-DD) que a aplicação semanal toca.
 *
 * Iteração em UTC: as colunas são calendário puro (sem hora), então tratar a string como
 * meia-noite UTC e avançar com setUTCDate torna o cálculo determinístico e independente do fuso
 * do servidor. O bug antigo misturava parse UTC (`new Date("YYYY-MM-DD")`) com
 * `getDay()`/`getDate()` locais, o que deslocava o dia da semana em servidores de offset negativo
 * (ex.: Brasil UTC-3).
 */
export function listApplyDates(input: { dates?: string[]; startDate: string; endDate: string }): string[] {
	const allDates: string[] = []
	if (input.dates && input.dates.length > 0) {
		// Datas escolhidas a dedo (ctrl+clique no calendário): só elas são tocadas. Expandir
		// entre a menor e a maior faria o "replace" apagar os dias do meio, que o usuário não
		// escolheu — e o preview da tela lista só os escolhidos.
		allDates.push(...new Set(input.dates))
		allDates.sort()
	} else {
		for (let d = new Date(`${input.startDate}T00:00:00Z`); d <= new Date(`${input.endDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
			allDates.push(d.toISOString().slice(0, 10))
		}
	}
	return allDates
}

/** Dia do modelo (1…7) que cai na data, com a semana do modelo começando em `startDayOfWeek` (1=Seg … 7=Dom). */
export function computeTemplateDayForDate(dateStr: string, startDayOfWeek: number): number {
	const jsDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay() // 0=Dom … 6=Sáb
	const dateDayOfWeek = jsDay === 0 ? 7 : jsDay // 1=Seg … 7=Dom
	return ((dateDayOfWeek - startDayOfWeek + 7) % 7) + 1
}

/**
 * Efetivo base por (dia + refeição) — grão natural do efetivo. É a fonte primária do
 * forecasted_headcount na materialização; o headcount_override do item é só exceção.
 */
export function buildBaseHeadcountByCell(meals: readonly { dayOfWeek: number; mealTypeId: string; baseHeadcount: number | null }[]): Map<string, number> {
	const baseByCell = new Map<string, number>()
	for (const meal of meals) {
		if (meal.baseHeadcount != null) baseByCell.set(`${meal.dayOfWeek}:${meal.mealTypeId}`, meal.baseHeadcount)
	}
	return baseByCell
}

/** Snapshot snake_case com `ingredients` aninhado — idêntico ao addMenuItem. */
export function buildRecipeSnapshot(recipe: unknown): Record<string, unknown> {
	return recipe ? toWire<Record<string, unknown>>(recipe, { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" }) : {}
}

/** Agrupa por refeição os itens do dia do modelo; item sem refeição não tem onde materializar e conta como descartado. */
export function groupWeeklyItemsByMealType<T extends MaterializableItem>(
	items: readonly T[],
	templateDay: number
): { byMealType: Record<string, T[]>; skipped: number } {
	const byMealType: Record<string, T[]> = {}
	let skipped = 0
	for (const item of items.filter((i) => i.dayOfWeek === templateDay)) {
		if (!item.mealTypeId) {
			skipped++
			continue
		}
		if (!byMealType[item.mealTypeId]) byMealType[item.mealTypeId] = []
		byMealType[item.mealTypeId].push(item)
	}
	return { byMealType, skipped }
}

/**
 * Efetivo da refeição (ponte aquisição→produção): o informado nesta aplicação, senão o efetivo
 * BASE do cardápio (grão dia+refeição). Sem nenhum dos dois o dia nasce com "efetivo a definir",
 * e informá-lo depois calcula as porções (`updateHeadcount`). A média dos pax dos itens já foi
 * usada aqui como efetivo; ela misturava a exceção de um item com o número da refeição inteira.
 */
export function resolveWeeklyMealHeadcount(
	appliedHeadcount: ReadonlyMap<string, number | null>,
	baseByCell: ReadonlyMap<string, number>,
	templateDay: number,
	mealTypeId: string
): number | null {
	return appliedHeadcount.has(mealTypeId) ? (appliedHeadcount.get(mealTypeId) ?? null) : (baseByCell.get(`${templateDay}:${mealTypeId}`) ?? null)
}

/** Linhas de `menu_items` de uma célula semanal; item sem receita é descartado (e contado). */
export function buildWeeklyMenuItemRows(
	menuId: string,
	items: readonly MaterializableItem[],
	mealHeadcount: number | null,
	templateId: string
): { rows: MenuItemInsert[]; skipped: number } {
	const rows: MenuItemInsert[] = []
	let skipped = 0
	for (const item of items) {
		if (!item.recipeId) {
			skipped++
			continue
		}
		// Porção planejada: quantidade direta do item, senão a porcentagem sobre o efetivo
		// da refeição, senão o efetivo cheio.
		const plannedPortion = resolveItemDemand({
			headcountOverride: item.headcountOverride,
			baseHeadcount: mealHeadcount,
			recommendedProportion: item.recommendedProportion != null ? Number(item.recommendedProportion) : null,
		})
		rows.push({
			dailyMenuId: menuId,
			recipeOriginId: item.recipeId,
			recipe: buildRecipeSnapshot(item.recipesInKitchen),
			plannedPortionQuantity: plannedPortion ?? null,
			// Preserva grupo/ordem/proporção do template no cardápio materializado.
			itemGroup: item.itemGroup,
			sortOrder: item.sortOrder ?? 0,
			recommendedProportion: item.recommendedProportion,
			// Rastreabilidade: de qual template (e regime) o item veio.
			originTemplateId: templateId,
			originTemplateType: "weekly",
		})
	}
	return { rows, skipped }
}

export type WeeklyMaterializationPlan = {
	newMenus: DailyMenuInsert[]
	newMenuItems: MenuItemInsert[]
	/** Itens do template descartados por dado incompleto (sem refeição ou sem receita). */
	itemsSkipped: number
	/** Datas com pelo menos uma refeição preservada (grão célula). */
	datesSkipped: Set<string>
}

/**
 * Menus + itens novos da aplicação semanal, data a data.
 *
 * conflictMode="skip": preserva CÉLULAS (dia + refeição) que já têm cardápio ativo e só
 * materializa as vazias — um dia com só o Almoço planejado ainda recebe Café/Jantar do template.
 */
export function planWeeklyMaterialization(params: {
	templateItems: readonly MaterializableItem[]
	dates: readonly string[]
	startDayOfWeek: number
	conflictMode: "replace" | "skip"
	occupiedCells: ReadonlySet<string>
	appliedHeadcount: ReadonlyMap<string, number | null>
	baseByCell: ReadonlyMap<string, number>
	kitchenId: number
	templateId: string
	newMenuId?: () => string
}): WeeklyMaterializationPlan {
	const newMenuId = params.newMenuId ?? (() => crypto.randomUUID())
	const plan: WeeklyMaterializationPlan = { newMenus: [], newMenuItems: [], itemsSkipped: 0, datesSkipped: new Set<string>() }

	for (const dateStr of params.dates) {
		const templateDay = computeTemplateDayForDate(dateStr, params.startDayOfWeek)
		const { byMealType, skipped } = groupWeeklyItemsByMealType(params.templateItems, templateDay)
		plan.itemsSkipped += skipped

		for (const [mealTypeId, items] of Object.entries(byMealType)) {
			// Célula já planejada + modo preservar → não mexe nela.
			if (params.conflictMode === "skip" && params.occupiedCells.has(`${dateStr}:${mealTypeId}`)) {
				plan.datesSkipped.add(dateStr)
				continue
			}
			const mealHeadcount = resolveWeeklyMealHeadcount(params.appliedHeadcount, params.baseByCell, templateDay, mealTypeId)
			const menuId = newMenuId()
			const cell = buildWeeklyMenuItemRows(menuId, items, mealHeadcount, params.templateId)
			plan.itemsSkipped += cell.skipped
			// Não cria refeição vazia se todos os itens foram descartados.
			if (cell.rows.length === 0) continue
			plan.newMenus.push({ id: menuId, serviceDate: dateStr, mealTypeId, kitchenId: params.kitchenId, status: "PLANNED", forecastedHeadcount: mealHeadcount })
			plan.newMenuItems.push(...cell.rows)
		}
	}
	return plan
}

// ── Evento e apoio ──

/** Efetivo de cada refeição do evento: o informado nesta aplicação (kits, no apoio) vence o da refeição; `null` = a definir. */
export function buildEventMealBases(
	eventMeals: readonly Pick<TemplateEventMealWire, "id" | "base_headcount">[],
	appliedHeadcount: ReadonlyMap<string, number | null>
): Map<string, number | null> {
	return new Map(eventMeals.map((m) => [m.id, appliedHeadcount.has(m.id) ? (appliedHeadcount.get(m.id) ?? null) : m.base_headcount]))
}

/**
 * Demanda de cada item resolvida ANTES de juntar refeições do mesmo horário: cada item mede pela
 * própria refeição (pax, senão % do efetivo dela, senão o efetivo cheio). Resolver depois de
 * juntar faria a primeira refeição falar pelas duas — 300 em vez de 300 + 200. No apoio a
 * proporção é porções por kit e arredonda para cima. O resultado vai em `headcountOverride`.
 */
export function resolveEventItemDemands<T extends Pick<TemplateItemRow, "headcountOverride" | "eventMealId" | "recommendedProportion">>(
	items: readonly T[],
	eventMealBases: ReadonlyMap<string, number | null>,
	templateType: string | null
): T[] {
	const rounding = demandRoundingFor(templateType)
	return items.map((item) => ({
		...item,
		headcountOverride: resolveItemDemand({
			headcountOverride: item.headcountOverride,
			baseHeadcount: eventItemBase(item.eventMealId, eventMealBases),
			recommendedProportion: item.recommendedProportion != null ? Number(item.recommendedProportion) : null,
			rounding,
		}),
	}))
}

/**
 * Agrupa por horário, ignorando day_of_week (placeholder em evento/apoio). O horário é o escolhido
 * nesta aplicação para a refeição do item, senão o do item; sem horário ou sem receita o item é
 * descartado (e contado).
 *
 * Evento com duas refeições no mesmo horário (coquetel e jantar, os dois à noite) cai num
 * cardápio do dia só: as refeições entram na ordem do evento, e a preparação repetida vira um
 * item com o pax somado — dois itens da mesma preparação furavam a chave de idempotência.
 */
export function groupEventItemsBySlot<T extends Pick<TemplateItemRow, "mealTypeId" | "recipeId" | "eventMealId" | "sortOrder" | "headcountOverride">>(
	items: readonly T[],
	appliedSlot: ReadonlyMap<string, string>,
	mealOrder: readonly string[]
): { itemsByMealType: Map<string, T[]>; itemsSkipped: number } {
	let itemsSkipped = 0
	const itemsByMealType = new Map<string, T[]>()
	for (const item of items) {
		const mealTypeId = (item.eventMealId != null ? appliedSlot.get(item.eventMealId) : undefined) ?? item.mealTypeId
		if (!mealTypeId || !item.recipeId) {
			itemsSkipped++
			continue
		}
		const bucket = itemsByMealType.get(mealTypeId) ?? []
		bucket.push(item)
		itemsByMealType.set(mealTypeId, bucket)
	}
	for (const [mealTypeId, slotItems] of itemsByMealType) itemsByMealType.set(mealTypeId, mergeSlotItems(slotItems, mealOrder))
	return { itemsByMealType, itemsSkipped }
}

/** Item ativo já presente no cardápio do dia: o que decide o sort de quem entra e a idempotência. */
export type ExistingMenuItem = {
	sortOrder: number | null
	recipeOriginId: string | null
	originTemplateId: string | null
	substitutions: unknown
}

/** Base do sort dos itens acrescentados: depois do maior existente, sem colidir com a rotina. */
export function computeNextMenuSortOrder(existingItems: readonly Pick<ExistingMenuItem, "sortOrder">[]): number {
	return existingItems.reduce((max, r) => Math.max(max, (r.sortOrder ?? 0) + 1), 0)
}

/**
 * Receitas deste template já aplicadas na refeição (chave de idempotência). A preparação trocada
 * no dia (faltou o alimento) continua sendo a aplicação daquela linha do cardápio: reaplicar não
 * pode trazer de volta a original ao lado da nova.
 */
export function collectAppliedRecipeIds(existingItems: readonly ExistingMenuItem[], templateId: string): Set<string> {
	return new Set(
		existingItems
			.filter((r) => r.originTemplateId === templateId)
			.flatMap((r) => [r.recipeOriginId, (r.substitutions as { recipe_swap?: { from_recipe_id?: string | null } } | null)?.recipe_swap?.from_recipe_id ?? null])
			.filter((id): id is string => id != null)
	)
}

/** Separa os itens ainda não aplicados; os já presentes (mesma origem+receita) são contados e pulados. */
export function partitionFreshItems<T extends { recipeId: string | null }>(
	items: readonly T[],
	alreadyApplied: ReadonlySet<string>
): { fresh: T[]; alreadyAppliedCount: number } {
	let alreadyAppliedCount = 0
	const fresh = items.filter((item) => {
		if (item.recipeId != null && alreadyApplied.has(item.recipeId)) {
			alreadyAppliedCount++
			return false
		}
		return true
	})
	return { fresh, alreadyAppliedCount }
}

/** Linhas de `menu_items` acrescentadas ao cardápio do dia por um evento ou apoio. */
export function buildEventMenuItemRows(
	menuId: string,
	items: readonly MaterializableItem[],
	baseSort: number,
	templateId: string,
	templateType: string
): MenuItemInsert[] {
	return items.map((item, index) => ({
		dailyMenuId: menuId,
		recipeOriginId: item.recipeId,
		recipe: buildRecipeSnapshot(item.recipesInKitchen),
		// Já resolvido por item (e somado entre refeições do mesmo horário) acima.
		plannedPortionQuantity: item.headcountOverride ?? null,
		itemGroup: item.itemGroup,
		sortOrder: baseSort + index,
		recommendedProportion: item.recommendedProportion,
		originTemplateId: templateId,
		originTemplateType: templateType,
	}))
}
