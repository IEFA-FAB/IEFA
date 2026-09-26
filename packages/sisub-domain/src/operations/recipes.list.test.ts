/**
 * `listRecipes` em duas fases: linhagem resolvida sobre colunas leves, ficha técnica só dos
 * vencedores.
 *
 * A versão anterior carregava a ficha de TODAS as versões (4.597 linhas no catálogo global em
 * 2026-09) e descartava dois terços em JS. Estes testes prendem o que a troca não pode mudar
 * (vencedor, ordem pt-BR, preparação excluída zerada, `numeric` como número) e o que ela
 * promete (a fase pesada só vê os ids vencedores, em lotes).
 */

import { describe, expect, test } from "bun:test"
import { recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { listRecipes } from "./recipes.ts"

const dialect = new PgDialect()

function ctx(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}
const kitchenCtx = (kitchenId: number) => ctx([{ module: "kitchen", level: 1, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])

type LightRow = { id: string; baseRecipeId: string | null; kitchenId: number | null; version: number }
type FullRow = LightRow & { name: string; deletedAt: string | null; portionYield: string; recipeIngredientsInKitchens: unknown[] }

/**
 * Stub do Drizzle: `select().from().where()` devolve as linhas leves; `findMany` devolve,
 * das linhas completas, as que o `where` pede por id — lendo os parâmetros do SQL gerado,
 * que é o que o Postgres receberia.
 */
function fakeDb(light: LightRow[], full: FullRow[]) {
	const findManyCalls: { sql: string; ids: string[] }[] = []
	const db = {
		select: () => ({ from: (table: unknown) => ({ where: () => Promise.resolve(table === recipesInKitchen ? light : []) }) }),
		query: {
			recipesInKitchen: {
				findMany: (config: { where: SQL; with: unknown }) => {
					const { sql, params } = dialect.sqlToQuery(config.where)
					const ids = params.filter((p): p is string => typeof p === "string" && full.some((r) => r.id === p))
					findManyCalls.push({ sql, ids })
					return Promise.resolve(full.filter((r) => ids.includes(r.id)).map((r) => structuredClone(r)))
				},
			},
		},
	} as unknown as SisubDb
	return { db, findManyCalls }
}

const full = (r: LightRow, name: string, ingredients: unknown[] = []): FullRow => ({
	...r,
	name,
	deletedAt: null,
	portionYield: "100.000",
	recipeIngredientsInKitchens: ingredients,
})

describe("listRecipes", () => {
	const root: LightRow = { id: "root", baseRecipeId: null, kitchenId: null, version: 1 }
	const v2: LightRow = { id: "v2", baseRecipeId: "root", kitchenId: null, version: 2 }
	const fork: LightRow = { id: "fork", baseRecipeId: "root", kitchenId: 7, version: 1 }
	const solo: LightRow = { id: "solo", baseRecipeId: null, kitchenId: null, version: 1 }
	const accent: LightRow = { id: "acento", baseRecipeId: null, kitchenId: null, version: 1 }

	test("a fase pesada só recebe os vencedores e a saída sai em ordem pt-BR", async () => {
		const { db, findManyCalls } = fakeDb([root, v2, solo, accent], [full(root, "Arroz v1"), full(v2, "Arroz"), full(solo, "Feijão"), full(accent, "Abóbora")])
		const recipes = await listRecipes(db, kitchenCtx(7), { kitchenId: null })

		expect(findManyCalls).toHaveLength(1)
		expect(findManyCalls[0].ids.toSorted()).toEqual(["acento", "solo", "v2"])
		// O recorte da fase 1 é reaplicado na fase 2.
		expect(findManyCalls[0].sql).toContain('"deleted_at" is null')
		expect(findManyCalls[0].sql).toContain('"kitchen_id" is null')
		expect(recipes.map((r) => r.id)).toEqual(["acento", "v2", "solo"])
		expect(recipes[0].portion_yield).toBe(100)
	})

	test("fork local vence o global na listagem da cozinha", async () => {
		const { db, findManyCalls } = fakeDb([root, v2, fork], [full(root, "Arroz"), full(v2, "Arroz"), full(fork, "Arroz da ala")])
		const recipes = await listRecipes(db, kitchenCtx(7), { kitchenId: 7 })
		expect(findManyCalls[0].ids).toEqual(["fork"])
		expect(recipes.map((r) => r.id)).toEqual(["fork"])
	})

	test("preparação congelada na lixeira não vaza pela ficha", async () => {
		const ingredients = [
			{ id: "ri-1", frozenPreparationInKitchen: { id: "fp-1", deletedAt: "2026-09-01T00:00:00Z" }, ingredientInKitchen: null },
			{ id: "ri-2", frozenPreparationInKitchen: { id: "fp-2", deletedAt: null }, ingredientInKitchen: null },
		]
		const { db } = fakeDb([solo], [full(solo, "Feijão", ingredients)])
		const [recipe] = await listRecipes(db, kitchenCtx(7), { kitchenId: null })
		expect(recipe.ingredients.map((ri) => ri.frozen_preparation?.id ?? null)).toEqual([null, "fp-2"])
	})

	test("catálogo grande vai em lotes de 1.000 ids", async () => {
		const light = Array.from({ length: 2500 }, (_, i): LightRow => ({ id: `r-${i}`, baseRecipeId: null, kitchenId: null, version: 1 }))
		const { db, findManyCalls } = fakeDb(
			light,
			light.map((r) => full(r, r.id))
		)
		const recipes = await listRecipes(db, kitchenCtx(7), { kitchenId: null })
		expect(findManyCalls.map((c) => c.ids.length)).toEqual([1000, 1000, 500])
		expect(recipes).toHaveLength(2500)
	})

	test("vencedor que sumiu entre as fases (excluído no meio) sai da lista, sem erro", async () => {
		const { db } = fakeDb([v2, solo], [full(solo, "Feijão")])
		const recipes = await listRecipes(db, kitchenCtx(7), { kitchenId: null })
		expect(recipes.map((r) => r.id)).toEqual(["solo"])
	})

	test("recorte vazio não dispara a fase pesada", async () => {
		const { db, findManyCalls } = fakeDb([], [])
		expect(await listRecipes(db, kitchenCtx(7), { kitchenId: null })).toEqual([])
		expect(findManyCalls).toHaveLength(0)
	})

	test("cozinha alheia é recusada antes de qualquer consulta", async () => {
		const { db, findManyCalls } = fakeDb([solo], [full(solo, "Feijão")])
		await expect(listRecipes(db, kitchenCtx(7), { kitchenId: 9 })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(findManyCalls).toHaveLength(0)
	})
})
