/**
 * Contrato do cardápio do dia: a leitura do comensal e a abertura de cardápio pelo planejamento.
 *
 * `fetchDailyMenuContent` não tinha guard nem teto — qualquer sessão pedia N cozinhas por um
 * intervalo arbitrário — e devolvia ao comensal as linhas inteiras da ficha técnica gravadas no
 * snapshot (quantidades do rendimento, fatores, ids, a linha completa do insumo). `upsertDailyMenu`
 * aceitava qualquer `mealTypeId`: refeição local de outra cozinha ou a de sistema do lanche.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { DAILY_MENU_CONTENT_MAX_DAYS, DAILY_MENU_CONTENT_MAX_KITCHENS, FetchDailyMenuContentSchema } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { fetchDailyMenuContent, upsertDailyMenu } from "./planning.ts"

const KITCHEN = 3
const MEAL_TYPE_ID = "11111111-1111-4111-8111-111111111111"
const GROUP_SET_ID = "22222222-2222-4222-8222-222222222222"

type Perm = UserContext["permissions"][number]

function perm(module: Perm["module"], level: number, scope: Partial<Pick<Perm, "unit_id" | "kitchen_id" | "mess_hall_id">> = {}): Perm {
	return { module, level, unit_id: null, kitchen_id: null, mess_hall_id: null, ...scope }
}

function ctx(...permissions: Perm[]): UserContext {
	return { userId: "user-1", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}

/** Como o snapshot de `menu_items.recipe` chega do banco: linhas de `recipe_ingredients` + insumo inteiro. */
const SNAPSHOT = {
	name: "Arroz com feijão",
	portion_yield: 50,
	ingredients: [
		{
			id: "ri-1",
			ingredient_id: "ing-1",
			net_quantity: 5000,
			correction_factor: 1.1,
			deleted_at: null,
			ingredient: { id: "ing-1", description: "Arroz", measure_unit: "g", ceafa_id: "c-1" },
		},
		{ id: "ri-2", ingredient_id: "ing-2", net_quantity: 3000, deleted_at: null, ingredient: { id: "ing-2", description: "Feijão", measure_unit: "g" } },
		// Repetido na ficha (duas linhas do mesmo insumo): o comensal lê uma vez.
		{ id: "ri-3", ingredient_id: "ing-1", net_quantity: 100, deleted_at: null, ingredient: { id: "ing-1", description: "Arroz", measure_unit: "g" } },
		// Linha apagada da ficha: não é composição.
		{ id: "ri-4", ingredient_id: "ing-3", net_quantity: 10, deleted_at: "2026-09-01T00:00:00Z", ingredient: { id: "ing-3", description: "Bacon" } },
		// Preparação congelada: o snapshot não traz o insumo.
		{ id: "ri-5", ingredient_id: null, frozen_preparation_id: "fp-1", net_quantity: 200, deleted_at: null, ingredient: null },
	],
}

function contentDb(): SisubDb {
	const rows = [
		{
			serviceDate: "2026-10-01",
			kitchenId: KITCHEN,
			mealTypeInKitchen: { name: "Almoço", groupSetId: GROUP_SET_ID },
			menuItemsInKitchens: [{ id: "item-1", recipe: SNAPSHOT, itemGroup: "prato_principal", recommendedProportion: null, recipesInKitchen: null }],
		},
	]
	const groups = [{ groupSetId: GROUP_SET_ID, key: "prato_principal", label: "Prato principal", sortOrder: 1 }]
	return {
		query: { dailyMenuInKitchen: { findMany: () => Promise.resolve(rows) } },
		select: () => ({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(groups) }) }) }),
	} as unknown as SisubDb
}

const RANGE = { kitchenIds: [KITCHEN], startDate: "2026-10-01", endDate: "2026-10-07" }

describe("fetchDailyMenuContent", () => {
	test("exige diner:1 — sessão sem nenhum módulo é recusada", async () => {
		await expect(fetchDailyMenuContent(contentDb(), ctx(), RANGE)).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("deny de diner derruba a leitura, mesmo ao lado de um allow", async () => {
		await expect(fetchDailyMenuContent(contentDb(), ctx(perm("diner", 0)), RANGE)).rejects.toBeInstanceOf(PermissionDeniedError)
		await expect(fetchDailyMenuContent(contentDb(), ctx(perm("diner", 1), perm("diner", 0)), RANGE)).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("o comensal recebe só o nome de cada insumo — nada da ficha técnica", async () => {
		const content = await fetchDailyMenuContent(contentDb(), ctx(perm("diner", 1)), RANGE)
		const [dish] = content["2026-10-01"]?.almoco ?? []
		expect(dish?.name).toBe("Arroz com feijão")
		expect(dish?.ingredients).toEqual([{ ingredient_name: "Arroz" }, { ingredient_name: "Feijão" }])
		expect(dish?.group_label).toBe("Prato principal")
		// Nenhuma chave do snapshot vaza no prato.
		const serialized = JSON.stringify(content)
		for (const leaked of ["net_quantity", "correction_factor", "ceafa_id", "ingredient_id", "portion_yield", "Bacon"]) {
			expect(serialized).not.toContain(leaked)
		}
	})

	test("lista de cozinhas vazia não consulta o banco", async () => {
		await expect(fetchDailyMenuContent({} as SisubDb, ctx(perm("diner", 1)), { ...RANGE, kitchenIds: [] })).resolves.toEqual({})
	})
})

describe("FetchDailyMenuContentSchema: tetos que cobrem as telas e nada além", () => {
	const kitchens = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
	const parse = (v: unknown) => FetchDailyMenuContentSchema.safeParse(v).success

	test("arranchamento (30 dias, cozinha padrão + uma por dia) passa", () => {
		expect(parse({ kitchenIds: kitchens(31), startDate: "2026-10-01", endDate: "2026-10-30" })).toBe(true)
	})

	test("cardápio da semana (7 dias, uma cozinha) passa", () => {
		expect(parse(RANGE)).toBe(true)
	})

	test(`mais de ${DAILY_MENU_CONTENT_MAX_KITCHENS} cozinhas é recusado`, () => {
		expect(parse({ ...RANGE, kitchenIds: kitchens(DAILY_MENU_CONTENT_MAX_KITCHENS + 1) })).toBe(false)
	})

	test(`intervalo de ${DAILY_MENU_CONTENT_MAX_DAYS} dias passa; de ${DAILY_MENU_CONTENT_MAX_DAYS + 1}, não`, () => {
		expect(parse({ ...RANGE, startDate: "2026-10-01", endDate: "2026-10-31" })).toBe(true)
		expect(parse({ ...RANGE, startDate: "2026-10-01", endDate: "2026-11-01" })).toBe(false)
		expect(parse({ ...RANGE, startDate: "2026-01-01", endDate: "2026-12-31" })).toBe(false)
	})

	test("data final antes da inicial, data inexistente e id não inteiro são recusados", () => {
		expect(parse({ ...RANGE, startDate: "2026-10-07", endDate: "2026-10-01" })).toBe(false)
		expect(parse({ ...RANGE, endDate: "2026-02-30" })).toBe(false)
		expect(parse({ ...RANGE, kitchenIds: [1.5] })).toBe(false)
	})
})

describe("upsertDailyMenu confere a refeição", () => {
	/**
	 * `select().from(meal_type).where()` devolve `mealTypes` (a conferência); o `findFirst` do
	 * cardápio existente e o `insert` são registrados — o teste prova que a recusa vem antes.
	 */
	function upsertDb(mealTypes: { id: string }[]) {
		const touched: string[] = []
		const db = {
			select: () => ({ from: () => ({ where: () => Promise.resolve(mealTypes) }) }),
			query: {
				dailyMenuInKitchen: {
					findFirst: () => {
						touched.push("findFirst")
						return Promise.resolve({ id: "menu-1", kitchenId: KITCHEN, serviceDate: "2099-03-01", mealTypeId: MEAL_TYPE_ID })
					},
				},
			},
			insert: () => {
				touched.push("insert")
				throw new Error("stub: escrita")
			},
		}
		return { db: db as unknown as SisubDb, touched }
	}

	const input = { kitchenId: KITCHEN, serviceDate: "2099-03-01", mealTypeId: MEAL_TYPE_ID }
	const planner = ctx(perm("kitchen", 2, { kitchen_id: KITCHEN }))

	test("refeição de outra cozinha, de sistema ou apagada (a conferência não acha) é NotFound sem tocar o cardápio", async () => {
		const { db, touched } = upsertDb([])
		await expect(upsertDailyMenu(db, planner, input)).rejects.toBeInstanceOf(NotFoundError)
		expect(touched).toEqual([])
	})

	test("refeição válida segue para o upsert", async () => {
		const { db, touched } = upsertDb([{ id: MEAL_TYPE_ID }])
		const [menu] = await upsertDailyMenu(db, planner, input)
		expect(menu?.id).toBe("menu-1")
		expect(touched).toEqual(["findFirst"])
	})

	test("a permissão vem antes da conferência da refeição", async () => {
		const { db } = upsertDb([{ id: MEAL_TYPE_ID }])
		await expect(upsertDailyMenu(db, ctx(perm("kitchen", 1, { kitchen_id: KITCHEN })), input)).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})
