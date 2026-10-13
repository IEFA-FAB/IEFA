import { describe, expect, test } from "bun:test"
import {
	buildBaseHeadcountByCell,
	buildEventMealBases,
	buildEventMenuItemRows,
	buildWeeklyMenuItemRows,
	collectAppliedRecipeIds,
	groupEventItemsBySlot,
	groupWeeklyItemsByMealType,
	listApplyDates,
	type MaterializableItem,
	nextMenuSortOrder,
	partitionFreshItems,
	planWeeklyMaterialization,
	recipeSnapshotOf,
	resolveEventItemDemands,
	resolveWeeklyMealHeadcount,
	templateDayForDate,
} from "./template-apply-plan.ts"

const TEMPLATE = "tpl-1"

function item(over: Partial<MaterializableItem> = {}): MaterializableItem {
	return {
		dayOfWeek: 1,
		mealTypeId: "almoco",
		recipeId: "r1",
		headcountOverride: null,
		recommendedProportion: null,
		itemGroup: null,
		sortOrder: 0,
		eventMealId: null,
		recipesInKitchen: null,
		...over,
	}
}

/** Gerador determinístico de id de cardápio: m1, m2, … */
function sequentialIds() {
	let n = 0
	return () => `m${++n}`
}

describe("listApplyDates", () => {
	test("datas escolhidas a dedo: só elas, sem repetição e em ordem", () => {
		expect(listApplyDates({ dates: ["2024-01-20", "2024-01-03", "2024-01-20"], startDate: "2024-01-01", endDate: "2024-01-31" })).toEqual([
			"2024-01-03",
			"2024-01-20",
		])
	})

	test("sem datas (ou lista vazia), o intervalo inteiro, atravessando o mês em UTC", () => {
		const range = ["2024-01-30", "2024-01-31", "2024-02-01"]
		expect(listApplyDates({ startDate: "2024-01-30", endDate: "2024-02-01" })).toEqual(range)
		expect(listApplyDates({ dates: [], startDate: "2024-01-30", endDate: "2024-02-01" })).toEqual(range)
	})

	test("início depois do fim não gera data", () => {
		expect(listApplyDates({ startDate: "2024-01-02", endDate: "2024-01-01" })).toEqual([])
	})
})

describe("templateDayForDate", () => {
	test("semana começando na segunda: segunda = 1, domingo = 7", () => {
		expect(templateDayForDate("2024-01-01", 1)).toBe(1) // segunda
		expect(templateDayForDate("2024-01-07", 1)).toBe(7) // domingo
	})

	test("semana começando na quarta: quarta = 1, segunda = 6", () => {
		expect(templateDayForDate("2024-01-03", 3)).toBe(1)
		expect(templateDayForDate("2024-01-01", 3)).toBe(6)
	})
})

describe("buildBaseHeadcountByCell", () => {
	test("refeição sem efetivo fica de fora", () => {
		const map = buildBaseHeadcountByCell([
			{ dayOfWeek: 1, mealTypeId: "almoco", baseHeadcount: 200 },
			{ dayOfWeek: 1, mealTypeId: "cafe", baseHeadcount: null },
		])
		expect([...map]).toEqual([["1:almoco", 200]])
	})
})

describe("recipeSnapshotOf", () => {
	test("sem receita, objeto vazio", () => {
		expect(recipeSnapshotOf(null)).toEqual({})
	})

	test("receita vira snake_case com `ingredients` e `ingredient`", () => {
		expect(recipeSnapshotOf({ portionYield: 10, recipeIngredientsInKitchens: [{ netQuantity: 1, ingredientInKitchen: { measureUnit: "kg" } }] })).toEqual({
			portion_yield: 10,
			ingredients: [{ net_quantity: 1, ingredient: { measure_unit: "kg" } }],
		})
	})
})

describe("groupWeeklyItemsByMealType", () => {
	test("só o dia pedido; item sem refeição é descartado e contado", () => {
		const a = item({ mealTypeId: "almoco" })
		const b = item({ mealTypeId: "cafe" })
		const c = item({ mealTypeId: "almoco", recipeId: "r2" })
		const result = groupWeeklyItemsByMealType([a, b, item({ mealTypeId: null }), item({ dayOfWeek: 2 }), c], 1)
		expect(result.skipped).toBe(1)
		expect(Object.keys(result.byMealType)).toEqual(["almoco", "cafe"])
		expect(result.byMealType.almoco).toEqual([a, c])
	})
})

describe("resolveWeeklyMealHeadcount", () => {
	const base = new Map([["1:almoco", 200]])

	test("efetivo informado na aplicação vence o do cardápio, inclusive o `null` (a definir)", () => {
		expect(resolveWeeklyMealHeadcount(new Map([["almoco", 50]]), base, 1, "almoco")).toBe(50)
		expect(resolveWeeklyMealHeadcount(new Map([["almoco", null]]), base, 1, "almoco")).toBeNull()
	})

	test("sem informado, o efetivo base da célula; sem os dois, nulo", () => {
		expect(resolveWeeklyMealHeadcount(new Map(), base, 1, "almoco")).toBe(200)
		expect(resolveWeeklyMealHeadcount(new Map(), base, 2, "almoco")).toBeNull()
	})
})

describe("buildWeeklyMenuItemRows", () => {
	test("pax, porcentagem e efetivo cheio; item sem receita é descartado", () => {
		const { rows, skipped } = buildWeeklyMenuItemRows(
			"menu-1",
			[
				item({ recipeId: "r1", headcountOverride: 30, sortOrder: 2, itemGroup: "principal" }),
				item({ recipeId: "r2", recommendedProportion: 25 }),
				item({ recipeId: "r3" }),
				item({ recipeId: null }),
			],
			200,
			TEMPLATE
		)
		expect(skipped).toBe(1)
		expect(rows.map((r) => [r.recipeOriginId, r.plannedPortionQuantity, r.sortOrder, r.itemGroup])).toEqual([
			["r1", 30, 2, "principal"],
			["r2", 50, 0, null],
			["r3", 200, 0, null],
		])
		expect(rows[1]).toMatchObject({ dailyMenuId: "menu-1", recipe: {}, recommendedProportion: 25, originTemplateId: TEMPLATE, originTemplateType: "weekly" })
	})

	test("sem efetivo, a porção fica a definir", () => {
		expect(buildWeeklyMenuItemRows("m", [item({ recommendedProportion: 50 })], null, TEMPLATE).rows[0]?.plannedPortionQuantity).toBeNull()
	})
})

describe("planWeeklyMaterialization", () => {
	const templateItems = [
		item({ dayOfWeek: 1, mealTypeId: "almoco", recipeId: "r1", recommendedProportion: 50 }),
		item({ dayOfWeek: 1, mealTypeId: "cafe", recipeId: "r2" }),
		item({ dayOfWeek: 1, mealTypeId: "jantar", recipeId: null }),
		item({ dayOfWeek: 1, mealTypeId: null, recipeId: "r4" }),
		item({ dayOfWeek: 2, mealTypeId: "almoco", recipeId: "r3" }),
	]
	const base = {
		templateItems,
		dates: ["2024-01-01", "2024-01-02"],
		startDayOfWeek: 1,
		occupiedCells: new Set(["2024-01-01:cafe"]),
		appliedHeadcount: new Map<string, number | null>(),
		baseByCell: new Map([
			["1:almoco", 200],
			["2:almoco", 100],
		]),
		kitchenId: 7,
		templateId: TEMPLATE,
	}

	test("skip: preserva a célula ocupada, não cria refeição vazia e conta os descartados", () => {
		const plan = planWeeklyMaterialization({ ...base, conflictMode: "skip", newMenuId: sequentialIds() })
		expect(plan.newMenus).toEqual([
			{ id: "m1", serviceDate: "2024-01-01", mealTypeId: "almoco", kitchenId: 7, status: "PLANNED", forecastedHeadcount: 200 },
			{ id: "m3", serviceDate: "2024-01-02", mealTypeId: "almoco", kitchenId: 7, status: "PLANNED", forecastedHeadcount: 100 },
		])
		expect(plan.newMenuItems.map((r) => [r.dailyMenuId, r.recipeOriginId, r.plannedPortionQuantity])).toEqual([
			["m1", "r1", 100],
			["m3", "r3", 100],
		])
		// Sem refeição (r4) + sem receita (jantar).
		expect(plan.itemsSkipped).toBe(2)
		expect([...plan.datesSkipped]).toEqual(["2024-01-01"])
	})

	test("replace: a célula ocupada também é materializada", () => {
		const plan = planWeeklyMaterialization({ ...base, conflictMode: "replace", newMenuId: sequentialIds() })
		expect(plan.newMenus.map((m) => [m.serviceDate, m.mealTypeId, m.forecastedHeadcount])).toEqual([
			["2024-01-01", "almoco", 200],
			["2024-01-01", "cafe", null],
			["2024-01-02", "almoco", 100],
		])
		expect(plan.datesSkipped.size).toBe(0)
		expect(plan.itemsSkipped).toBe(2)
	})

	test("efetivo informado nesta aplicação vale para todos os dias da refeição", () => {
		const plan = planWeeklyMaterialization({ ...base, conflictMode: "replace", appliedHeadcount: new Map([["almoco", null]]), newMenuId: sequentialIds() })
		expect(plan.newMenus.filter((m) => m.mealTypeId === "almoco").map((m) => m.forecastedHeadcount)).toEqual([null, null])
		expect(plan.newMenuItems.find((r) => r.recipeOriginId === "r1")?.plannedPortionQuantity).toBeNull()
	})

	test("sem gerador, o id do cardápio é um UUID", () => {
		const plan = planWeeklyMaterialization({ ...base, conflictMode: "skip" })
		expect(plan.newMenus[0]?.id).toMatch(/^[0-9a-f-]{36}$/)
		expect(plan.newMenuItems[0]?.dailyMenuId).toBe(plan.newMenus[0]?.id as string)
	})
})

describe("evento e apoio", () => {
	test("buildEventMealBases: o informado vence (inclusive `null`); ausente usa o da refeição", () => {
		const bases = buildEventMealBases(
			[
				{ id: "e1", base_headcount: 100 },
				{ id: "e2", base_headcount: 80 },
			],
			new Map([["e1", null]])
		)
		expect([...bases]).toEqual([
			["e1", null],
			["e2", 80],
		])
	})

	test("resolveEventItemDemands: pax vence; porcentagem arredonda pelo regime; sem refeição, nulo", () => {
		const bases = new Map([["e1", 10]])
		const items = [
			{ id: "a", headcountOverride: 7, eventMealId: "e1", recommendedProportion: 21 },
			{ id: "b", headcountOverride: null, eventMealId: "e1", recommendedProportion: 21 },
			{ id: "c", headcountOverride: null, eventMealId: "e1", recommendedProportion: null },
			{ id: "d", headcountOverride: null, eventMealId: null, recommendedProportion: null },
		]
		expect(resolveEventItemDemands(items, bases, "event").map((i) => i.headcountOverride)).toEqual([7, 2, 10, null])
		expect(resolveEventItemDemands(items, bases, "apoio").map((i) => i.headcountOverride)).toEqual([7, 3, 10, null])
		expect(resolveEventItemDemands(items, bases, "event")[1]).toMatchObject({ id: "b", recommendedProportion: 21 })
	})

	test("groupEventItemsBySlot: horário da aplicação, descarte sem horário ou receita, mesma preparação somada", () => {
		const a = { id: "a", eventMealId: "e1", mealTypeId: "cafe", recipeId: "r1", sortOrder: 0, headcountOverride: 10 }
		const b = { id: "b", eventMealId: "e2", mealTypeId: "jantar", recipeId: "r1", sortOrder: 0, headcountOverride: 20 }
		const c = { id: "c", eventMealId: "e2", mealTypeId: "jantar", recipeId: null, sortOrder: 1, headcountOverride: null }
		const d = { id: "d", eventMealId: null, mealTypeId: null, recipeId: "r2", sortOrder: 0, headcountOverride: null }
		const e = { id: "e", eventMealId: "e1", mealTypeId: "cafe", recipeId: "r3", sortOrder: 1, headcountOverride: 5 }
		const { itemsByMealType, itemsSkipped } = groupEventItemsBySlot([a, b, c, d, e], new Map([["e1", "jantar"]]), ["e1", "e2"])
		expect(itemsSkipped).toBe(2)
		expect([...itemsByMealType.keys()]).toEqual(["jantar"])
		expect(itemsByMealType.get("jantar")?.map((i) => [i.id, i.headcountOverride])).toEqual([
			["a", 30],
			["e", 5],
		])
	})

	test("nextMenuSortOrder: depois do maior existente; vazio começa em 0", () => {
		expect(nextMenuSortOrder([])).toBe(0)
		expect(nextMenuSortOrder([{ sortOrder: 3 }, { sortOrder: null }])).toBe(4)
	})

	test("collectAppliedRecipeIds: receita deste template e a original de uma troca do dia", () => {
		const ids = collectAppliedRecipeIds(
			[
				{ sortOrder: 0, recipeOriginId: "r1", originTemplateId: TEMPLATE, substitutions: null },
				{ sortOrder: 1, recipeOriginId: "r5", originTemplateId: TEMPLATE, substitutions: { recipe_swap: { from_recipe_id: "r0" } } },
				{ sortOrder: 2, recipeOriginId: "r9", originTemplateId: "outro", substitutions: null },
				{ sortOrder: 3, recipeOriginId: null, originTemplateId: TEMPLATE, substitutions: { recipe_swap: {} } },
			],
			TEMPLATE
		)
		expect([...ids]).toEqual(["r1", "r5", "r0"])
	})

	test("partitionFreshItems: já aplicados são contados e saem; sem receita fica", () => {
		const { fresh, alreadyAppliedCount } = partitionFreshItems([{ recipeId: "r1" }, { recipeId: "r2" }, { recipeId: null }], new Set(["r1"]))
		expect(fresh).toEqual([{ recipeId: "r2" }, { recipeId: null }])
		expect(alreadyAppliedCount).toBe(1)
	})

	test("buildEventMenuItemRows: ordem a partir da base, porção já resolvida no pax", () => {
		const rows = buildEventMenuItemRows("menu-9", [item({ recipeId: "r1", headcountOverride: 30 }), item({ recipeId: "r2" })], 4, TEMPLATE, "apoio")
		expect(rows.map((r) => [r.recipeOriginId, r.sortOrder, r.plannedPortionQuantity, r.originTemplateType])).toEqual([
			["r1", 4, 30, "apoio"],
			["r2", 5, null, "apoio"],
		])
		expect(rows[0]).toMatchObject({ dailyMenuId: "menu-9", recipe: {}, originTemplateId: TEMPLATE })
	})
})
