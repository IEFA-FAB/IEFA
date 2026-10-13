import { describe, expect, test } from "bun:test"
import type { NeedContribution } from "./quantity-estimate.ts"
import {
	accumulateNeeds,
	buildBaseByTemplateCell,
	collectNeedSelections,
	compareProcurementNeeds,
	type NeedAccumulator,
	type NeedRecipe,
	type NeedSources,
	type NeedTemplate,
	type NeedTemplateItem,
	resolveNeedHeadcount,
	toNeedIngredient,
	toProcurementNeed,
} from "./quantity-estimate-needs.ts"

function templateItem(over: Partial<NeedTemplateItem> = {}): NeedTemplateItem {
	return { recipeId: "rec", headcountOverride: null, dayOfWeek: 1, mealTypeId: "almoco", recommendedProportion: null, eventMealId: null, ...over }
}

const ARROZ = { id: "arroz", description: "Arroz", measureUnit: "KG", folderId: "graos", defaultDeliveryCycle: null }
const SAL = { id: "sal", description: "Sal", measureUnit: "KG", folderId: null, defaultDeliveryCycle: "weekly" }

describe("collectNeedSelections", () => {
	test("três regimes, cada seleção com a cozinha; apoio ausente não quebra", () => {
		const out = collectNeedSelections([
			{
				kitchenId: 1,
				templateSelections: [{ templateId: "w", repetitions: 4 }],
				eventSelections: [{ templateId: "e", repetitions: 1 }],
				supportMenuSelections: [{ templateId: "s", repetitions: 2 }],
			},
			{ kitchenId: 2, templateSelections: [{ templateId: "w2", repetitions: 3 }], eventSelections: [] },
		])
		expect(out).toEqual([
			{ templateId: "w", repetitions: 4, kitchenId: 1 },
			{ templateId: "e", repetitions: 1, kitchenId: 1 },
			{ templateId: "s", repetitions: 2, kitchenId: 1 },
			{ templateId: "w2", repetitions: 3, kitchenId: 2 },
		])
	})
})

describe("buildBaseByTemplateCell", () => {
	test("todo template ganha um mapa (vazio se não há efetivo); refeição sem efetivo fica de fora", () => {
		const out = buildBaseByTemplateCell(
			[{ id: "a" }, { id: "b" }],
			new Map([
				[
					"a",
					[
						{ dayOfWeek: 1, mealTypeId: "almoco", baseHeadcount: 300 },
						{ dayOfWeek: 2, mealTypeId: "almoco", baseHeadcount: null },
					],
				],
			])
		)
		expect([...(out.get("a") ?? [])]).toEqual([["1:almoco", 300]])
		expect(out.get("b")?.size).toBe(0)
	})
})

describe("resolveNeedHeadcount", () => {
	const cells = new Map([["1:almoco", 300]])

	test("pax do item vence; senão % do efetivo da célula; senão o efetivo cheio; sem nada, nulo", () => {
		expect(resolveNeedHeadcount(templateItem({ headcountOverride: 12 }), "weekly", cells, new Map())).toBe(12)
		expect(resolveNeedHeadcount(templateItem({ recommendedProportion: 50 }), "weekly", cells, new Map())).toBe(150)
		expect(resolveNeedHeadcount(templateItem(), "weekly", cells, new Map())).toBe(300)
		expect(resolveNeedHeadcount(templateItem({ dayOfWeek: 2 }), "weekly", cells, new Map())).toBeNull()
		expect(resolveNeedHeadcount(templateItem(), "weekly", undefined, new Map())).toBeNull()
	})

	test("item de evento mede pela refeição dele; no apoio a porcentagem arredonda para cima", () => {
		const bases = new Map([["m1", 10]])
		expect(resolveNeedHeadcount(templateItem({ eventMealId: "m1", recommendedProportion: 21 }), "event", cells, bases)).toBe(2)
		expect(resolveNeedHeadcount(templateItem({ eventMealId: "m1", recommendedProportion: 21 }), "apoio", cells, bases)).toBe(3)
		expect(resolveNeedHeadcount(templateItem({ eventMealId: "sem-base" }), "event", cells, bases)).toBeNull()
	})
})

describe("toNeedIngredient", () => {
	const folders = new Map([["graos", { id: "graos", description: "Grãos" }]])

	test("com pasta conhecida, sem pasta e com pasta que não veio", () => {
		expect(toNeedIngredient(ARROZ, folders)).toEqual({
			id: "arroz",
			description: "Arroz",
			measure_unit: "KG",
			default_delivery_cycle: null,
			folder_id: "graos",
			folder: { id: "graos", description: "Grãos" },
		})
		expect(toNeedIngredient(SAL, folders).folder).toBeNull()
		expect(toNeedIngredient({ ...ARROZ, folderId: "sumiu" }, folders).folder).toBeNull()
	})
})

describe("accumulateNeeds", () => {
	const recipe: NeedRecipe = {
		id: "rec",
		portionYield: 100,
		recipeIngredientsInKitchens: [
			{ ingredientId: "arroz", netQuantity: 10, ingredientInKitchen: ARROZ },
			{ ingredientId: "sal", netQuantity: null, ingredientInKitchen: SAL },
			{ ingredientId: null, netQuantity: 5, ingredientInKitchen: ARROZ },
			{ ingredientId: "fantasma", netQuantity: 5, ingredientInKitchen: null },
		],
	}
	const weekly: NeedTemplate = {
		id: "w",
		templateType: "weekly",
		menuTemplateItemsInKitchens: [
			templateItem({ headcountOverride: 200 }),
			templateItem({ recipeId: null }),
			templateItem({ recipeId: "sem-receita" }),
			templateItem({ dayOfWeek: 3 }), // sem efetivo: não entra
		],
	}
	const sources: NeedSources = {
		templateMap: new Map([["w", weekly]]),
		recipeById: new Map([["rec", recipe]]),
		folderById: new Map([["graos", { id: "graos", description: "Grãos" }]]),
		baseByTemplateCell: new Map([["w", new Map([["1:almoco", 300]])]]),
		eventMealBases: new Map(),
	}

	test("soma entre seleções, pula o que não dimensiona e registra cada parcela", () => {
		const collect: NeedContribution[] = []
		const needs = accumulateNeeds(
			[
				{ templateId: "w", repetitions: 2, kitchenId: 1 },
				{ templateId: "nao-existe", repetitions: 9, kitchenId: 1 },
				{ templateId: "w", repetitions: 1, kitchenId: 2 },
			],
			sources,
			collect
		)
		// 10 × (200 / 100) × 2 + 10 × (200 / 100) × 1
		expect(needs.get("arroz")?.estimated_quantity).toBe(60)
		expect(needs.get("sal")?.estimated_quantity).toBe(0)
		expect([...needs.keys()]).toEqual(["arroz", "sal"])
		expect(collect).toHaveLength(4)
		expect(collect[0]).toEqual({
			ingredientId: "arroz",
			kitchenId: 1,
			templateId: "w",
			templateType: "weekly",
			recipeId: "rec",
			headcount: 200,
			netQuantity: 10,
			portionYield: 100,
			repetitions: 2,
			quantity: 40,
		})
		expect(collect[3]).toMatchObject({ ingredientId: "sal", kitchenId: 2, netQuantity: 0, quantity: 0 })
	})

	test("sem `collect`, só o acumulado", () => {
		expect(accumulateNeeds([{ templateId: "w", repetitions: 1, kitchenId: 1 }], sources).get("arroz")?.estimated_quantity).toBe(20)
	})
})

describe("toProcurementNeed", () => {
	const acc: NeedAccumulator = {
		ingredient: {
			id: "arroz",
			description: "Arroz",
			measure_unit: "KG",
			default_delivery_cycle: null,
			folder_id: "graos",
			folder: { id: "graos", description: "Grãos" },
		},
		estimated_quantity: 10.123456,
	}

	test("com item de compra: quantidade convertida e ciclo pela conservação", () => {
		expect(
			toProcurementNeed("arroz", acc, {
				purchase_item_id: "pi",
				purchase_item_description: "Arroz tipo 1",
				purchase_measure_unit: "PCT",
				catmat_item_codigo: 123,
				catmat_item_descricao: "ARROZ",
				unit_price: 5.5,
				conversion_factor: 5,
				conservation_class: "resfriado",
			})
		).toEqual({
			folder_id: "graos",
			folder_description: "Grãos",
			ingredient_id: "arroz",
			ingredient_name: "Arroz",
			measure_unit: "KG",
			estimated_quantity: 10.1235,
			purchase_item_id: "pi",
			purchase_item_description: "Arroz tipo 1",
			purchase_measure_unit: "PCT",
			purchase_quantity: 2.0247,
			conversion_factor: 5,
			catmat_item_codigo: 123,
			catmat_item_descricao: "ARROZ",
			unit_price: 5.5,
			item_description: null,
			conservation_class: "resfriado",
			ingredient_delivery_cycle: null,
			delivery_cycle: "weekly",
		})
	})

	test("sem item de compra: campos de compra nulos; pasta e nome vazios viram nulo e texto vazio", () => {
		const need = toProcurementNeed(
			"x",
			{ ingredient: { ...acc.ingredient, description: "", folder: { id: "graos", description: "" } }, estimated_quantity: 1 },
			undefined
		)
		expect(need).toMatchObject({
			folder_description: null,
			ingredient_name: "",
			purchase_item_id: null,
			purchase_quantity: null,
			conversion_factor: null,
			unit_price: null,
			conservation_class: null,
			delivery_cycle: "monthly",
		})
		expect(toProcurementNeed("x", { ingredient: { ...acc.ingredient, folder: undefined }, estimated_quantity: 1 }, undefined).folder_description).toBeNull()
	})

	test("ciclo do insumo vence a conservação", () => {
		const need = toProcurementNeed("x", { ingredient: { ...acc.ingredient, default_delivery_cycle: "monthly" }, estimated_quantity: 1 }, undefined)
		expect(need.delivery_cycle).toBe("monthly")
		expect(need.ingredient_delivery_cycle).toBe("monthly")
	})
})

describe("compareProcurementNeeds", () => {
	test("pasta primeiro (sem pasta = Sem categoria), depois o insumo, em pt-BR", () => {
		const rows = [
			{ folder_description: "Laticínios", ingredient_name: "Queijo" },
			{ folder_description: null, ingredient_name: "Água" },
			{ folder_description: "Grãos", ingredient_name: "Feijão" },
			{ folder_description: "Grãos", ingredient_name: "Arroz" },
		]
		expect(rows.toSorted(compareProcurementNeeds).map((r) => r.ingredient_name)).toEqual(["Arroz", "Feijão", "Queijo", "Água"])
	})
})
