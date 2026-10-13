import {
	DEFAULT_EVENT_MEAL_GROUPS,
	DEFAULT_SUPPORT_MEAL_NAME,
	EVENT_MEAL_GROUP_SUGGESTIONS,
	eventMealGroupsOrDefault,
	MAX_EVENT_MEAL_HEADCOUNT,
	MAX_GROUP_ITEM_COUNT,
	placeStoredEventItems,
	SUPPORT_MEAL_GROUP_SUGGESTIONS,
} from "@iefa/sisub-domain/schemas"
import { type MenuGroup, menuGroupKeyFromLabel } from "@/lib/menu-item-groups"
import { OCCASION_DAY, type OccasionMenuType } from "@/lib/occasion-menu"
import type { TemplateItemDraft } from "@/types/domain/planning"

/**
 * Refeições próprias do evento e do apoio no editor.
 *
 * O evento tem zero ou mais refeições (coquetel, jantar de gala…), cada uma com nome, horário
 * no calendário (`meal_type_id`) e composição (`groups`). O apoio usa a mesma estrutura: o kit
 * simples é uma refeição "Kit" sem grupo nenhum, e o Bordo C separa "Refeição" e "Lanche". No
 * RASCUNHO do editor a "refeição"
 * de cada item é a refeição DO EVENTO: `TemplateItemDraft.meal_type_id` carrega o id dela.
 * Assim o localizar, a seleção em massa e o auxiliador de quantitativos — que agrupam por
 * `meal_type_id` — funcionam por refeição do evento sem saber que ela existe. Duas refeições
 * no mesmo horário (coquetel e jantar, os dois à noite) continuam sendo duas.
 *
 * A tradução para o que o servidor grava (horário da refeição em `mealTypeId`, a refeição em
 * `eventMealId`) acontece só no payload, em {@link eventItemsPayload}.
 */
/**
 * Grupo de uma refeição de evento ou apoio: além da chave e do rótulo, quantas preparações ele
 * espera ("Proteínas 2", "Salgados 6 a 8"). A contagem é aviso no editor, nunca trava.
 */
export type OccasionGroup = MenuGroup & { minItems?: number | null; maxItems?: number | null }

export type EventMealDraft = {
	id: string
	name: string
	/** Horário do calendário em que a refeição é servida. */
	meal_type_id: string
	/** Colunas da refeição. No apoio pode ser vazia: o kit simples é a lista de preparações. */
	groups: OccasionGroup[]
	/**
	 * Efetivo da refeição (no apoio: kits). A porcentagem de cada preparação incide sobre ele,
	 * como no cardápio semanal; `null` = só o pax da preparação conta.
	 */
	base_headcount: number | null
	/**
	 * Modelo de onde a refeição foi copiada (montagem do evento, adaptação). Só procedência:
	 * mostra "de Padrão B › Coquetel" e não muda nada na conta. Ausente = refeição criada aqui.
	 */
	source_template_id?: string | null
}

/** Nome da refeição com que o apoio nasce — o mesmo que o servidor dá ao embrulhar itens soltos. */
export const SUPPORT_KIT_MEAL_NAME = DEFAULT_SUPPORT_MEAL_NAME

/** Forma gravada (leitura do template). */
type EventMealRow = {
	id: string
	name: string
	meal_type_id: string
	groups: OccasionGroup[]
	base_headcount?: number | null
	source_template_id?: string | null
}
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
 * Evento ou apoio gravado → rascunho do editor (refeições + itens, com a refeição do cardápio
 * no lugar do tipo de refeição).
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
	items: readonly TemplateItemRow[],
	templateType: OccasionMenuType = "event"
): { meals: EventMealDraft[]; items: TemplateItemDraft[] } {
	// Refeição de EVENTO gravada sem grupo nenhum ganha a composição padrão: sem coluna, nada
	// entraria nela, e o servidor recusaria o salvamento. No apoio, sem grupo é o kit simples.
	const fallbackGroups = templateType === "apoio" ? [] : DEFAULT_EVENT_MEAL_GROUPS
	const meals: EventMealDraft[] = (rows ?? []).map((m) => ({
		id: m.id,
		name: m.name,
		meal_type_id: m.meal_type_id,
		groups: eventMealGroupsOrDefault(m.groups, fallbackGroups),
		base_headcount: m.base_headcount ?? null,
		source_template_id: m.source_template_id ?? null,
	}))
	// Regra de colocação compartilhada com o servidor (`placeStoredEventItems`): o nome da
	// refeição reconstruída é o do horário no evento e "Kit" no apoio, como no servidor.
	// Item sem preparação não entra — nem reconstrói refeição para si.
	const withRecipe = items.filter((i): i is TemplateItemRow & { recipe_id: string } => i.recipe_id != null)
	const { rebuilt, placements } = placeStoredEventItems(
		meals.map((m) => ({ id: m.id, mealTypeId: m.meal_type_id, groups: m.groups })),
		withRecipe.map((i) => ({ eventMealId: i.event_meal_id, mealTypeId: i.meal_type_id, itemGroup: i.item_group })),
		fallbackGroups
	)
	for (const meal of rebuilt) {
		const slotName = withRecipe.find((i) => i.meal_type_id === meal.mealTypeId)?.meal_type?.name?.trim()
		const name = templateType === "apoio" ? SUPPORT_KIT_MEAL_NAME : slotName || "Refeição"
		meals.push({ id: meal.id, name, meal_type_id: meal.mealTypeId, groups: meal.groups, base_headcount: null })
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
 *
 * `allowItemHeadcount: false` (modelo global, padrão de lanche) não manda pax: o global só
 * guarda quantidade relativa, e no padrão o pax seria lido como porções por kit.
 */
export function eventItemsPayload(items: readonly TemplateItemDraft[], meals: readonly EventMealDraft[], { allowItemHeadcount = true } = {}) {
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
				headcount_override: allowItemHeadcount ? (item.headcount_override ?? null) : null,
				recommended_proportion: item.recommended_proportion ?? null,
				item_group: item.item_group ?? null,
				sort_order: item.sort_order ?? 0,
			},
		]
	})
}

/**
 * Refeições do payload. `allowBase: false` (modelo global, padrão de lanche) manda o efetivo
 * nulo: no global ele é da cozinha que adaptar, e no padrão os kits vêm do pedido.
 */
export function eventMealsPayload(meals: readonly EventMealDraft[], { allowBase = true } = {}) {
	return meals.map((m) => ({
		id: m.id,
		name: m.name.trim(),
		mealTypeId: m.meal_type_id,
		groups: m.groups.map((g) => ({
			key: g.key,
			label: g.label.trim(),
			...(g.minItems != null && { minItems: g.minItems }),
			...(g.maxItems != null && { maxItems: g.maxItems }),
		})),
		baseHeadcount: allowBase ? m.base_headcount : null,
		// Ausente no rascunho = não mexe no que está gravado.
		...(m.source_template_id !== undefined && { sourceTemplateId: m.source_template_id }),
	}))
}

/**
 * Refeição nova. No evento nasce com a composição padrão de evento, que o editor deixa mudar
 * inteira; no apoio, sem grupo nenhum (a lista de preparações do kit).
 */
export function newEventMeal(name: string, mealTypeId: string, templateType: OccasionMenuType = "event"): EventMealDraft {
	const groups = templateType === "apoio" ? [] : DEFAULT_EVENT_MEAL_GROUPS.map((g) => ({ ...g }))
	return { id: crypto.randomUUID(), name, meal_type_id: mealTypeId, groups, base_headcount: null }
}

/** A refeição com que o apoio vazio abre: "Kit", sem grupos. */
export function newSupportKitMeal(mealTypeId: string): EventMealDraft {
	return newEventMeal(SUPPORT_KIT_MEAL_NAME, mealTypeId, "apoio")
}

/** Grupos que o diálogo oferece com um clique, por regime. */
export function groupSuggestionsFor(templateType: OccasionMenuType) {
	return templateType === "apoio" ? SUPPORT_MEAL_GROUP_SUGGESTIONS : EVENT_MEAL_GROUP_SUGGESTIONS
}

/** Quantos itens da refeição estão em grupos que a nova composição não tem mais. */
export function countItemsLeavingComposition(items: readonly TemplateItemDraft[], mealId: string, groups: readonly MenuGroup[]): number {
	const keys = new Set(groups.map((g) => g.key))
	return items.filter((i) => i.meal_type_id === mealId && i.item_group != null && !keys.has(i.item_group)).length
}

/**
 * Grava a edição de uma refeição (nova ou existente) no rascunho.
 *
 * - Grupo RENOMEADO para um rótulo de outra identidade (não só caixa, acento ou espaço) troca de
 *   chave, e as preparações dele vão junto. Manter a chave antiga fazia "Sobremesas" renomeado para
 *   "Frios e ovos" seguir como `sobremesa`: aplicado no mesmo dia que outro cardápio, a Mussarela
 *   caía na coluna de sobremesas dele. Mesmo rótulo → mesma chave em qualquer modelo.
 * - Item em grupo que a composição nova não tem vai para "Sem grupo" em vez de ficar numa chave
 *   órfã: o servidor confere o grupo do item contra a composição da refeição e recusaria o
 *   salvamento inteiro. "Sem grupo" é coluna visível — o item continua na tela para ser recolocado.
 */
export function upsertEventMeal(
	meals: readonly EventMealDraft[],
	items: readonly TemplateItemDraft[],
	meal: EventMealDraft
): { meals: EventMealDraft[]; items: TemplateItemDraft[] } {
	const previous = meals.find((m) => m.id === meal.id)
	const rekeyed = rekeyRenamedGroups(previous?.groups ?? [], meal.groups)
	const finalMeal = { ...meal, groups: rekeyed.groups }
	const nextMeals = previous ? meals.map((m) => (m.id === meal.id ? finalMeal : m)) : [...meals, finalMeal]
	const keys = new Set(finalMeal.groups.map((g) => g.key))
	const nextItems = items.map((i) => {
		if (i.meal_type_id !== meal.id || i.item_group == null) return i
		const moved = rekeyed.renamed.get(i.item_group) ?? i.item_group
		if (!keys.has(moved)) return { ...i, item_group: null }
		return moved === i.item_group ? i : { ...i, item_group: moved }
	})
	return { meals: nextMeals, items: nextItems }
}

/** Chave livre: a pedida, ou com sufixo numérico se outra coluna da refeição já a usa. */
function uniqueGroupKey(key: string, taken: ReadonlySet<string>): string {
	if (!taken.has(key)) return key
	for (let n = 2; n < 100; n++) {
		const candidate = `${key.slice(0, 36)}_${n}`
		if (!taken.has(candidate)) return candidate
	}
	return `${key.slice(0, 30)}_${crypto.randomUUID().slice(0, 8)}`
}

/**
 * Grupos da composição com a chave de quem mudou de identidade recalculada pelo rótulo novo.
 * `renamed` leva chave antiga → nova, para as preparações acompanharem.
 */
export function rekeyRenamedGroups(
	previous: readonly OccasionGroup[],
	next: readonly OccasionGroup[]
): { groups: OccasionGroup[]; renamed: Map<string, string> } {
	const previousLabel = new Map(previous.map((g) => [g.key, g.label]))
	const changed = (g: OccasionGroup) => {
		const before = previousLabel.get(g.key)
		return before !== undefined && labelIdentity(before) !== labelIdentity(g.label)
	}
	// Chaves que ficam: as de quem não mudou de identidade. As novas não podem colidir com elas.
	const taken = new Set(next.filter((g) => !changed(g)).map((g) => g.key))
	const renamed = new Map<string, string>()
	const groups = next.map((g) => {
		if (!changed(g)) return g
		const key = uniqueGroupKey(eventGroupKeyFor(g.label, taken), taken)
		taken.add(key)
		if (key !== g.key) renamed.set(g.key, key)
		return { ...g, key }
	})
	return { groups, renamed }
}

/**
 * Refeições de um modelo prontas para entrar noutro cardápio ("Adicionar refeição de um modelo"):
 * lidas pela mesma regra de abrir o editor, com ids novos (o id da refeição é chave primária) e a
 * procedência. Do modelo global não vem pax nem efetivo: o número é da cozinha.
 */
export function mealsFromModel(
	model: { id: string; kitchen_id: number | null; event_meals: readonly EventMealRow[]; items: readonly TemplateItemRow[] },
	templateType: OccasionMenuType = "event"
): { meals: EventMealDraft[]; items: TemplateItemDraft[] } {
	const draft = eventDraftFrom(model.event_meals, model.items, templateType)
	const isGlobal = model.kitchen_id == null
	const nextId = new Map(draft.meals.map((m) => [m.id, crypto.randomUUID()]))
	return {
		meals: draft.meals.map((m) => ({
			...m,
			id: nextId.get(m.id) ?? m.id,
			base_headcount: isGlobal ? null : m.base_headcount,
			source_template_id: m.source_template_id ?? model.id,
		})),
		items: draft.items.map((i) => ({
			...i,
			meal_type_id: nextId.get(i.meal_type_id) ?? i.meal_type_id,
			headcount_override: isGlobal ? null : (i.headcount_override ?? null),
		})),
	}
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
	const suggested = [...EVENT_MEAL_GROUP_SUGGESTIONS, ...SUPPORT_MEAL_GROUP_SUGGESTIONS].find((s) => labelIdentity(s.label) === labelIdentity(label))?.key
	return suggested != null && !takenKeys.has(suggested) ? suggested : derived
}

/**
 * Chaves dos grupos da composição no diálogo. Grupo gravado mantém a chave (regerá-la tiraria
 * de grupo as preparações dele); grupo novo a deriva do rótulo, sem repetir chave já usada. A
 * contagem esperada passa junto.
 */
export function resolveGroupKeys(groups: readonly OccasionGroup[]): OccasionGroup[] {
	const taken = new Set(groups.filter((g) => g.key !== "").map((g) => g.key))
	return groups.map((g) => {
		const counts = { ...(g.minItems != null && { minItems: g.minItems }), ...(g.maxItems != null && { maxItems: g.maxItems }) }
		if (g.key !== "") return { key: g.key, label: g.label.trim(), ...counts }
		const key = eventGroupKeyFor(g.label, taken)
		taken.add(key)
		return { key, label: g.label.trim(), ...counts }
	})
}

// ── Quantidade de preparações por grupo ─────────────────────────────────────

/**
 * Contagem digitada → valor gravável: inteiro de 0 até o teto do schema; vazio ou lixo =
 * `null` (sem número esperado). Acima do teto o servidor recusaria o cardápio inteiro.
 */
export function parseGroupItemCount(raw: string): number | null {
	if (raw.trim() === "") return null
	const parsed = Number.parseInt(raw, 10)
	if (!Number.isFinite(parsed) || parsed < 0) return null
	return Math.min(parsed, MAX_GROUP_ITEM_COUNT)
}

/** Mínimo acima do máximo: o servidor recusaria a refeição. É o único caso que o diálogo segura. */
export function isGroupCountInverted(group: Pick<OccasionGroup, "minItems" | "maxItems">): boolean {
	return group.minItems != null && group.maxItems != null && group.minItems > group.maxItems
}

/** "2", "6–8", "2 ou mais", "até 3"; `null` sem número esperado. */
export function expectedGroupCountLabel(group: Pick<OccasionGroup, "minItems" | "maxItems">): string | null {
	const { minItems: min, maxItems: max } = group
	if (min == null && max == null) return null
	if (min != null && max != null) return min === max ? String(min) : `${min}–${max}`
	if (min != null) return `${min} ou mais`
	return `até ${max}`
}

/**
 * Contagem do grupo contra a esperada: o texto do cabeçalho ("1 de 2", "5 de 6–8") e se está
 * fora. Fora é aviso — a cozinha pode ter ficado sem um item, e o cardápio salva assim mesmo.
 */
export function groupCountStatus(count: number, group: Pick<OccasionGroup, "minItems" | "maxItems">): { label: string | null; isOutOfRange: boolean } {
	const expected = expectedGroupCountLabel(group)
	if (expected == null) return { label: null, isOutOfRange: false }
	const isOutOfRange = (group.minItems != null && count < group.minItems) || (group.maxItems != null && count > group.maxItems)
	return { label: `${count} de ${expected}`, isOutOfRange }
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
