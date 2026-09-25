import { describe, expect, test } from "vitest"
import type { TemplateItemDraft } from "@/types/domain/planning"
import {
	countItemsLeavingComposition,
	type EventMealDraft,
	eventDraftFrom,
	eventGroupKeyFor,
	eventItemsPayload,
	findDuplicateGroup,
	isSuggestionPresent,
	moveEventMeal,
	newEventMeal,
	removeEventMeal,
	resolveGroupKeys,
	upsertEventMeal,
} from "./event-meals"
import { menuGroupKeyFromLabel } from "./menu-item-groups"
import { OCCASION_DAY } from "./occasion-menu"

const JANTAR = "meal-type-jantar"
const coquetel: EventMealDraft = {
	id: "coquetel",
	name: "Coquetel",
	meal_type_id: JANTAR,
	groups: [
		{ key: "entrada", label: "Entradas" },
		{ key: "volante", label: "Volantes" },
	],
}
const gala: EventMealDraft = { id: "gala", name: "Jantar de gala", meal_type_id: JANTAR, groups: [{ key: "prato_principal", label: "Prato principal" }] }

function draft(mealId: string, recipeId: string, group: string | null = null): TemplateItemDraft {
	return { day_of_week: OCCASION_DAY, meal_type_id: mealId, recipe_id: recipeId, headcount_override: 50, item_group: group, sort_order: 0 }
}

describe("rascunho do evento", () => {
	test("no rascunho a refeição do item é a do evento; no payload volta o horário", () => {
		const {
			items: [item],
		} = eventDraftFrom([coquetel], [{ meal_type_id: JANTAR, event_meal_id: "coquetel", recipe_id: "canape", item_group: "volante" }])
		expect(item?.meal_type_id).toBe("coquetel")

		const [payload] = eventItemsPayload(item ? [item] : [], [coquetel])
		expect(payload).toMatchObject({ meal_type_id: JANTAR, event_meal_id: "coquetel", recipe_id: "canape", item_group: "volante" })
	})

	test("duas refeições no mesmo horário continuam separadas", () => {
		const items = eventItemsPayload([draft("coquetel", "r1", "volante"), draft("gala", "r1", "prato_principal")], [coquetel, gala])
		expect(items.map((i) => i.event_meal_id)).toEqual(["coquetel", "gala"])
		expect(items.every((i) => i.meal_type_id === JANTAR)).toBe(true)
	})

	test("item gravado sem refeição cai na refeição do mesmo horário, ou numa reconstruída — nunca some", () => {
		const { meals, items } = eventDraftFrom(
			[coquetel],
			[
				{ meal_type_id: JANTAR, event_meal_id: null, recipe_id: "r1", item_group: "volante" },
				{ meal_type_id: "meal-type-almoco", event_meal_id: null, recipe_id: "r2", item_group: "guarnicao", meal_type: { name: "Almoço" } },
			]
		)
		expect(meals.map((m) => m.name)).toEqual(["Coquetel", "Almoço"])
		expect(items.map((i) => i.meal_type_id)).toEqual(["coquetel", meals[1]?.id])
		// "guarnicao" não está na composição padrão de evento: vai para Sem grupo, não trava o salvamento.
		expect(items.map((i) => i.item_group)).toEqual(["volante", null])
		expect(eventItemsPayload(items, meals)).toHaveLength(2)
	})

	test("item de refeição que saiu do rascunho não vai no payload", () => {
		expect(eventItemsPayload([draft("sumiu", "r1")], [coquetel])).toEqual([])
	})
})

describe("edição das refeições", () => {
	test("refeição nova nasce com a composição padrão de evento, com entradas e volantes", () => {
		const meal = newEventMeal("Coquetel", JANTAR)
		expect(meal.groups.map((g) => g.key)).toEqual(expect.arrayContaining(["entrada", "volante"]))
		expect(newEventMeal("", "").id).not.toBe(meal.id)
	})

	test("grupo removido da composição manda os itens dele para Sem grupo, só nesta refeição", () => {
		const items = [draft("coquetel", "r1", "entrada"), draft("coquetel", "r2", "volante"), draft("gala", "r3", "prato_principal")]
		const onlyVolantes = { ...coquetel, groups: [{ key: "volante", label: "Volantes" }] }
		expect(countItemsLeavingComposition(items, "coquetel", onlyVolantes.groups)).toBe(1)

		const next = upsertEventMeal([coquetel, gala], items, onlyVolantes)
		expect(next.items.map((i) => i.item_group)).toEqual([null, "volante", "prato_principal"])
		expect(next.meals[0]?.groups).toHaveLength(1)
	})

	test("refeição nova entra no fim; remover leva os itens dela", () => {
		const added = upsertEventMeal([coquetel], [], gala)
		expect(added.meals.map((m) => m.id)).toEqual(["coquetel", "gala"])

		const removed = removeEventMeal(added.meals, [draft("coquetel", "r1"), draft("gala", "r2")], "coquetel")
		expect(removed.meals.map((m) => m.id)).toEqual(["gala"])
		expect(removed.items.map((i) => i.recipe_id)).toEqual(["r2"])
	})

	test("mover troca com a vizinha e para nas pontas", () => {
		expect(moveEventMeal([coquetel, gala], "gala", -1).map((m) => m.id)).toEqual(["gala", "coquetel"])
		expect(moveEventMeal([coquetel, gala], "coquetel", -1).map((m) => m.id)).toEqual(["coquetel", "gala"])
	})
})

describe("menuGroupKeyFromLabel", () => {
	test("rótulo vira chave aceita pelo banco", () => {
		expect(menuGroupKeyFromLabel("Canapés quentes")).toBe("canapes_quentes")
		expect(menuGroupKeyFromLabel("1º prato")).toMatch(/^[a-z][a-z0-9_]{1,39}$/)
	})
})

describe("grupos novos da refeição", () => {
	test("rótulo de sugestão ganha a chave da sugestão, digitado ou clicado", () => {
		expect(eventGroupKeyFor("Volantes")).toBe("volante")
		expect(eventGroupKeyFor("  bebidas ")).toBe("bebida")
		expect(eventGroupKeyFor("Canapés")).toBe("canape")
		expect(eventGroupKeyFor("Petiscos")).toBe("petiscos")
	})

	test("rótulo repetido é duplicado mesmo com chaves diferentes", () => {
		const dup = findDuplicateGroup([
			{ key: "entrada", label: "Entradas" },
			{ key: "volante", label: "entradas" },
		])
		expect(dup?.key).toBe("volante")
		expect(
			findDuplicateGroup([
				{ key: "entrada", label: "Entradas" },
				{ key: "volante", label: "Volantes" },
			])
		).toBeUndefined()
	})
})

describe("chave do grupo novo com a sugestão já ocupada", () => {
	test("grupo renomeado que manteve a chave da sugestão: o digitado usa a chave derivada", () => {
		const resolved = resolveGroupKeys([
			{ key: "entrada", label: "Canapés frios" },
			{ key: "", label: "Entradas" },
		])
		expect(resolved.map((g) => g.key)).toEqual(["entrada", "entradas"])
		expect(findDuplicateGroup(resolved)).toBeUndefined()
		expect(eventGroupKeyFor("Entradas", new Set(["entrada"]))).toBe("entradas")
	})

	test("rótulos longos diferentes além de 40 caracteres não são duplicados", () => {
		const base = "Sobremesas especiais de chocolate e frutas "
		expect(
			findDuplicateGroup([
				{ key: "a", label: `${base}vermelhas` },
				{ key: "b", label: `${base}amarelas` },
			])
		).toBeUndefined()
	})

	test("sugestão some pelo rótulo digitado", () => {
		expect(isSuggestionPresent({ key: "bebida", label: "Bebidas" }, [{ key: "drinks", label: "bebidas" }])).toBe(true)
	})
})
