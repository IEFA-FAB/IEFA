/**
 * Refeições próprias do evento (`kitchen.menu_template_event_meal`, 20260925120000).
 *
 * O evento tem zero ou mais refeições, cada uma com nome, horário no calendário e composição
 * (grupos) próprios. O item do evento aponta para a refeição em `event_meal_id` e carrega o
 * `meal_type_id` DELA — é o domínio quem grava esse valor, nunca o chamador: Ata, custeio,
 * previsão e a aplicação ao calendário leem o `meal_type_id` do item e continuam funcionando
 * sem saber das refeições do evento.
 */

import { menuTemplateEventMealInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import { DEFAULT_EVENT_MEAL_GROUPS, type MenuGroupInput } from "../schemas/menu-groups.ts"
import type { TemplateEventMeal, TemplateItem } from "../schemas/templates.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

type EventMealTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]
type EventMealDb = SisubDb | EventMealTx

/** Refeição do evento no contrato de leitura (snake_case, como o resto do template). */
export type TemplateEventMealWire = {
	id: string
	menu_template_id: string
	name: string
	meal_type_id: string
	groups: MenuGroupInput[]
	sort_order: number
}

/** `groups` é jsonb: o que não tiver a forma de um grupo é descartado na leitura, não repassado. */
function parseGroups(raw: unknown): MenuGroupInput[] {
	if (!Array.isArray(raw)) return []
	return raw.flatMap((g) =>
		g != null && typeof g === "object" && typeof (g as MenuGroupInput).key === "string" && typeof (g as MenuGroupInput).label === "string"
			? [{ key: (g as MenuGroupInput).key, label: (g as MenuGroupInput).label }]
			: []
	)
}

/** Refeições dos templates, por template, na ordem do evento. */
export async function fetchEventMeals(db: EventMealDb, templateIds: string[]): Promise<Map<string, TemplateEventMealWire[]>> {
	const byTemplate = new Map<string, TemplateEventMealWire[]>()
	if (templateIds.length === 0) return byTemplate
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.menuTemplateEventMealInKitchen.findMany({
			where: inArray(menuTemplateEventMealInKitchen.menuTemplateId, templateIds),
			orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.createdAt)],
		})
	)
	for (const row of rows) {
		const wire: TemplateEventMealWire = {
			id: row.id,
			menu_template_id: row.menuTemplateId,
			name: row.name,
			meal_type_id: row.mealTypeId,
			groups: parseGroups(row.groups),
			sort_order: row.sortOrder,
		}
		const list = byTemplate.get(row.menuTemplateId)
		if (list) list.push(wire)
		else byTemplate.set(row.menuTemplateId, [wire])
	}
	return byTemplate
}

/** Refeições gravadas no formato de entrada — para quem precisa copiá-las ou revalidar itens contra elas. */
export function eventMealsAsInput(meals: readonly TemplateEventMealWire[]): TemplateEventMeal[] {
	return meals.map((m) => ({ id: m.id, name: m.name, mealTypeId: m.meal_type_id, groups: m.groups }))
}

/**
 * Confere refeições e itens de um template e devolve os itens com o `mealTypeId` resolvido.
 *
 * - Refeição de evento só existe em template de evento; e item de evento sempre tem refeição —
 *   sem ela o item não aparece em coluna nenhuma do editor e some da tela continuando no banco.
 * - O `mealTypeId` do item de evento passa a ser o da refeição: o valor enviado é descartado.
 * - O grupo do item de evento precisa estar na composição DAQUELA refeição. Diferente do
 *   cardápio semanal, aqui não existe "fora do conjunto" legítimo na escrita: a composição
 *   chega no mesmo payload, então chave desconhecida é erro de quem escreveu.
 */
export function resolveEventContent(templateType: string | null, meals: readonly TemplateEventMeal[], items: readonly TemplateItem[]): TemplateItem[] {
	const isEvent = templateType === "event"
	if (!isEvent) {
		if (meals.length > 0 || items.some((i) => i.eventMealId != null)) {
			throw new DomainError("EVENT_MEALS_ONLY_IN_EVENTS", "Refeições próprias existem só em evento; neste cardápio o item fica sob o tipo de refeição.")
		}
		return [...items]
	}

	const seenIds = new Set<string>()
	for (const meal of meals) {
		if (seenIds.has(meal.id)) throw new DomainError("EVENT_MEAL_DUPLICATE", `refeição ${meal.id} repetida no evento`)
		seenIds.add(meal.id)
		const keys = new Set<string>()
		for (const group of meal.groups) {
			if (keys.has(group.key)) throw new DomainError("EVENT_MEAL_GROUP_DUPLICATE", `grupo "${group.key}" repetido na refeição "${meal.name}"`)
			keys.add(group.key)
		}
	}

	const mealById = new Map(meals.map((m) => [m.id, m]))
	return items.map((item) => {
		if (item.eventMealId == null) {
			throw new DomainError("EVENT_ITEM_WITHOUT_MEAL", "Todo item de evento pertence a uma refeição do evento (eventMealId). Crie a refeição em eventMeals.")
		}
		const meal = mealById.get(item.eventMealId)
		if (!meal) throw new DomainError("EVENT_MEAL_NOT_FOUND", `refeição ${item.eventMealId} não existe neste evento`)
		if (item.itemGroup != null && !meal.groups.some((g) => g.key === item.itemGroup)) {
			throw new DomainError(
				"ITEM_GROUP_NOT_IN_SET",
				`grupo "${item.itemGroup}" não existe na refeição "${meal.name}". Grupos válidos: ${meal.groups.map((g) => g.key).join(", ")}`
			)
		}
		return { ...item, mealTypeId: meal.mealTypeId }
	})
}

/**
 * Id novo para cada refeição, pelo id antigo.
 *
 * Cópia de evento (fork) precisa disto: o id da refeição é chave primária, então a cópia não
 * pode reaproveitar o do molde — e os itens citam o id do molde.
 */
export function freshEventMealIds(meals: readonly { id: string }[]): Map<string, string> {
	return new Map(meals.map((m) => [m.id, crypto.randomUUID()]))
}

/** Dá ids novos às refeições e reaponta os itens para eles ({@link freshEventMealIds}). */
export function remapEventMealIds(
	meals: readonly TemplateEventMeal[],
	items: readonly TemplateItem[]
): { eventMeals: TemplateEventMeal[]; items: TemplateItem[] } {
	const nextId = freshEventMealIds(meals)
	return {
		eventMeals: meals.map((m) => ({ ...m, id: nextId.get(m.id) ?? m.id })),
		items: items.map((i) => (i.eventMealId != null && nextId.has(i.eventMealId) ? { ...i, eventMealId: nextId.get(i.eventMealId) } : i)),
	}
}

/**
 * Itens que continuam no evento quando a lista de refeições é substituída: os das refeições
 * que ficaram. É o mesmo efeito do `on delete cascade` da escrita in-place, para quem monta o
 * conteúdo em memória (o fork, que copia os itens do molde).
 */
export function keepItemsOfMeals(meals: readonly TemplateEventMeal[], items: readonly TemplateItem[]): TemplateItem[] {
	const ids = new Set(meals.map((m) => m.id))
	return items.filter((i) => i.eventMealId == null || ids.has(i.eventMealId))
}

/**
 * Arruma itens GRAVADOS de evento para que passem por {@link resolveEventContent}.
 *
 * O fork copia os itens do molde quando a edição não os traz — e item gravado não é entrada de
 * quem chama: pode ter grupo que a composição perdeu (uma edição que mandou só `eventMeals`) ou
 * não ter refeição (gravado antes das refeições existirem). Recusar a cópia por isso seria
 * recusar uma edição de nome. O item vai para a refeição do mesmo horário (ou uma nova, com a
 * composição padrão) e, fora da composição, fica sem grupo — o editor mostra "Sem grupo".
 */
export function normalizeStoredEventContent(
	meals: readonly TemplateEventMeal[],
	items: readonly TemplateItem[]
): { eventMeals: TemplateEventMeal[]; items: TemplateItem[] } {
	const eventMeals = [...meals]
	const byId = new Map(eventMeals.map((m) => [m.id, m]))
	const mealFor = (item: TemplateItem): TemplateEventMeal => {
		const own = item.eventMealId != null ? byId.get(item.eventMealId) : undefined
		if (own) return own
		const sameSlot = eventMeals.find((m) => m.mealTypeId === item.mealTypeId)
		if (sameSlot) return sameSlot
		const rebuilt: TemplateEventMeal = {
			id: crypto.randomUUID(),
			name: "Refeição",
			mealTypeId: item.mealTypeId,
			groups: DEFAULT_EVENT_MEAL_GROUPS.map((g) => ({ ...g })),
		}
		eventMeals.push(rebuilt)
		byId.set(rebuilt.id, rebuilt)
		return rebuilt
	}
	return {
		eventMeals,
		items: items.map((item) => {
			const meal = mealFor(item)
			const inComposition = item.itemGroup == null || meal.groups.some((g) => g.key === item.itemGroup)
			return { ...item, eventMealId: meal.id, itemGroup: inComposition ? item.itemGroup : null }
		}),
	}
}

/**
 * Substitui as refeições do template pela lista informada, preservando o id de quem continua.
 *
 * Preservar o id é o que deixa `eventMeals` ser enviado SEM `items`: a refeição renomeada
 * continua sendo a mesma linha e os itens dela ficam. A que não vier sai — e o `on delete
 * cascade` leva os itens junto, que é o que "tirar a refeição do evento" significa.
 */
export async function writeEventMeals(tx: EventMealTx, templateId: string, meals: readonly TemplateEventMeal[]): Promise<void> {
	const ids = meals.map((m) => m.id)

	const existing = await runQuery("FETCH_FAILED", () =>
		tx
			.select({ id: menuTemplateEventMealInKitchen.id })
			.from(menuTemplateEventMealInKitchen)
			.where(eq(menuTemplateEventMealInKitchen.menuTemplateId, templateId))
	)
	const existingIds = new Set(existing.map((r) => r.id))

	// Id novo que já é de OUTRO template: gravar falharia na chave primária com uma mensagem de
	// driver. Aqui a mensagem diz o que houve (o chamador reaproveitou o id de outro evento).
	const newIds = ids.filter((id) => !existingIds.has(id))
	if (newIds.length > 0) {
		const taken = await runQuery("FETCH_FAILED", () =>
			tx
				.select({ id: menuTemplateEventMealInKitchen.id })
				.from(menuTemplateEventMealInKitchen)
				.where(inArray(menuTemplateEventMealInKitchen.id, newIds))
				.limit(1)
		)
		if (taken[0]) throw new DomainError("EVENT_MEAL_ID_TAKEN", `a refeição ${taken[0].id} pertence a outro evento; gere um id novo para ela`)
	}

	await runQuery("DELETE_EVENT_MEALS_FAILED", () =>
		tx
			.delete(menuTemplateEventMealInKitchen)
			.where(
				ids.length > 0
					? and(eq(menuTemplateEventMealInKitchen.menuTemplateId, templateId), notInArray(menuTemplateEventMealInKitchen.id, ids))
					: eq(menuTemplateEventMealInKitchen.menuTemplateId, templateId)
			)
			.then(() => undefined)
	)

	const valuesOf = (meal: TemplateEventMeal, index: number) => ({
		name: meal.name,
		mealTypeId: meal.mealTypeId,
		groups: meal.groups.map((g) => ({ key: g.key, label: g.label })),
		sortOrder: index,
	})

	// As novas num insert só; as que continuam, uma a uma (tipicamente uma ou duas por evento).
	const inserts = meals.flatMap((meal, index) => (existingIds.has(meal.id) ? [] : [{ id: meal.id, menuTemplateId: templateId, ...valuesOf(meal, index) }]))
	if (inserts.length > 0) {
		await runQuery("INSERT_EVENT_MEAL_FAILED", () =>
			tx
				.insert(menuTemplateEventMealInKitchen)
				.values(inserts)
				.then(() => undefined)
		)
	}
	for (const [index, meal] of meals.entries()) {
		if (!existingIds.has(meal.id)) continue
		await runQuery("UPDATE_EVENT_MEAL_FAILED", () =>
			tx
				.update(menuTemplateEventMealInKitchen)
				.set(valuesOf(meal, index))
				.where(and(eq(menuTemplateEventMealInKitchen.id, meal.id), eq(menuTemplateEventMealInKitchen.menuTemplateId, templateId)))
				.then(() => undefined)
		)
	}
}
