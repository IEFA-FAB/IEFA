import { describe, expect, test } from "vitest"
import type { MenuGroup } from "@/lib/menu-item-groups"
import {
	buildBaseByCell,
	buildCellIndex,
	buildDayColumns,
	buildGroupLegend,
	type CellEntry,
	countHiddenGridItems,
	describeEmptyMealTypes,
	formatWeekInputValue,
	formatWeekLabel,
	getWeekdayDate,
	itemRecipeName,
	sortMealTypes,
} from "./weekly-menu-print"

type CellItems = Parameters<typeof buildCellIndex>[0]
type HiddenItems = NonNullable<Parameters<typeof countHiddenGridItems>[0]>

const GROUPS: MenuGroup[] = [
	{ key: "salada", label: "Salada" },
	{ key: "prato_principal", label: "Prato principal" },
	{ key: "sobremesa", label: "Sobremesa" },
]
const groupsFor = (_mealTypeId: string | null | undefined) => GROUPS

function item(extra: Record<string, unknown> = {}) {
	return {
		day_of_week: 1,
		meal_type_id: "almoco",
		item_group: null,
		sort_order: 0,
		headcount_override: null,
		recommended_proportion: null,
		recipe_origin: { id: "r", name: "Arroz" },
		...extra,
	}
}

function entry(extra: Partial<CellEntry> = {}): CellEntry {
	return { name: "X", group: null, main: false, sortOrder: 0, demand: null, color: null, ...extra }
}

const COMMAND_TABLE = { hideCommandTable: true, commandTableMaxProportion: 5 }

describe("itemRecipeName", () => {
	test("nome aparado; sem origem, vazio ou só espaço vira o fallback", () => {
		expect(itemRecipeName({ recipe_origin: { name: "  Feijão " } } as never)).toBe("Feijão")
		expect(itemRecipeName({ recipe_origin: { name: "   " } } as never)).toBe("Preparação sem nome")
		expect(itemRecipeName({ recipe_origin: { name: null } } as never)).toBe("Preparação sem nome")
		expect(itemRecipeName({ recipe_origin: null } as never)).toBe("Preparação sem nome")
	})
})

describe("countHiddenGridItems", () => {
	test("sem itens: zero", () => {
		expect(countHiddenGridItems(undefined, COMMAND_TABLE)).toBe(0)
	})

	test("conta só a mesa de comando que estaria na grade (com dia e refeição)", () => {
		const items = [
			item({ recommended_proportion: 3 }),
			item({ recommended_proportion: 5 }),
			item({ recommended_proportion: 6 }),
			item({ recommended_proportion: 3, headcount_override: 10 }),
			item({ recommended_proportion: 3, day_of_week: null }),
			item({ recommended_proportion: 3, meal_type_id: null }),
			item({ recommended_proportion: 3, meal_type_id: "" }),
			item({ recommended_proportion: 0, day_of_week: 0 }),
		] as unknown as HiddenItems
		// dia 0 não é nulo: `!= null`, não falsidade.
		expect(countHiddenGridItems(items, COMMAND_TABLE)).toBe(3)
	})

	test("opção desligada: nada some", () => {
		const items = [item({ recommended_proportion: 3 })] as unknown as HiddenItems
		expect(countHiddenGridItems(items, { ...COMMAND_TABLE, hideCommandTable: false })).toBe(0)
	})
})

describe("sortMealTypes", () => {
	test("sem tipos: lista vazia", () => {
		expect(sortMealTypes(undefined)).toEqual([])
	})

	test("por sort_order (nulo = 999), empate pelo nome (nulo = vazio), sem mexer na entrada", () => {
		const input = [
			{ id: "a", sort_order: 2, name: "Jantar" },
			{ id: "b", sort_order: null, name: "Ceia" },
			{ id: "c", sort_order: 1, name: "Almoço" },
			{ id: "d", sort_order: 2, name: "Café" },
			{ id: "e", sort_order: 2, name: null },
			{ id: "f", sort_order: 0, name: "Desjejum" },
		]
		expect(sortMealTypes(input).map((m) => m.id)).toEqual(["f", "c", "e", "d", "a", "b"])
		expect(input.map((m) => m.id)).toEqual(["a", "b", "c", "d", "e", "f"])
	})

	test("sort_order 999 empata com o nulo e cai no nome", () => {
		const input = [
			{ id: "x", sort_order: null, name: "B" },
			{ id: "y", sort_order: 999, name: "A" },
		]
		expect(sortMealTypes(input).map((m) => m.id)).toEqual(["y", "x"])
	})
})

describe("buildCellIndex", () => {
	test("item sem dia ou sem refeição fica fora da grade", () => {
		const index = buildCellIndex([item({ day_of_week: null }), item({ meal_type_id: null }), item({ meal_type_id: "" })] as unknown as CellItems, groupsFor)
		expect(index.size).toBe(0)
	})

	test("chave dia:refeição e a forma da entrada", () => {
		const index = buildCellIndex(
			[
				item({ item_group: "prato_principal", sort_order: 3, headcount_override: 120, recipe_origin: { name: " Frango " } }),
				item({ day_of_week: 2, item_group: undefined, sort_order: null, recipe_origin: null }),
			] as unknown as CellItems,
			groupsFor
		)
		expect([...index.keys()]).toEqual(["1:almoco", "2:almoco"])
		expect(index.get("1:almoco")).toEqual([{ name: "Frango", group: "prato_principal", main: true, sortOrder: 3, demand: "120 pax", color: "FEE2E2" }])
		expect(index.get("2:almoco")).toEqual([{ name: "Preparação sem nome", group: null, main: false, sortOrder: 0, demand: null, color: null }])
	})

	test("ordem do conjunto da refeição, depois sort_order; grupo desconhecido e sem grupo no fim", () => {
		const seen: (string | null | undefined)[] = []
		const index = buildCellIndex(
			[
				item({ item_group: "sobremesa", sort_order: 0, recipe_origin: { name: "Pudim" } }),
				item({ item_group: null, sort_order: 0, recipe_origin: { name: "Sem grupo" } }),
				item({ item_group: "salada", sort_order: 2, recipe_origin: { name: "Alface" } }),
				item({ item_group: "salada", sort_order: 1, recipe_origin: { name: "Tomate" } }),
				item({ item_group: "volante", sort_order: 0, recipe_origin: { name: "Volante" } }),
			] as unknown as CellItems,
			(id) => {
				seen.push(id)
				return GROUPS
			}
		)
		expect(index.get("1:almoco")?.map((e) => e.name)).toEqual(["Tomate", "Alface", "Pudim", "Sem grupo", "Volante"])
		expect(seen).toEqual(["almoco"])
	})
})

describe("buildBaseByCell", () => {
	test("nulo ou indefinido: mapa vazio", () => {
		expect(buildBaseByCell(null).size).toBe(0)
		expect(buildBaseByCell(undefined).size).toBe(0)
	})

	test("efetivo por dia:refeição, nulo preservado", () => {
		const map = buildBaseByCell([
			{ day_of_week: 1, meal_type_id: "almoco", base_headcount: 300 },
			{ day_of_week: 2, meal_type_id: "jantar", base_headcount: null },
		])
		expect([...map]).toEqual([
			["1:almoco", 300],
			["2:jantar", null],
		])
	})
})

describe("buildGroupLegend", () => {
	test("sem cores por grupo: legenda vazia", () => {
		const index = new Map([["1:almoco", [entry({ group: "salada", color: "DCFCE7" })]]])
		expect(buildGroupLegend(false, [{ id: "almoco" }], index, groupsFor, [])).toEqual([])
	})

	test("na ordem das linhas e do conjunto; cada grupo uma vez; sem grupo ou sem cor fica fora", () => {
		const index = new Map<string, CellEntry[]>([
			["1:almoco", [entry({ group: "sobremesa", color: "FCE7F3" }), entry({ group: null, color: null })]],
			["3:almoco", [entry({ group: "salada", color: "DCFCE7" }), entry({ group: "bebida", color: null })]],
			["2:jantar", [entry({ group: "salada", color: "DCFCE7" }), entry({ group: "prato_principal", color: "FEE2E2" })]],
			["1:ceia", [entry({ group: "lanche", color: "FAE8FF" })]],
		])
		const legend = buildGroupLegend(true, [{ id: "almoco" }, { id: "jantar" }], index, groupsFor, [])
		expect(legend).toEqual([
			{ key: "salada", label: "Salada", color: "DCFCE7" },
			{ key: "sobremesa", label: "Sobremesa", color: "FCE7F3" },
			{ key: "prato_principal", label: "Prato principal", color: "FEE2E2" },
		])
	})

	test("rótulo: do conjunto da refeição, senão do catálogo inteiro, senão a chave legível", () => {
		const index = new Map<string, CellEntry[]>([
			["1:almoco", [entry({ group: "proteina", color: "EDE9FE" }), entry({ group: "doce_caseiro", color: "E0F2FE" })]],
		])
		const legend = buildGroupLegend(true, [{ id: "almoco" }], index, groupsFor, [{ key: "proteina", label: "Proteína" }])
		expect(legend.map((g) => g.label)).toEqual(["Proteína", "Doce caseiro"])
	})

	test("pede o conjunto de cada refeição pelo id", () => {
		const seen: (string | null | undefined)[] = []
		buildGroupLegend(
			true,
			[{ id: "almoco" }, { id: "jantar" }],
			new Map(),
			(id) => {
				seen.push(id)
				return GROUPS
			},
			[]
		)
		expect(seen).toEqual(["almoco", "jantar"])
	})
})

describe("getWeekdayDate e buildDayColumns", () => {
	const monday = new Date(2026, 9, 12)

	test("sem semana: sem data", () => {
		expect(getWeekdayDate(null, 3)).toBeNull()
		const columns = buildDayColumns(null)
		expect(columns).toHaveLength(7)
		expect(columns.every((c) => c.dateLabel === null)).toBe(true)
	})

	test("com semana: dia ISO a partir da segunda", () => {
		expect(getWeekdayDate(monday, 1)).toEqual(new Date(2026, 9, 12))
		expect(getWeekdayDate(monday, 7)).toEqual(new Date(2026, 9, 18))
		expect(buildDayColumns(monday)).toEqual([
			{ num: 1, label: "Segunda-feira", dateLabel: "12/10" },
			{ num: 2, label: "Terça-feira", dateLabel: "13/10" },
			{ num: 3, label: "Quarta-feira", dateLabel: "14/10" },
			{ num: 4, label: "Quinta-feira", dateLabel: "15/10" },
			{ num: 5, label: "Sexta-feira", dateLabel: "16/10" },
			{ num: 6, label: "Sábado", dateLabel: "17/10" },
			{ num: 7, label: "Domingo", dateLabel: "18/10" },
		])
	})
})

describe("formatWeekLabel", () => {
	test("sem semana: o nome do cardápio, ou vazio", () => {
		expect(formatWeekLabel(null, "Cardápio A")).toBe("Cardápio A")
		expect(formatWeekLabel(null, null)).toBe("")
		expect(formatWeekLabel(null, undefined)).toBe("")
		expect(formatWeekLabel(null, "")).toBe("")
	})

	test("com semana: por extenso, em caixa alta, atravessando o mês", () => {
		expect(formatWeekLabel(new Date(2026, 9, 12), "ignorado")).toBe("SEMANA DE 12 DE OUTUBRO A 18 DE OUTUBRO DE 2026")
		expect(formatWeekLabel(new Date(2026, 8, 28), null)).toBe("SEMANA DE 28 DE SETEMBRO A 04 DE OUTUBRO DE 2026")
	})
})

describe("formatWeekInputValue", () => {
	test("ISO da data, ou vazio sem semana", () => {
		expect(formatWeekInputValue(null)).toBe("")
		expect(formatWeekInputValue(new Date(2026, 9, 5))).toBe("2026-10-05")
	})
})

describe("describeEmptyMealTypes", () => {
	test("texto por escopo", () => {
		expect(describeEmptyMealTypes({ kind: "kitchen", kitchenId: 1, kitchenIdStr: "1" })).toBe("Nenhum tipo de refeição configurado para esta cozinha.")
		expect(describeEmptyMealTypes({ kind: "global" })).toBe("Nenhum tipo de refeição genérico configurado.")
	})
})
