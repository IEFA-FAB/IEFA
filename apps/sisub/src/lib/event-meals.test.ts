import { describe, expect, test } from "vitest"
import type { TemplateItemDraft } from "@/types/domain/planning"
import {
	applyHeadcountToEventMeals,
	countEventMealHeadcountTargets,
	countItemsLeavingComposition,
	type EventMealDraft,
	eventDraftFrom,
	eventGroupKeyFor,
	eventItemsPayload,
	eventMealsPayload,
	expectedGroupCountLabel,
	findDuplicateGroup,
	groupCountStatus,
	groupSuggestionsFor,
	isGroupCountInverted,
	isSuggestionPresent,
	moveEventMeal,
	newEventMeal,
	newSupportKitMeal,
	parseGroupItemCount,
	removeEventMeal,
	resolveGroupKeys,
	SUPPORT_KIT_MEAL_NAME,
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
	base_headcount: null,
}
const gala: EventMealDraft = {
	id: "gala",
	name: "Jantar de gala",
	meal_type_id: JANTAR,
	groups: [{ key: "prato_principal", label: "Prato principal" }],
	base_headcount: 200,
}

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

describe("efetivo da refeição", () => {
	test("porcentagem da preparação e efetivo da refeição fazem round-trip até o payload", () => {
		const { meals, items } = eventDraftFrom(
			[{ ...coquetel, base_headcount: 300 }],
			[{ meal_type_id: JANTAR, event_meal_id: "coquetel", recipe_id: "canape", item_group: "volante", recommended_proportion: 60 }]
		)
		expect(meals[0]?.base_headcount).toBe(300)
		expect(items[0]?.recommended_proportion).toBe(60)
		expect(eventItemsPayload(items, meals)[0]).toMatchObject({ recommended_proportion: 60, headcount_override: null })
		expect(eventMealsPayload(meals)[0]).toMatchObject({ baseHeadcount: 300 })
	})

	test("auxiliador de quantitativo preenche o efetivo das refeições sem sobrescrever o que já existe", () => {
		const plan = new Map([
			["coquetel", 300],
			["gala", 250],
		])
		expect(countEventMealHeadcountTargets([coquetel, gala], plan)).toBe(1)
		expect(applyHeadcountToEventMeals([coquetel, gala], plan).map((m) => m.base_headcount)).toEqual([300, 200])
		expect(applyHeadcountToEventMeals([coquetel, gala], plan, { overwrite: true }).map((m) => m.base_headcount)).toEqual([300, 250])
	})
})

describe("apoio com refeições próprias", () => {
	const LANCHE = "meal-type-lanche"

	test("apoio vazio abre com o Kit, sem grupos", () => {
		const kit = newSupportKitMeal(LANCHE)
		expect(kit).toMatchObject({ name: SUPPORT_KIT_MEAL_NAME, meal_type_id: LANCHE, groups: [], base_headcount: null })
		expect(newEventMeal("", "", "apoio").groups).toEqual([])
	})

	test("refeição de apoio gravada sem grupos continua sem grupos (a de evento ganharia os padrão)", () => {
		const row = { id: "kit", name: "Kit", meal_type_id: LANCHE, groups: [], base_headcount: 40 }
		expect(eventDraftFrom([row], [], "apoio").meals[0]?.groups).toEqual([])
		expect(eventDraftFrom([row], [], "event").meals[0]?.groups.length).toBeGreaterThan(0)
	})

	test("item de apoio antigo, sem refeição, cai num Kit sem grupos e vai no payload com a refeição", () => {
		const { meals, items } = eventDraftFrom(
			[],
			[
				{
					meal_type_id: LANCHE,
					event_meal_id: null,
					recipe_id: "sanduiche",
					item_group: "sanduiche",
					recommended_proportion: 200,
					meal_type: { name: "Lanche" },
				},
			],
			"apoio"
		)
		expect(meals).toHaveLength(1)
		expect(meals[0]).toMatchObject({ name: SUPPORT_KIT_MEAL_NAME, meal_type_id: LANCHE, groups: [] })
		// Grupo que a refeição não tem vira "Sem grupo": o servidor recusaria o salvamento.
		expect(items[0]).toMatchObject({ meal_type_id: meals[0]?.id, item_group: null, recommended_proportion: 200 })
		expect(eventItemsPayload(items, meals)[0]).toMatchObject({ meal_type_id: LANCHE, event_meal_id: meals[0]?.id, item_group: null })
	})

	test("sugestões de grupo por regime", () => {
		expect(groupSuggestionsFor("apoio").map((g) => g.key)).toEqual(expect.arrayContaining(["sanduiche", "bebida", "proteina"]))
		expect(groupSuggestionsFor("event").map((g) => g.key)).toEqual(expect.arrayContaining(["entrada", "volante"]))
		// Rótulo digitado de uma sugestão do apoio ganha a chave dela.
		expect(resolveGroupKeys([{ key: "", label: "Sanduíches" }])[0]?.key).toBe("sanduiche")
	})
})

describe("modelo global e padrão de lanche não mandam quantidade absoluta", () => {
	test("sem pax nos itens e sem efetivo nas refeições; na cozinha, vão", () => {
		const items = [{ ...draft("gala", "r1", "prato_principal"), recommended_proportion: 30 }]
		expect(eventItemsPayload(items, [gala], { allowItemHeadcount: false })[0]).toMatchObject({ headcount_override: null, recommended_proportion: 30 })
		expect(eventMealsPayload([gala], { allowBase: false })[0]?.baseHeadcount).toBeNull()
		expect(eventItemsPayload(items, [gala])[0]?.headcount_override).toBe(50)
		expect(eventMealsPayload([gala])[0]?.baseHeadcount).toBe(200)
	})
})

describe("quantidade de preparações por grupo", () => {
	test("contagem digitada: vazio ou lixo é sem número; teto do schema", () => {
		expect(parseGroupItemCount("")).toBeNull()
		expect(parseGroupItemCount("abc")).toBeNull()
		expect(parseGroupItemCount("-1")).toBeNull()
		expect(parseGroupItemCount("0")).toBe(0)
		expect(parseGroupItemCount("6")).toBe(6)
		expect(parseGroupItemCount("999")).toBe(50)
	})

	test("rótulo esperado", () => {
		expect(expectedGroupCountLabel({})).toBeNull()
		expect(expectedGroupCountLabel({ minItems: 2, maxItems: 2 })).toBe("2")
		expect(expectedGroupCountLabel({ minItems: 6, maxItems: 8 })).toBe("6–8")
		expect(expectedGroupCountLabel({ minItems: 2 })).toBe("2 ou mais")
		expect(expectedGroupCountLabel({ maxItems: 3 })).toBe("até 3")
	})

	test("faltou uma proteína: 1 de 2, fora do esperado — aviso, não recusa", () => {
		expect(groupCountStatus(1, { minItems: 2, maxItems: 2 })).toEqual({ label: "1 de 2", isOutOfRange: true })
		expect(groupCountStatus(2, { minItems: 2, maxItems: 2 })).toEqual({ label: "2 de 2", isOutOfRange: false })
		expect(groupCountStatus(9, { minItems: 6, maxItems: 8 })).toEqual({ label: "9 de 6–8", isOutOfRange: true })
		expect(groupCountStatus(3, {})).toEqual({ label: null, isOutOfRange: false })
	})

	test("mínimo acima do máximo é o único caso inválido", () => {
		expect(isGroupCountInverted({ minItems: 8, maxItems: 6 })).toBe(true)
		expect(isGroupCountInverted({ minItems: 6, maxItems: 8 })).toBe(false)
		expect(isGroupCountInverted({ minItems: 8 })).toBe(false)
	})

	test("a contagem faz round-trip do gravado até o payload, e o grupo novo a leva junto", () => {
		const row = { id: "almoco", name: "Almoço", meal_type_id: JANTAR, groups: [{ key: "proteina", label: "Proteínas", minItems: 2, maxItems: 2 }] }
		const { meals } = eventDraftFrom([row], [], "event")
		expect(meals[0]?.groups[0]).toMatchObject({ minItems: 2, maxItems: 2 })
		expect(eventMealsPayload(meals)[0]?.groups).toEqual([{ key: "proteina", label: "Proteínas", minItems: 2, maxItems: 2 }])
		expect(resolveGroupKeys([{ key: "", label: "Salgados", minItems: 6, maxItems: 8 }])).toEqual([
			{ key: "salgados", label: "Salgados", minItems: 6, maxItems: 8 },
		])
		// Sem número, o payload não leva as chaves.
		expect(eventMealsPayload([coquetel])[0]?.groups[0]).toEqual({ key: "entrada", label: "Entradas" })
	})
})
