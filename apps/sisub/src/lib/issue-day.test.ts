import { checkDayClosure } from "@iefa/sisub-domain"
import { describe, expect, it } from "vitest"
import {
	buildIssueRequestValues,
	buildIssueSuggestionLines,
	buildIssueVarianceLines,
	collectDailyMenuIds,
	collectIssueIngredientIds,
	decorateIssueVerdicts,
	fillMissingAverageCosts,
	filterTasksNotIssuedByProduction,
	indexActiveMenuItems,
	isAdHocMissingOwner,
	sumTheoreticalConsumption,
	tallyIssueMovements,
} from "@/lib/issue-day"

/** Receita de 1 porção com `net` do insumo por porção. */
const recipe = (...lines: Array<[string, number]>) => ({
	portion_yield: 1,
	ingredients: lines.map(([ingredient_id, net_quantity]) => ({ ingredient_id, net_quantity })),
})

describe("sugestão do dia", () => {
	it("filterTasksNotIssuedByProduction tira as tarefas já baixadas pela produção", () => {
		expect(filterTasksNotIssuedByProduction([{ id: "t1" }, { id: "t2" }, { id: "t3" }], [{ production_task_id: "t2" }, { production_task_id: null }])).toEqual([
			{ id: "t1" },
			{ id: "t3" },
		])
	})

	it("collectDailyMenuIds sem nulos nem repetidos", () => {
		expect(collectDailyMenuIds([{ daily_menu_id: "d1" }, { daily_menu_id: null }, { daily_menu_id: "d1" }, { daily_menu_id: "d2" }])).toEqual(["d1", "d2"])
	})

	it("indexActiveMenuItems: prato de refeição removida sai; sem refeição fica", () => {
		const index = indexActiveMenuItems(
			[
				{ id: "m1", daily_menu_id: "d1" },
				{ id: "m2", daily_menu_id: "removido" },
				{ id: "m3", daily_menu_id: null },
			],
			new Map([["d1", "almoco"]])
		)
		expect([...index.keys()]).toEqual(["m1", "m3"])
	})

	it("sumTheoreticalConsumption soma por insumo e só rotula a refeição quando é uma só", () => {
		const menuById = new Map<string, unknown>([
			["almoco", { recipe: recipe(["arroz", 0.1], ["feijao", 0.05]), planned_portion_quantity: 100, daily_menu_id: "dA" }],
			["jantar", { recipe: recipe(["arroz", 0.1]), planned_portion_quantity: "50", daily_menu_id: "dJ" }],
			["almoco2", { recipe: recipe(["feijao", 0.05]), planned_portion_quantity: 20, daily_menu_id: "dA" }],
			["avulso", { recipe: recipe(["sal", 0.01]), planned_portion_quantity: 100, daily_menu_id: null }],
			["vazio", { recipe: null, planned_portion_quantity: null, daily_menu_id: "dA" }],
		])
		const totals = sumTheoreticalConsumption(
			[
				{ menu_item_id: "almoco" },
				{ menu_item_id: "jantar" },
				{ menu_item_id: "almoco2" },
				{ menu_item_id: "removido" },
				{ menu_item_id: "avulso" },
				{ menu_item_id: "vazio" },
			],
			menuById,
			new Map([
				["dA", "almoco"],
				["dJ", "jantar"],
			])
		)
		expect([...totals]).toEqual([
			["arroz", { quantity: 15, mealTypeId: null }],
			["feijao", { quantity: 6, mealTypeId: "almoco" }],
			["sal", { quantity: 1, mealTypeId: null }],
		])
	})

	it("refeição sem tipo conhecido fica sem rótulo", () => {
		const totals = sumTheoreticalConsumption(
			[{ menu_item_id: "m" }],
			new Map([["m", { recipe: recipe(["arroz", 1]), planned_portion_quantity: 2, daily_menu_id: "d" }]]),
			new Map()
		)
		expect(totals.get("arroz")).toEqual({ quantity: 2, mealTypeId: null })
	})

	it("buildIssueSuggestionLines aplica o fator de correção e arredonda na embalagem", () => {
		expect(
			buildIssueSuggestionLines(
				new Map([
					["carne", { quantity: 10, mealTypeId: "almoco" }],
					["arroz", { quantity: 3, mealTypeId: null }],
					["sal", { quantity: 0.5, mealTypeId: null }],
				]),
				new Map([
					["carne", { correction_factor: 1.25, issue_package_quantity: null }],
					["arroz", { correction_factor: null, issue_package_quantity: 5 }],
				])
			)
		).toEqual([
			{ ingredientId: "carne", mealTypeId: "almoco", suggestedQty: 12.5 },
			{ ingredientId: "arroz", mealTypeId: null, suggestedQty: 5 },
			{ ingredientId: "sal", mealTypeId: null, suggestedQty: 0.5 },
		])
	})
})

describe("abertura", () => {
	it("isAdHocMissingOwner cobra destino e motivo só da avulsa", () => {
		expect(isAdHocMissingOwner({ origin: "production" })).toBe(false)
		expect(isAdHocMissingOwner({ origin: "ad_hoc", purpose: "evento", destination: "pavilhão" })).toBe(false)
		expect(isAdHocMissingOwner({ origin: "ad_hoc", purpose: "evento", destination: "  " })).toBe(true)
		expect(isAdHocMissingOwner({ origin: "ad_hoc", purpose: undefined, destination: "pavilhão" })).toBe(true)
	})

	it("buildIssueRequestValues apara e anula vazios", () => {
		expect(
			buildIssueRequestValues(
				{ kitchenId: 4, origin: "ad_hoc", destination: " pavilhão ", purpose: " evento ", authorizationReference: "  " },
				"2026-10-13",
				"u"
			)
		).toEqual({
			kitchen_id: 4,
			issue_date: "2026-10-13",
			origin: "ad_hoc",
			destination: "pavilhão",
			purpose: "evento",
			authorization_reference: null,
			created_by: "u",
		})
		expect(buildIssueRequestValues({ kitchenId: 4, origin: "production", authorizationReference: " BI 12 " }, "d", "u")).toMatchObject({
			destination: null,
			purpose: null,
			authorization_reference: "BI 12",
		})
	})
})

describe("retrato do dia", () => {
	it("tallyIssueMovements separa emissão de devolução e guarda o último custo", () => {
		const { issued, returned, costs } = tallyIssueMovements([
			{ ingredient_id: "a", type: "issue", quantity: 10, unit_cost: 2 },
			{ ingredient_id: "a", type: "issue_return", quantity: "3", unit_cost: null },
			{ ingredient_id: "a", type: "issue", quantity: 1, unit_cost: "2.5" },
			{ ingredient_id: null, type: "issue", quantity: 99, unit_cost: 1 },
		])
		expect([...issued]).toEqual([["a", 11]])
		expect([...returned]).toEqual([["a", 3]])
		expect([...costs]).toEqual([["a", 2.5]])
	})

	it("collectIssueIngredientIds junta planejados e emitidos sem plano", () => {
		expect(
			collectIssueIngredientIds(
				[{ ingredient_id: "a" }, { ingredient_id: "b" }],
				new Map([
					["b", 1],
					["c", 2],
				])
			)
		).toEqual(["a", "b", "c"])
	})

	it("fillMissingAverageCosts só preenche quem não tem custo", () => {
		const costs = new Map([["a", 5]])
		fillMissingAverageCosts(costs, [
			{ ingredient_id: "a", avg_unit_cost: 9 },
			{ ingredient_id: "b", avg_unit_cost: "3" },
			{ ingredient_id: "c", avg_unit_cost: null },
			{ ingredient_id: null, avg_unit_cost: 1 },
		])
		expect([...costs]).toEqual([
			["a", 5],
			["b", 3],
		])
	})

	it("buildIssueVarianceLines e decorateIssueVerdicts montam o retrato", () => {
		const rows = [
			{ id: "r1", ingredient_id: "a", suggested_qty: "10", variance_reason: "waste" },
			{ id: "r2", ingredient_id: "b", suggested_qty: null, variance_reason: null },
		]
		const lines = buildIssueVarianceLines({
			ingredientIds: ["a", "b", "c"],
			rows,
			issued: new Map([
				["a", 12.33333],
				["c", 1],
			]),
			returned: new Map([["a", 2]]),
			costs: new Map([["a", 4]]),
		})
		expect(lines).toEqual([
			{ ingredientId: "a", suggestedQty: 10, issuedNetQty: 10.3333, unitCost: 4, reason: "waste" },
			{ ingredientId: "b", suggestedQty: null, issuedNetQty: 0, unitCost: null, reason: null },
			{ ingredientId: "c", suggestedQty: null, issuedNetQty: 1, unitCost: null, reason: null },
		])

		const closure = checkDayClosure(lines, { tolerancePct: 10, toleranceFloorValue: 20 })
		const decorated = decorateIssueVerdicts({
			verdicts: closure.verdicts,
			rows,
			names: new Map([["a", { description: "Arroz", measure_unit: "KG" }]]),
			lines,
		})
		expect(decorated.map(({ ingredientId, itemId, description, measureUnit, reason }) => ({ ingredientId, itemId, description, measureUnit, reason }))).toEqual(
			[
				{ ingredientId: "a", itemId: "r1", description: "Arroz", measureUnit: "KG", reason: "waste" },
				{ ingredientId: "b", itemId: "r2", description: "—", measureUnit: null, reason: null },
				{ ingredientId: "c", itemId: null, description: "—", measureUnit: null, reason: null },
			]
		)
		// o veredito segue inteiro
		expect(decorated[0]).toMatchObject(closure.verdicts[0] as object)
	})
})
