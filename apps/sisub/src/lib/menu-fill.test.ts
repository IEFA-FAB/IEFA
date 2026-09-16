import { describe, expect, test } from "vitest"
import {
	applyHeadcountToItems,
	applyHeadcountToMeals,
	applyRecipeSelection,
	copyMenuItems,
	countHeadcountTargets,
	countItemHeadcountTargets,
	findMenuItems,
	formatItemDemand,
	type MealHeadcountDraft,
	type MenuDraftItem,
	menuItemKey,
	pasteMenuItems,
	removeMenuItems,
	replaceMenuRecipe,
	setItemHeadcount,
	swapMenuRecipes,
} from "./menu-fill"

const ALMOCO = "almoco"
const JANTAR = "jantar"
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

function item(day: number, mealTypeId: string, recipeId: string, headcount: number | null = null): MenuDraftItem {
	return { day_of_week: day, meal_type_id: mealTypeId, recipe_id: recipeId, headcount_override: headcount }
}

function meal(day: number, mealTypeId: string, headcount: number | null): MealHeadcountDraft {
	return { day_of_week: day, meal_type_id: mealTypeId, base_headcount: headcount }
}

describe("applyHeadcountToMeals", () => {
	test("cria o efetivo base da refeição em todos os dias pedidos", () => {
		const result = applyHeadcountToMeals([], new Map([[ALMOCO, 800]]), { days: ALL_DAYS })
		expect(result).toHaveLength(7)
		expect(result.every((m) => m.meal_type_id === ALMOCO && m.base_headcount === 800)).toBe(true)
		expect(result.map((m) => m.day_of_week)).toEqual(ALL_DAYS)
	})

	test("por padrão preenche só o que está vazio — não apaga ajuste do usuário", () => {
		const meals = [meal(1, ALMOCO, 450), meal(2, ALMOCO, null)]
		const result = applyHeadcountToMeals(meals, new Map([[ALMOCO, 800]]), { days: [1, 2] })
		expect(result.find((m) => m.day_of_week === 1)?.base_headcount).toBe(450)
		expect(result.find((m) => m.day_of_week === 2)?.base_headcount).toBe(800)
	})

	test("com overwrite, sobrescreve o que já tinha valor", () => {
		const result = applyHeadcountToMeals([meal(1, ALMOCO, 450)], new Map([[ALMOCO, 800]]), { days: [1], overwrite: true })
		expect(result[0]?.base_headcount).toBe(800)
	})

	test("campo vazio no auxiliador não mexe na refeição", () => {
		const meals = [meal(1, ALMOCO, 450)]
		const result = applyHeadcountToMeals(
			meals,
			new Map([
				[ALMOCO, null],
				[JANTAR, null],
			]),
			{ days: ALL_DAYS, overwrite: true }
		)
		expect(result).toEqual(meals)
	})

	test("não duplica linha de (dia + refeição) já existente", () => {
		const result = applyHeadcountToMeals([meal(1, ALMOCO, null)], new Map([[ALMOCO, 800]]), { days: [1, 1] })
		expect(result).toHaveLength(1)
		expect(result[0]?.base_headcount).toBe(800)
	})

	test("preserva as refeições fora do plano", () => {
		const result = applyHeadcountToMeals([meal(1, JANTAR, 300)], new Map([[ALMOCO, 800]]), { days: [1] })
		expect(result).toContainEqual(meal(1, JANTAR, 300))
	})
})

describe("countHeadcountTargets", () => {
	test("conta só o que a aplicação vai realmente mudar", () => {
		const meals = [meal(1, ALMOCO, 800), meal(2, ALMOCO, null)]
		const plan = new Map([[ALMOCO, 800]])
		expect(countHeadcountTargets(meals, plan, { days: [1, 2, 3] })).toBe(2)
		expect(countHeadcountTargets(meals, plan, { days: [1, 2, 3], overwrite: true })).toBe(2)
	})

	test("valor idêntico ao que já está gravado não conta", () => {
		expect(countHeadcountTargets([meal(1, ALMOCO, 800)], new Map([[ALMOCO, 800]]), { days: [1], overwrite: true })).toBe(0)
	})
})

describe("setItemHeadcount / removeMenuItems", () => {
	const items = [item(1, ALMOCO, "arroz"), item(1, ALMOCO, "feijao"), item(2, JANTAR, "arroz")]

	test("define o pax só nos itens selecionados, atravessando dias e refeições", () => {
		const keys = new Set([menuItemKey(items[0]), menuItemKey(items[2])])
		const result = setItemHeadcount(items, keys, 120)
		expect(result.map((i) => i.headcount_override)).toEqual([120, null, 120])
	})

	test("limpa o pax com null", () => {
		const result = setItemHeadcount([item(1, ALMOCO, "arroz", 300)], new Set([menuItemKey(items[0])]), null)
		expect(result[0]?.headcount_override).toBeNull()
	})

	test("remove os itens selecionados", () => {
		const result = removeMenuItems(items, new Set([menuItemKey(items[0]), menuItemKey(items[1])]))
		expect(result).toEqual([items[2]])
	})
})

describe("findMenuItems", () => {
	const names: Record<string, string> = {
		arroz: "Arroz Branco",
		carreteiro: "Arroz Carreteiro",
		feijao: "Feijão Preto",
		acai: "Açaí na Tigela",
	}
	const nameOf = (id: string) => names[id]
	const items = [item(2, JANTAR, "feijao"), item(1, ALMOCO, "carreteiro"), item(1, ALMOCO, "arroz"), item(1, JANTAR, "acai")]

	test("busca parcial: 'arr' traz todos os arrozes", () => {
		const result = findMenuItems(items, nameOf, "arr")
		expect(result.map((m) => m.name)).toEqual(["Arroz Branco", "Arroz Carreteiro"])
	})

	test("ignora acento e caixa nos dois sentidos", () => {
		expect(findMenuItems(items, nameOf, "ACAI").map((m) => m.name)).toEqual(["Açaí na Tigela"])
		expect(findMenuItems(items, nameOf, "feijão").map((m) => m.name)).toEqual(["Feijão Preto"])
	})

	test("ordena na ordem de leitura: dia, depois refeição, depois nome", () => {
		const result = findMenuItems(items, nameOf, "a", { mealTypeOrder: [ALMOCO, JANTAR] })
		expect(result.map((m) => [m.item.day_of_week, m.item.meal_type_id, m.name])).toEqual([
			[1, ALMOCO, "Arroz Branco"],
			[1, ALMOCO, "Arroz Carreteiro"],
			[1, JANTAR, "Açaí na Tigela"],
			[2, JANTAR, "Feijão Preto"],
		])
	})

	test("busca vazia não casa nada, e item sem nome resolvido fica de fora", () => {
		expect(findMenuItems(items, nameOf, "   ")).toEqual([])
		expect(findMenuItems([item(1, ALMOCO, "sumiu")], nameOf, "a")).toEqual([])
	})
})

describe("swapMenuRecipes / replaceMenuRecipe", () => {
	test("substitui a preparação nos itens indicados", () => {
		const items = [item(1, ALMOCO, "arroz", 120), item(2, JANTAR, "arroz")]
		const keys = new Set(items.map(menuItemKey))
		const result = replaceMenuRecipe(items, keys, "carreteiro")
		expect(result.map((i) => i.recipe_id)).toEqual(["carreteiro", "carreteiro"])
		expect(result[0]?.headcount_override).toBe(120)
	})

	test("não duplica quando a refeição já tem a preparação nova", () => {
		const items = [item(1, ALMOCO, "arroz"), item(1, ALMOCO, "carreteiro", 200)]
		const result = replaceMenuRecipe(items, new Set([menuItemKey(items[0])]), "carreteiro")
		expect(result).toEqual([item(1, ALMOCO, "carreteiro", 200)])
	})

	test("itens não indicados ficam intactos", () => {
		const items = [item(1, ALMOCO, "arroz"), item(1, ALMOCO, "feijao")]
		const result = replaceMenuRecipe(items, new Set([menuItemKey(items[0])]), "carreteiro")
		expect(result.map((i) => i.recipe_id)).toEqual(["carreteiro", "feijao"])
	})

	test("swap que devolve o mesmo id é no-op", () => {
		const items = [item(1, ALMOCO, "arroz")]
		expect(swapMenuRecipes(items, () => "arroz")).toEqual(items)
	})
})

describe("applyHeadcountToItems", () => {
	const items = [item(1, ALMOCO, "arroz"), item(1, ALMOCO, "feijao", 50), item(1, JANTAR, "sopa")]
	const plan = new Map([[ALMOCO, 300]])

	test("preenche o pax das preparações da refeição, sem tocar nas outras refeições", () => {
		const result = applyHeadcountToItems(items, plan)
		expect(result.map((i) => i.headcount_override)).toEqual([300, 50, null])
	})

	test("com overwrite, troca o que já estava preenchido", () => {
		expect(applyHeadcountToItems(items, plan, { overwrite: true }).map((i) => i.headcount_override)).toEqual([300, 300, null])
	})

	test("conta só o que vai mudar", () => {
		expect(countItemHeadcountTargets(items, plan)).toBe(1)
		expect(countItemHeadcountTargets(items, plan, { overwrite: true })).toBe(2)
		expect(countItemHeadcountTargets(items, new Map([[ALMOCO, null]]))).toBe(0)
	})
})

describe("copyMenuItems / pasteMenuItems", () => {
	type FullItem = MenuDraftItem & { item_group: string | null; sort_order: number; recommended_proportion: number | null }
	const full = (day: number, mealTypeId: string, recipeId: string, extra: Partial<FullItem> = {}): FullItem => ({
		day_of_week: day,
		meal_type_id: mealTypeId,
		recipe_id: recipeId,
		headcount_override: null,
		item_group: "prato_principal",
		sort_order: 0,
		recommended_proportion: null,
		...extra,
	})
	const makeItem = (draft: Omit<FullItem, "headcount_override"> & { headcount_override: number | null }): FullItem => draft

	test("copia na ordem da lista, guardando grupo, pax, porcentagem e refeição de origem", () => {
		const items = [full(1, ALMOCO, "arroz", { headcount_override: 120, recommended_proportion: 30 }), full(1, JANTAR, "sopa")]
		const entries = copyMenuItems(items, new Set(items.map(menuItemKey)))
		expect(entries).toEqual([
			{ recipe_id: "arroz", item_group: "prato_principal", headcount_override: 120, recommended_proportion: 30, meal_type_id: ALMOCO },
			{ recipe_id: "sopa", item_group: "prato_principal", headcount_override: null, recommended_proportion: null, meal_type_id: JANTAR },
		])
	})

	test("cola numa refeição de destino, levando tudo para ela", () => {
		const items = [full(1, ALMOCO, "arroz")]
		const clipboard = copyMenuItems(items, new Set([menuItemKey(items[0])]))
		const { items: next, pasted } = pasteMenuItems(items, clipboard, { day: 3, mealTypeId: JANTAR }, makeItem)
		expect(pasted).toBe(1)
		expect(next).toHaveLength(2)
		expect(next[1]).toMatchObject({ day_of_week: 3, meal_type_id: JANTAR, recipe_id: "arroz" })
	})

	test("sem refeição de destino, cada preparação volta para a refeição de origem (colar o dia)", () => {
		const items = [full(1, ALMOCO, "arroz"), full(1, JANTAR, "sopa")]
		const clipboard = copyMenuItems(items, new Set(items.map(menuItemKey)))
		const { items: next } = pasteMenuItems(items, clipboard, { day: 5 }, makeItem)
		expect(next.filter((i) => i.day_of_week === 5).map((i) => [i.meal_type_id, i.recipe_id])).toEqual([
			[ALMOCO, "arroz"],
			[JANTAR, "sopa"],
		])
	})

	test("preparação que já está na refeição de destino é pulada, não duplicada", () => {
		const items = [full(1, ALMOCO, "arroz"), full(2, ALMOCO, "arroz")]
		const clipboard = copyMenuItems(items, new Set([menuItemKey(items[0])]))
		const { items: next, pasted, skipped } = pasteMenuItems(items, clipboard, { day: 2, mealTypeId: ALMOCO }, makeItem)
		expect({ pasted, skipped }).toEqual({ pasted: 0, skipped: 1 })
		expect(next).toHaveLength(2)
	})

	test("entra no fim do grupo, sem colidir com a ordem de quem já está lá", () => {
		const items = [full(1, ALMOCO, "arroz", { sort_order: 0 }), full(1, ALMOCO, "feijao", { sort_order: 1 })]
		const clipboard = copyMenuItems([full(9, JANTAR, "farofa")], new Set([menuItemKey(full(9, JANTAR, "farofa"))]))
		const { items: next } = pasteMenuItems(items, clipboard, { day: 1, mealTypeId: ALMOCO }, makeItem)
		expect(next[2]).toMatchObject({ recipe_id: "farofa", sort_order: 2 })
	})
})

describe("applyRecipeSelection", () => {
	type Row = MenuDraftItem & { item_group: string | null; sort_order: number; recommended_proportion: number | null }
	const row = (day: number, recipeId: string, group: string | null, sort: number, extra: Partial<Row> = {}): Row => ({
		day_of_week: day,
		meal_type_id: ALMOCO,
		recipe_id: recipeId,
		headcount_override: null,
		item_group: group,
		sort_order: sort,
		recommended_proportion: null,
		...extra,
	})
	const make = (d: Omit<Row, "headcount_override"> & { headcount_override: null }): Row => d

	test("na origem, desmarcar remove e quem fica mantém seus atributos", () => {
		const items = [row(1, "arroz", "prato_principal", 0, { headcount_override: 120 }), row(1, "feijao", "prato_principal", 1)]
		const result = applyRecipeSelection(items, { day: 1, mealTypeId: ALMOCO, group: "prato_principal" }, ["arroz"], [], make)
		expect(result).toEqual([items[0]])
	})

	test("esvaziar a refeição: nada marcado remove tudo da origem e só dela", () => {
		const items = [row(1, "arroz", "prato_principal", 0), row(2, "arroz", "prato_principal", 0)]
		const result = applyRecipeSelection(items, { day: 1, mealTypeId: ALMOCO, group: "prato_principal" }, [], [], make)
		expect(result).toEqual([items[1]])
	})

	test("preparação nova entra no fim do GRUPO escolhido, não no fim da refeição", () => {
		const items = [row(1, "arroz", "prato_principal", 0), row(1, "feijao", "prato_principal", 1)]
		const result = applyRecipeSelection(items, { day: 1, mealTypeId: ALMOCO, group: "sobremesa" }, ["arroz", "feijao", "pudim"], [], make)
		expect(result.find((i) => i.recipe_id === "pudim")).toMatchObject({ item_group: "sobremesa", sort_order: 0 })
	})

	test("outros dias só recebem o que falta — nunca perdem o que já tinham", () => {
		const items = [row(1, "arroz", "prato_principal", 0), row(3, "feijao", "prato_principal", 0), row(3, "arroz", "prato_principal", 1)]
		const result = applyRecipeSelection(items, { day: 1, mealTypeId: ALMOCO, group: "prato_principal" }, ["arroz", "farofa"], [2, 3], make)

		const day2 = result.filter((i) => i.day_of_week === 2).map((i) => i.recipe_id)
		const day3 = result.filter((i) => i.day_of_week === 3).map((i) => i.recipe_id)
		expect(day2).toEqual(["arroz", "farofa"])
		// Dia 3 mantém o feijão (não marcado) e ganha só a farofa, no fim do grupo.
		expect(day3).toEqual(["feijao", "arroz", "farofa"])
		expect(result.find((i) => i.day_of_week === 3 && i.recipe_id === "farofa")?.sort_order).toBe(2)
	})

	test("o próprio dia de origem na lista de extras não duplica", () => {
		const result = applyRecipeSelection([], { day: 1, mealTypeId: ALMOCO, group: null }, ["arroz"], [1], make)
		expect(result).toHaveLength(1)
	})
})

describe("formatItemDemand", () => {
	test("quantidade direta sai em pax; porcentagem, em %", () => {
		expect(formatItemDemand({ headcount_override: 120 })).toBe("120 pax")
		expect(formatItemDemand({ recommended_proportion: 30 })).toBe("30%")
	})

	test("quantidade direta vence a porcentagem, como na compra", () => {
		expect(formatItemDemand({ headcount_override: 120, recommended_proportion: 30 })).toBe("120 pax")
	})

	test("sem nenhum dos dois, nada — o item herda o efetivo da refeição", () => {
		expect(formatItemDemand({})).toBeNull()
		expect(formatItemDemand({ headcount_override: null, recommended_proportion: null })).toBeNull()
	})

	test("0% é informação, não ausência", () => {
		expect(formatItemDemand({ recommended_proportion: 0 })).toBe("0%")
	})
})
