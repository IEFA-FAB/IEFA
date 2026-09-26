import {
	DEFAULT_EVENT_MEAL_GROUPS,
	EVENT_MEAL_GROUP_SUGGESTIONS,
	eventMealGroupsOrDefault,
	MAX_EVENT_MEAL_HEADCOUNT,
	placeStoredEventItems,
} from "@iefa/sisub-domain/schemas"
import { type MenuGroup, menuGroupKeyFromLabel } from "@/lib/menu-item-groups"
import { OCCASION_DAY } from "@/lib/occasion-menu"
import type { TemplateItemDraft } from "@/types/domain/planning"

/**
 * Refeições próprias do evento no editor.
 *
 * O evento tem zero ou mais refeições (coquetel, jantar de gala…), cada uma com nome, horário
 * no calendário (`meal_type_id`) e composição (`groups`). No RASCUNHO do editor a "refeição"
 * de cada item é a refeição DO EVENTO: `TemplateItemDraft.meal_type_id` carrega o id dela.
 * Assim o localizar, a seleção em massa e o auxiliador de quantitativos — que agrupam por
 * `meal_type_id` — funcionam por refeição do evento sem saber que ela existe. Duas refeições
 * no mesmo horário (coquetel e jantar, os dois à noite) continuam sendo duas.
 *
 * A tradução para o que o servidor grava (horário da refeição em `mealTypeId`, a refeição em
 * `eventMealId`) acontece só no payload, em {@link eventItemsPayload}.
 */
export type EventMealDraft = {
	id: string
	name: string
	/** Horário do calendário em que a refeição é servida. */
	meal_type_id: string
	groups: MenuGroup[]
	/**
	 * Efetivo da refeição. A porcentagem de cada preparação incide sobre ele, como no cardápio
	 * semanal; `null` = só o pax da preparação conta.
	 */
	base_headcount: number | null
}

/** Forma gravada (leitura do template). */
type EventMealRow = { id: string; name: string; meal_type_id: string; groups: MenuGroup[]; base_headcount?: number | null }
type TemplateItemRow = {
	meal_type_id: string | null
	event_meal_id?: string | null
	recipe_id: string | null
	headcount_override?: number | null
	recommended_proportion?: number | null
	item_group?: string | null
	sort_order?: number | null
	/** Tipo de refeição aninhado pela leitura do template — dá nome à refeição reconstruída. */
	meal_type?: { name: string | null } | null
}

/**
 * Evento gravado → rascunho do editor (refeições + itens, com a refeição do evento no lugar do
 * tipo de refeição).
 *
 * Item de evento SEM refeição não pode sumir da tela: ele vem de quem gravou o evento antes das
 * refeições existirem (o editor antigo, no ar entre a migration e o deploy, regrava os itens
 * sem `event_meal_id`) ou de uma escrita por fora do editor. Ele vai para a refeição do evento
 * no mesmo horário; não havendo, uma refeição é reconstruída com o nome do horário. Sem isto o
 * item ficaria fora de toda coluna — e o próximo salvamento o apagaria, porque o payload só
 * leva item de refeição existente. Grupo que a composição da refeição não tem vira "Sem grupo",
 * pelo mesmo motivo: o servidor recusaria o salvamento inteiro.
 */
export function eventDraftFrom(
	rows: readonly EventMealRow[] | undefined,
	items: readonly TemplateItemRow[]
): { meals: EventMealDraft[]; items: TemplateItemDraft[] } {
	// Refeição gravada sem grupo nenhum ganha a composição padrão: sem coluna, nada entraria
	// nela, e o servidor recusaria o salvamento (a composição tem ao menos um grupo).
	const meals: EventMealDraft[] = (rows ?? []).map((m) => ({
		id: m.id,
		name: m.name,
		meal_type_id: m.meal_type_id,
		groups: eventMealGroupsOrDefault(m.groups),
		base_headcount: m.base_headcount ?? null,
	}))
	// Regra de colocação compartilhada com o servidor (`placeStoredEventItems`): o nome da
	// refeição reconstruída é o do horário.
	// Item sem preparação não entra — nem reconstrói refeição para si.
	const withRecipe = items.filter((i): i is TemplateItemRow & { recipe_id: string } => i.recipe_id != null)
	const { rebuilt, placements } = placeStoredEventItems(
		meals.map((m) => ({ id: m.id, mealTypeId: m.meal_type_id, groups: m.groups })),
		withRecipe.map((i) => ({ eventMealId: i.event_meal_id, mealTypeId: i.meal_type_id, itemGroup: i.item_group }))
	)
	for (const meal of rebuilt) {
		const slotName = withRecipe.find((i) => i.meal_type_id === meal.mealTypeId)?.meal_type?.name?.trim()
		meals.push({ id: meal.id, name: slotName || "Refeição", meal_type_id: meal.mealTypeId, groups: meal.groups, base_headcount: null })
	}

	const drafts = withRecipe.flatMap((item, index): TemplateItemDraft[] => {
		const placement = placements[index]
		if (!placement) return []
		return [
			{
				day_of_week: OCCASION_DAY,
				meal_type_id: placement.mealId,
				recipe_id: item.recipe_id,
				headcount_override: item.headcount_override ?? null,
				recommended_proportion: item.recommended_proportion != null ? Number(item.recommended_proportion) : null,
				item_group: placement.itemGroup,
				sort_order: item.sort_order ?? 0,
			},
		]
	})
	return { meals, items: drafts }
}

/**
 * Rascunho → itens do payload. O horário vem da refeição; item de refeição que não existe
 * mais no rascunho não é enviado (a refeição saiu e levou os itens).
 */
export function eventItemsPayload(items: readonly TemplateItemDraft[], meals: readonly EventMealDraft[]) {
	const mealById = new Map(meals.map((m) => [m.id, m]))
	return items.flatMap((item) => {
		const meal = mealById.get(item.meal_type_id)
		if (!meal) return []
		return [
			{
				day_of_week: OCCASION_DAY,
				meal_type_id: meal.meal_type_id,
				event_meal_id: meal.id,
				recipe_id: item.recipe_id,
				headcount_override: item.headcount_override ?? null,
				recommended_proportion: item.recommended_proportion ?? null,
				item_group: item.item_group ?? null,
				sort_order: item.sort_order ?? 0,
			},
		]
	})
}

export function eventMealsPayload(meals: readonly EventMealDraft[]) {
	return meals.map((m) => ({
		id: m.id,
		name: m.name.trim(),
		mealTypeId: m.meal_type_id,
		groups: m.groups.map((g) => ({ key: g.key, label: g.label.trim() })),
		baseHeadcount: m.base_headcount,
	}))
}

/** Refeição nova: nasce com a composição padrão de evento, que o editor deixa mudar inteira. */
export function newEventMeal(name: string, mealTypeId: string): EventMealDraft {
	return { id: crypto.randomUUID(), name, meal_type_id: mealTypeId, groups: DEFAULT_EVENT_MEAL_GROUPS.map((g) => ({ ...g })), base_headcount: null }
}

/** Quantos itens da refeição estão em grupos que a nova composição não tem mais. */
export function countItemsLeavingComposition(items: readonly TemplateItemDraft[], mealId: string, groups: readonly MenuGroup[]): number {
	const keys = new Set(groups.map((g) => g.key))
	return items.filter((i) => i.meal_type_id === mealId && i.item_group != null && !keys.has(i.item_group)).length
}

/**
 * Grava a edição de uma refeição (nova ou existente) no rascunho.
 *
 * Item em grupo que a composição nova não tem vai para "Sem grupo" em vez de ficar numa chave
 * órfã: o servidor confere o grupo do item de evento contra a composição da refeição e
 * recusaria o salvamento inteiro. "Sem grupo" é coluna visível — o item continua na tela
 * para ser recolocado.
 */
export function upsertEventMeal(
	meals: readonly EventMealDraft[],
	items: readonly TemplateItemDraft[],
	meal: EventMealDraft
): { meals: EventMealDraft[]; items: TemplateItemDraft[] } {
	const exists = meals.some((m) => m.id === meal.id)
	const nextMeals = exists ? meals.map((m) => (m.id === meal.id ? meal : m)) : [...meals, meal]
	const keys = new Set(meal.groups.map((g) => g.key))
	const nextItems = items.map((i) => (i.meal_type_id === meal.id && i.item_group != null && !keys.has(i.item_group) ? { ...i, item_group: null } : i))
	return { meals: nextMeals, items: nextItems }
}

/** Tira a refeição do evento, com os itens dela. */
export function removeEventMeal(
	meals: readonly EventMealDraft[],
	items: readonly TemplateItemDraft[],
	mealId: string
): { meals: EventMealDraft[]; items: TemplateItemDraft[] } {
	return { meals: meals.filter((m) => m.id !== mealId), items: items.filter((i) => i.meal_type_id !== mealId) }
}

/** Troca a refeição de lugar com a vizinha (`delta` -1 sobe, +1 desce). */
export function moveEventMeal(meals: readonly EventMealDraft[], mealId: string, delta: -1 | 1): EventMealDraft[] {
	const index = meals.findIndex((m) => m.id === mealId)
	const target = index + delta
	if (index === -1 || target < 0 || target >= meals.length) return [...meals]
	const next = [...meals]
	;[next[index], next[target]] = [next[target] as EventMealDraft, next[index] as EventMealDraft]
	return next
}

/** Rótulo sem caixa, acento nem espaço sobrando — a identidade do nome do grupo, sem o corte de tamanho da chave. */
function labelIdentity(label: string): string {
	return label
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim()
}

/**
 * Chave de um grupo NOVO da refeição, pelo rótulo digitado. Rótulo de uma sugestão ("Volantes",
 * "bebidas") ganha a chave da sugestão (`volante`, `bebida`): derivada do rótulo ela sairia no
 * plural, e o mesmo "Volantes" — clicado num evento, digitado noutro — cairia em duas colunas
 * quando os dois fossem aplicados no mesmo dia. Se a refeição já usa a chave da sugestão (um
 * grupo renomeado que a manteve), vale a derivada: senão os dois grupos colidiriam.
 */
export function eventGroupKeyFor(label: string, takenKeys: ReadonlySet<string> = new Set()): string {
	const derived = menuGroupKeyFromLabel(label)
	const suggested = EVENT_MEAL_GROUP_SUGGESTIONS.find((s) => labelIdentity(s.label) === labelIdentity(label))?.key
	return suggested != null && !takenKeys.has(suggested) ? suggested : derived
}

/**
 * Chaves dos grupos da composição no diálogo. Grupo gravado mantém a chave (regerá-la tiraria
 * de grupo as preparações dele); grupo novo a deriva do rótulo, sem repetir chave já usada.
 */
export function resolveGroupKeys(groups: readonly { key: string; label: string }[]): MenuGroup[] {
	const taken = new Set(groups.filter((g) => g.key !== "").map((g) => g.key))
	return groups.map((g) => {
		if (g.key !== "") return { key: g.key, label: g.label.trim() }
		const key = eventGroupKeyFor(g.label, taken)
		taken.add(key)
		return { key, label: g.label.trim() }
	})
}

/**
 * Primeiro grupo que repete um anterior — pela chave OU pelo rótulo, sem caixa nem acento.
 * Só a chave não basta: renomear "Volantes" para "Entradas" mantém a chave `volante` e deixava
 * a refeição com duas colunas "Entradas".
 */
export function findDuplicateGroup(groups: readonly MenuGroup[]): MenuGroup | undefined {
	return groups.find((g, i) => g.label.trim() !== "" && groups.findIndex((o) => o.key === g.key || labelIdentity(o.label) === labelIdentity(g.label)) !== i)
}

/** A sugestão já está na composição — pela chave ou pelo rótulo. */
export function isSuggestionPresent(suggestion: { key: string; label: string }, groups: readonly MenuGroup[]): boolean {
	return groups.some((g) => g.key === suggestion.key || labelIdentity(g.label) === labelIdentity(suggestion.label))
}

/** Efetivo de uma refeição (`null` limpa). */
export function setEventMealBase(meals: readonly EventMealDraft[], mealId: string, baseHeadcount: number | null): EventMealDraft[] {
	return meals.map((m) => (m.id === mealId ? { ...m, base_headcount: baseHeadcount } : m))
}

/**
 * Quantitativo do auxiliador → efetivo de cada refeição do evento (o plano é por id de
 * refeição). Mesmo contrato do semanal (`applyHeadcountToMeals`): sem `overwrite`, só preenche
 * refeição sem efetivo.
 */
export function applyHeadcountToEventMeals(
	meals: readonly EventMealDraft[],
	plan: ReadonlyMap<string, number | null>,
	{ overwrite = false } = {}
): EventMealDraft[] {
	return meals.map((m) => {
		const value = plan.get(m.id)
		if (value == null) return m
		if (!overwrite && m.base_headcount != null) return m
		return { ...m, base_headcount: value }
	})
}

/** Quantas refeições o plano vai mudar — o número que o botão do auxiliador promete. */
export function countEventMealHeadcountTargets(meals: readonly EventMealDraft[], plan: ReadonlyMap<string, number | null>, { overwrite = false } = {}): number {
	return meals.filter((m) => {
		const value = plan.get(m.id)
		if (value == null || m.base_headcount === value) return false
		return overwrite || m.base_headcount == null
	}).length
}

/**
 * Efetivo digitado → valor gravável: inteiro de 1 até o teto do schema; vazio, zero ou lixo =
 * `null`. Acima do teto o servidor recusaria o evento inteiro e o auto-save só não diria "Salvo".
 */
export function parseEventMealHeadcount(raw: string): number | null {
	const parsed = Number.parseInt(raw, 10)
	if (!Number.isFinite(parsed) || parsed < 1) return null
	return Math.min(parsed, MAX_EVENT_MEAL_HEADCOUNT)
}
