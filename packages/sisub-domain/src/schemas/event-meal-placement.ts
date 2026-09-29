/**
 * Onde cada item GRAVADO de evento entra — regra única do servidor (cópia do molde) e do
 * editor (abrir o evento). Eram duas cópias e já tinham divergido no nome da refeição
 * reconstruída.
 *
 * Item gravado não é entrada de quem chama: pode não ter refeição (gravado antes de as
 * refeições existirem, ou escrito por fora do editor) ou estar num grupo que a composição
 * perdeu. Recusar por isso seria recusar uma edição de nome, e deixá-lo sem refeição o tiraria
 * de toda coluna do editor — o salvamento seguinte o apagaria.
 */

import { DEFAULT_EVENT_MEAL_GROUPS, type OccasionMealGroup } from "./menu-groups.ts"

/** Nome da refeição que o apoio ganha quando os itens chegam sem refeição: o kit. Servidor e editor usam este. */
export const DEFAULT_SUPPORT_MEAL_NAME = "Kit"

/** O que a regra lê de uma refeição do evento. */
export type PlaceableEventMeal = { id: string; mealTypeId: string; groups: readonly { key: string }[] }

/** O que a regra lê de um item gravado. */
export type StoredEventItemRef = { eventMealId?: string | null; mealTypeId?: string | null; itemGroup?: string | null }

/** Grupo como a regra o devolve: chave, rótulo e, se houver, a quantidade de preparações esperada. */
function copyGroup(g: { key: string; label: string; minItems?: number | null; maxItems?: number | null }): OccasionMealGroup {
	return {
		key: g.key,
		label: g.label,
		...(g.minItems != null && { minItems: g.minItems }),
		...(g.maxItems != null && { maxItems: g.maxItems }),
	}
}

/**
 * Composição da refeição gravada como a regra a lê: sem grupo nenhum (jsonb vazio ou fora de
 * forma), vale `fallback` — no evento, a composição padrão de evento (sem coluna nada entraria
 * nela, e o evento recusa refeição sem grupo); no apoio, nenhuma (`[]`): o kit simples é a lista
 * de preparações sem coluna.
 */
export function eventMealGroupsOrDefault<G extends { key: string; label: string; minItems?: number | null; maxItems?: number | null }>(
	groups: readonly G[],
	fallback: readonly OccasionMealGroup[] = DEFAULT_EVENT_MEAL_GROUPS
): OccasionMealGroup[] {
	return (groups.length > 0 ? groups : fallback).map(copyGroup)
}

/** Refeição que a regra precisou criar: nasce com a composição `fallback` (a padrão de evento, ou nenhuma no apoio). */
export type RebuiltEventMeal = { id: string; mealTypeId: string; groups: OccasionMealGroup[] }

/** Destino de um item: a refeição e o grupo que ele mantém (`null` = "Sem grupo"). `null` = o item não tem onde entrar. */
export type EventItemPlacement = { mealId: string; itemGroup: string | null } | null

/**
 * Coloca cada item gravado numa refeição do evento. As refeições chegam já com a composição
 * lida por {@link eventMealGroupsOrDefault}.
 *
 * - O item vai para a refeição dele; sem ela, para a refeição do evento no mesmo horário; não
 *   havendo, para uma refeição reconstruída naquele horário, com a composição padrão (uma por
 *   horário, reaproveitada pelos itens seguintes).
 * - Grupo que a composição da refeição não tem vira "Sem grupo".
 * - Item sem refeição e sem horário não tem onde entrar (`null`).
 *
 * `rebuilt` diz quais refeições foram criadas; o nome delas é de quem chama, que sabe o nome do
 * horário.
 */
export function placeStoredEventItems(
	meals: readonly PlaceableEventMeal[],
	items: readonly StoredEventItemRef[],
	fallbackGroups: readonly OccasionMealGroup[] = DEFAULT_EVENT_MEAL_GROUPS
): { rebuilt: RebuiltEventMeal[]; placements: EventItemPlacement[] } {
	const byId = new Map<string, PlaceableEventMeal>(meals.map((m) => [m.id, m]))
	const rebuilt: RebuiltEventMeal[] = []

	const mealFor = (item: StoredEventItemRef): PlaceableEventMeal | null => {
		const own = item.eventMealId != null ? byId.get(item.eventMealId) : undefined
		if (own) return own
		if (!item.mealTypeId) return null
		const sameSlot = meals.find((m) => m.mealTypeId === item.mealTypeId) ?? rebuilt.find((m) => m.mealTypeId === item.mealTypeId)
		if (sameSlot) return sameSlot
		const meal: RebuiltEventMeal = { id: crypto.randomUUID(), mealTypeId: item.mealTypeId, groups: eventMealGroupsOrDefault([], fallbackGroups) }
		rebuilt.push(meal)
		byId.set(meal.id, meal)
		return meal
	}

	const placements = items.map((item): EventItemPlacement => {
		const meal = mealFor(item)
		if (!meal) return null
		const group = item.itemGroup ?? null
		return { mealId: meal.id, itemGroup: group != null && meal.groups.some((g) => g.key === group) ? group : null }
	})
	return { rebuilt, placements }
}
