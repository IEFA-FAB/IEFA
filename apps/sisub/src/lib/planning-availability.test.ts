import { describe, expect, it } from "vitest"
import {
	type CoverageIndex,
	classifyAvailability,
	collectPlannedNeeds,
	type DailyMenuForAvailability,
	endOfCivilWeek,
	horizonOf,
} from "./planning-availability"

// Quarta-feira: a semana vai até domingo, 18; o mês, até 31.
const TODAY = "2026-10-14"

const RICE = "rice"
const BEANS = "beans"

function menu(date: string, items: DailyMenuForAvailability["menu_items"], headcount: number | null = 100): DailyMenuForAvailability {
	return { id: `menu-${date}`, service_date: date, forecasted_headcount: headcount, meal_type: { name: "Almoço" }, menu_items: items }
}

function item(id: string, ingredients: unknown[], extra: Partial<DailyMenuForAvailability["menu_items"][number]> = {}) {
	return {
		id,
		recipe: { name: `Prato ${id}`, portion_yield: 10, ingredients },
		planned_portion_quantity: null,
		recommended_proportion: null,
		excluded_from_procurement: null,
		substitutions: null,
		...extra,
	}
}

function coverage(partial: Partial<CoverageIndex> = {}): CoverageIndex {
	return {
		purchasable: new Set([RICE, BEANS]),
		contractWindows: new Map(),
		empenhoCovered: new Set(),
		inTransit: new Set(),
		stock: new Map(),
		hiddenStock: new Set(),
		checks: { stock: true, contracts: true },
		...partial,
	}
}

describe("horizonOf", () => {
	it("separa passado, semana, mês e depois", () => {
		expect(horizonOf("2026-10-13", TODAY)).toBeNull()
		// hoje já é execução: o turno resolve, e o saldo já desconta o que saiu
		expect(horizonOf(TODAY, TODAY)).toBeNull()
		expect(horizonOf("2026-10-15", TODAY)).toBe("week")
		expect(horizonOf("2026-10-18", TODAY)).toBe("week")
		expect(horizonOf("2026-10-19", TODAY)).toBe("month")
		expect(horizonOf("2026-10-31", TODAY)).toBe("month")
		expect(horizonOf("2026-11-01", TODAY)).toBe("future")
	})

	it("semana que atravessa o mês continua semana", () => {
		expect(endOfCivilWeek("2026-10-29")).toBe("2026-11-01")
		expect(horizonOf("2026-11-01", "2026-10-29")).toBe("week")
	})

	it("no domingo a semana termina no próprio dia", () => {
		expect(endOfCivilWeek("2026-10-18")).toBe("2026-10-18")
	})
})

describe("collectPlannedNeeds", () => {
	it("escala pela ficha e pelo efetivo da refeição, e pula o passado", () => {
		const needs = collectPlannedNeeds(
			[
				menu("2026-10-13", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])]),
				menu("2026-10-15", [item("b", [{ ingredient_id: RICE, net_quantity: 1 }])]),
			],
			TODAY
		)
		expect(needs).toHaveLength(1)
		// 1 kg por 10 porções × 100 comensais
		expect(needs[0]).toMatchObject({ date: "2026-10-15", ingredientId: RICE, quantity: 10, recipeName: "Prato b" })
	})

	it("usa o substituto do dia e larga a substituição em texto livre", () => {
		const needs = collectPlannedNeeds(
			[
				menu("2026-10-15", [
					item("a", [{ ingredient_id: RICE, net_quantity: 1 }], {
						substitutions: { [RICE]: { substitute_ingredient_id: BEANS, substitute_description: "Feijão" } },
					}),
					item("b", [{ ingredient_id: RICE, net_quantity: 1 }], {
						substitutions: { [RICE]: { substitute_ingredient_id: null, substitute_description: "o que tiver" } },
					}),
				]),
			],
			TODAY
		)
		expect(needs.map((n) => [n.menuItemId, n.ingredientId, n.description])).toEqual([["a", BEANS, "Feijão"]])
	})

	it("ignora insumo opcional e linha de preparação congelada", () => {
		const needs = collectPlannedNeeds(
			[
				menu("2026-10-15", [
					item("a", [
						{ ingredient_id: RICE, net_quantity: 1, is_optional: true },
						{ frozen_preparation_id: "fp", net_quantity: 1 },
					]),
				]),
			],
			TODAY
		)
		expect(needs).toEqual([])
	})

	it("sem efetivo a quantidade é zero, mas o insumo entra", () => {
		const needs = collectPlannedNeeds([menu("2026-10-15", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])], null)], TODAY)
		expect(needs[0]?.quantity).toBe(0)
	})
})

describe("classifyAvailability", () => {
	const weekNeeds = collectPlannedNeeds(
		[menu("2026-10-15", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])]), menu("2026-10-16", [item("b", [{ ingredient_id: RICE, net_quantity: 1 }])])],
		TODAY
	)

	it("na semana, o estoque precisa cobrir o total da semana", () => {
		// precisa de 20 (10 + 10), há 15
		const warnings = classifyAvailability(weekNeeds, coverage({ stock: new Map([[RICE, 15]]) }), TODAY)
		expect(warnings).toHaveLength(2)
		expect(warnings[0]).toMatchObject({ gap: "short_stock", horizon: "week", weekNeed: 20, stock: 15, inTransit: false })
		expect(classifyAvailability(weekNeeds, coverage({ stock: new Map([[RICE, 20]]) }), TODAY)).toEqual([])
	})

	it("na semana, empenho ou ata não bastam, mas a OF a caminho aparece no aviso", () => {
		const warnings = classifyAvailability(weekNeeds, coverage({ empenhoCovered: new Set([RICE]), inTransit: new Set([RICE]) }), TODAY)
		expect(warnings[0]).toMatchObject({ gap: "short_stock", inTransit: true })
	})

	it("em contagem cega o saldo não vira aviso", () => {
		expect(classifyAvailability(weekNeeds, coverage({ hiddenStock: new Set([RICE]) }), TODAY)).toEqual([])
	})

	it("no mês, estoque, OF ou empenho atendem; sem nenhum, avisa", () => {
		const needs = collectPlannedNeeds([menu("2026-10-25", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])])], TODAY)
		expect(classifyAvailability(needs, coverage(), TODAY)).toMatchObject([{ gap: "no_empenho_or_stock", horizon: "month" }])
		// o estoque precisa cobrir o que o mês agendado usa (10), não só existir
		expect(classifyAvailability(needs, coverage({ stock: new Map([[RICE, 1]]) }), TODAY)).toMatchObject([{ gap: "no_empenho_or_stock" }])
		expect(classifyAvailability(needs, coverage({ stock: new Map([[RICE, 10]]) }), TODAY)).toEqual([])
		expect(classifyAvailability(needs, coverage({ inTransit: new Set([RICE]) }), TODAY)).toEqual([])
		expect(classifyAvailability(needs, coverage({ empenhoCovered: new Set([RICE]) }), TODAY)).toEqual([])
		expect(classifyAvailability(needs, coverage({ purchasable: new Set() }), TODAY)).toMatchObject([{ gap: "no_purchase_item" }])
	})

	it("depois do mês, precisa de contratação vigente na data", () => {
		const needs = collectPlannedNeeds([menu("2026-11-20", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])])], TODAY)
		expect(classifyAvailability(needs, coverage(), TODAY)).toMatchObject([{ gap: "no_contract", horizon: "future" }])
		const ending = new Map([[RICE, [{ from: "2026-01-01", to: "2026-11-10" }]]])
		expect(classifyAvailability(needs, coverage({ contractWindows: ending }), TODAY)).toMatchObject([{ gap: "no_contract" }])
		const covering = new Map([
			[
				RICE,
				[
					{ from: "2026-01-01", to: "2026-11-10" },
					{ from: "2026-11-11", to: null },
				],
			],
		])
		expect(classifyAvailability(needs, coverage({ contractWindows: covering }), TODAY)).toEqual([])
		// estoque de hoje não responde por novembro
		expect(classifyAvailability(needs, coverage({ stock: new Map([[RICE, 99]]) }), TODAY)).toHaveLength(1)
	})

	it("item fora da compra só responde ao estoque da semana", () => {
		const excluded = (date: string) =>
			collectPlannedNeeds([menu(date, [item("a", [{ ingredient_id: RICE, net_quantity: 1 }], { excluded_from_procurement: 1 })])], TODAY)
		expect(classifyAvailability(excluded("2026-11-20"), coverage(), TODAY)).toEqual([])
		expect(classifyAvailability(excluded("2026-10-25"), coverage(), TODAY)).toEqual([])
		expect(classifyAvailability(excluded("2026-10-15"), coverage(), TODAY)).toMatchObject([{ gap: "short_stock" }])
	})

	it("fonte que a OM não usa no sisub não gera aviso", () => {
		const future = collectPlannedNeeds([menu("2026-11-20", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])])], TODAY)
		const month = collectPlannedNeeds([menu("2026-10-25", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])])], TODAY)
		const noContracts = coverage({ checks: { stock: true, contracts: false } })
		expect(classifyAvailability([...weekNeeds, ...month, ...future], noContracts, TODAY).map((w) => w.horizon)).toEqual(["week", "week"])
		const noStock = coverage({ checks: { stock: false, contracts: true }, stock: new Map([[RICE, 99]]) })
		// sem Estoque no sisub, o saldo (mesmo que viesse) não responde pelo mês
		expect(classifyAvailability([...weekNeeds, ...month], noStock, TODAY).map((w) => w.gap)).toEqual(["no_empenho_or_stock"])
	})

	it("o mês conta com o que a semana deixar no estoque", () => {
		const month = collectPlannedNeeds([menu("2026-10-25", [item("c", [{ ingredient_id: RICE, net_quantity: 1 }])])], TODAY)
		// semana usa 20, o dia 25 usa 10: 25 de saldo cobre a semana mas não o mês
		const warnings = classifyAvailability([...weekNeeds, ...month], coverage({ stock: new Map([[RICE, 25]]) }), TODAY)
		expect(warnings.map((w) => [w.horizon, w.gap])).toEqual([["month", "no_empenho_or_stock"]])
	})

	it("sem item de compra avisa fora da semana mesmo sem ata no sisub", () => {
		const later = collectPlannedNeeds(
			[
				menu("2026-10-25", [item("a", [{ ingredient_id: RICE, net_quantity: 1 }])]),
				menu("2026-11-20", [item("b", [{ ingredient_id: RICE, net_quantity: 1 }])]),
			],
			TODAY
		)
		const warnings = classifyAvailability(later, coverage({ purchasable: new Set(), checks: { stock: true, contracts: false } }), TODAY)
		expect(warnings.map((w) => w.gap)).toEqual(["no_purchase_item", "no_purchase_item"])
	})
})

describe("collectPlannedNeeds — ficha", () => {
	it("o mesmo insumo duas vezes na ficha vira uma linha somada", () => {
		const needs = collectPlannedNeeds(
			[
				menu("2026-10-15", [
					item("a", [
						{ ingredient_id: RICE, net_quantity: 1 },
						{ ingredient_id: RICE, net_quantity: 0.5 },
					]),
				]),
			],
			TODAY
		)
		expect(needs).toHaveLength(1)
		expect(needs[0]?.quantity).toBe(15)
	})

	it("ficha sem rendimento não inventa quantidade", () => {
		const needs = collectPlannedNeeds(
			[
				menu("2026-10-15", [
					{ ...item("a", []), recipe: { name: "Sem rendimento", portion_yield: null, ingredients: [{ ingredient_id: RICE, net_quantity: 1 }] } },
				]),
			],
			TODAY
		)
		expect(needs[0]?.quantity).toBe(0)
	})
})
