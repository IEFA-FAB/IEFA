/**
 * Preenchimento em massa de um cardápio (template semanal, plano global, evento, exceção).
 *
 * Tudo aqui opera sobre o RASCUNHO do editor — arrays de itens e de efetivo base. Nada toca
 * o banco: quem grava é o save do editor, que já existe.
 *
 * Fronteira de efetivo, igual à do domínio (`applyTemplate` deriva `override ?? base`):
 *   - **efetivo base** é por (dia + refeição) e vale para TODAS as preparações da refeição;
 *   - **pax por preparação** (`headcount_override`) é exceção pontual.
 * Por isso o auxiliador de quantitativos escreve no base, e a seleção múltipla, no override.
 */

import { normalizeForSearch, type SearchSensitivity } from "./text-search"

/** Item de cardápio no rascunho do editor. */
export type MenuDraftItem = {
	day_of_week: number
	meal_type_id: string
	recipe_id: string
	headcount_override?: number | null
}

/** Efetivo base de uma (dia + refeição) no rascunho do editor. */
export type MealHeadcountDraft = {
	day_of_week: number
	meal_type_id: string
	base_headcount: number | null
}

/**
 * Chave estável de um item dentro do cardápio. A mesma preparação pode aparecer em vários
 * dias e refeições, então `recipe_id` sozinho não identifica item — e é justamente a seleção
 * que atravessa dias e refeições que precisa distinguir um do outro.
 */
export function menuItemKey(item: Pick<MenuDraftItem, "day_of_week" | "meal_type_id" | "recipe_id">): string {
	return `${item.day_of_week}|${item.meal_type_id}|${item.recipe_id}`
}

/**
 * Troca a preparação dos itens escolhidos por `nextRecipeIdFor` (retornar `undefined` = não
 * mexe).
 *
 * Quando a refeição de destino já tem a preparação nova, o item trocado **sai** em vez de
 * virar uma segunda cópia: duas linhas com a mesma preparação na mesma refeição são a
 * duplicata que aparece na impressão e some na edição (as duas dividem a mesma chave de
 * célula). Fica o item que já estava lá, com o efetivo e a posição que o usuário deu a ele.
 */
export function swapMenuRecipes<T extends MenuDraftItem>(items: readonly T[], nextRecipeIdFor: (item: T) => string | undefined): T[] {
	const swaps = new Map<T, string>()
	for (const item of items) {
		const next = nextRecipeIdFor(item)
		if (next !== undefined && next !== item.recipe_id) swaps.set(item, next)
	}

	const taken = new Set(items.filter((item) => !swaps.has(item)).map(menuItemKey))
	const result: T[] = []
	for (const item of items) {
		const nextId = swaps.get(item)
		if (nextId === undefined) {
			result.push(item)
			continue
		}
		const key = menuItemKey({ ...item, recipe_id: nextId })
		if (taken.has(key)) continue
		taken.add(key)
		result.push({ ...item, recipe_id: nextId })
	}
	return result
}

/** Quantitativo por refeição digitado no auxiliador: `null`/ausente = campo vazio, não mexe. */
export type HeadcountPlan = ReadonlyMap<string, number | null>

export type ApplyHeadcountOptions = {
	/** Dias que recebem o quantitativo (1-7). Evento/exceção usa o dia único do editor. */
	days: readonly number[]
	/** `false` (default) preenche só o que está vazio — não apaga o que o usuário já ajustou. */
	overwrite?: boolean
}

/**
 * Espalha o quantitativo de cada refeição pelos dias escolhidos, no efetivo BASE.
 *
 * Preencher 7 dias × N refeições à mão é o gargalo do editor: o campo de efetivo vive no
 * cabeçalho de cada refeição, dentro da aba de cada dia, então informar "almoço = 800" custa
 * sete idas a abas diferentes.
 */
export function applyHeadcountToMeals(
	meals: readonly MealHeadcountDraft[],
	plan: HeadcountPlan,
	{ days, overwrite = false }: ApplyHeadcountOptions
): MealHeadcountDraft[] {
	const dayList = [...new Set(days)]
	const byCell = new Map(meals.map((meal) => [`${meal.day_of_week}|${meal.meal_type_id}`, meal]))
	const result = meals.map((meal) => ({ ...meal }))

	for (const [mealTypeId, headcount] of plan) {
		if (headcount == null) continue
		for (const day of dayList) {
			const existing = byCell.get(`${day}|${mealTypeId}`)
			if (!existing) {
				const created = { day_of_week: day, meal_type_id: mealTypeId, base_headcount: headcount }
				result.push(created)
				byCell.set(`${day}|${mealTypeId}`, created)
				continue
			}
			if (!overwrite && existing.base_headcount != null) continue
			const index = result.findIndex((m) => m.day_of_week === day && m.meal_type_id === mealTypeId)
			if (index >= 0) result[index] = { ...result[index], base_headcount: headcount }
		}
	}
	return result
}

/** Quantos (dia + refeição) o plano ainda vai preencher — o número que o botão do auxiliador promete. */
export function countHeadcountTargets(meals: readonly MealHeadcountDraft[], plan: HeadcountPlan, { days, overwrite = false }: ApplyHeadcountOptions): number {
	const byCell = new Map(meals.map((meal) => [`${meal.day_of_week}|${meal.meal_type_id}`, meal]))
	let count = 0
	for (const [mealTypeId, headcount] of plan) {
		if (headcount == null) continue
		for (const day of new Set(days)) {
			const existing = byCell.get(`${day}|${mealTypeId}`)
			if (existing && !overwrite && existing.base_headcount != null) continue
			if (existing?.base_headcount === headcount) continue
			count++
		}
	}
	return count
}

/** Define (ou limpa, com `null`) o pax dos itens selecionados. */
export function setItemHeadcount<T extends MenuDraftItem>(items: readonly T[], keys: ReadonlySet<string>, headcount: number | null): T[] {
	return items.map((item) => (keys.has(menuItemKey(item)) ? { ...item, headcount_override: headcount } : item))
}

/** Remove do cardápio os itens selecionados. */
export function removeMenuItems<T extends MenuDraftItem>(items: readonly T[], keys: ReadonlySet<string>): T[] {
	return items.filter((item) => !keys.has(menuItemKey(item)))
}

/** Uma aparição da busca dentro do cardápio. */
export type MenuMatch<T extends MenuDraftItem> = {
	item: T
	key: string
	/** Nome da preparação no momento da busca — já resolvido pelo chamador. */
	name: string
}

/**
 * Aparições de `query` no cardápio, na ordem de leitura (dia → refeição → nome).
 *
 * Busca PARCIAL e insensível a acento e caixa, como a das listagens: "arr" tem de trazer
 * todos os arrozes. Item cuja preparação não foi resolvida fica de fora — sem nome não há
 * o que casar.
 */
export function findMenuItems<T extends MenuDraftItem>(
	items: readonly T[],
	nameOf: (recipeId: string) => string | undefined,
	query: string,
	{
		mealTypeOrder = [],
		sensitivity = { caseSensitive: false, accentSensitive: false },
	}: { mealTypeOrder?: readonly string[]; sensitivity?: SearchSensitivity } = {}
): MenuMatch<T>[] {
	const needle = normalizeForSearch(query, sensitivity).trim()
	if (!needle) return []

	const mealRank = new Map(mealTypeOrder.map((id, index) => [id, index]))
	const rankOf = (mealTypeId: string) => mealRank.get(mealTypeId) ?? mealTypeOrder.length

	const matches: MenuMatch<T>[] = []
	for (const item of items) {
		const name = nameOf(item.recipe_id)
		if (!name) continue
		if (!normalizeForSearch(name, sensitivity).includes(needle)) continue
		matches.push({ item, key: menuItemKey(item), name })
	}

	return matches.sort(
		(a, b) =>
			a.item.day_of_week - b.item.day_of_week ||
			rankOf(a.item.meal_type_id) - rankOf(b.item.meal_type_id) ||
			a.name.localeCompare(b.name, "pt-BR") ||
			a.key.localeCompare(b.key)
	)
}

/**
 * Substitui a preparação dos itens indicados por outra — o "substituir" do localizar.
 * Mesma regra de duplicata do `swapMenuRecipes`.
 */
export function replaceMenuRecipe<T extends MenuDraftItem>(items: readonly T[], keys: ReadonlySet<string>, nextRecipeId: string): T[] {
	return swapMenuRecipes(items, (item) => (keys.has(menuItemKey(item)) ? nextRecipeId : undefined))
}

/**
 * Quantitativo por refeição direto no pax das preparações — o destino de evento e exceção,
 * que não têm efetivo base (`menu_template_meal` é do cardápio semanal). Aqui o número não
 * tem onde ficar senão em cada item.
 */
export function applyHeadcountToItems<T extends MenuDraftItem>(items: readonly T[], plan: HeadcountPlan, { overwrite = false } = {}): T[] {
	return items.map((item) => {
		const headcount = plan.get(item.meal_type_id)
		if (headcount == null) return item
		if (!overwrite && item.headcount_override != null) return item
		return { ...item, headcount_override: headcount }
	})
}

/** Quantas preparações o plano ainda vai mudar. */
export function countItemHeadcountTargets(items: readonly MenuDraftItem[], plan: HeadcountPlan, { overwrite = false } = {}): number {
	return items.filter((item) => {
		const headcount = plan.get(item.meal_type_id)
		if (headcount == null) return false
		if (!overwrite && item.headcount_override != null) return false
		return item.headcount_override !== headcount
	}).length
}
