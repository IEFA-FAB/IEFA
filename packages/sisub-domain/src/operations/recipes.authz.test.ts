/**
 * Contrato de autorização da LEITURA de receitas por id — e do conteúdo que um template grava.
 *
 * `fetchRecipe` e `listRecipeVersions` só exigiam "lê receitas" (`kitchen:1` ou `global:1`,
 * sem escopo): `kitchen:1` da cozinha A abria a ficha local da cozinha B sabendo o UUID, e as
 * versões de uma receita GLOBAL devolviam o fork de toda cozinha que a adaptou.
 *
 * Regra (a mesma da leitura de template): receita global lê quem tem cozinha ou catálogo
 * global; receita local, só quem tem aquela cozinha.
 */

import { describe, expect, test } from "bun:test"
import { mealTypeInKitchen, recipesInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { fetchRecipe, listRecipeVersions } from "./recipes.ts"
import { createTemplate, saveTemplateEdit } from "./templates.ts"

const ROOT_ID = "11111111-1111-4111-8111-111111111111"
const FORK_A_ID = "22222222-2222-4222-8222-222222222222"
const FORK_B_ID = "33333333-3333-4333-8333-333333333333"
const MEAL_GLOBAL = "44444444-4444-4444-8444-444444444444"
const MEAL_B = "55555555-5555-4555-8555-555555555555"
const TEMPLATE_ID = "66666666-6666-4666-8666-666666666666"
const KITCHEN_A = 3
const KITCHEN_B = 9

function ctx(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions, aal: 1, lastFactorAt: null, origin: "session" }
}
const kitchenCtx = (kitchenId: number, level: 1 | 2 = 1) => ctx([{ module: "kitchen", level, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])
const globalCtx = ctx([{ module: "global", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null }])

type Row = { id: string; kitchenId: number | null; baseRecipeId: string | null; version: number }
const LINEAGE: Row[] = [
	{ id: ROOT_ID, kitchenId: null, baseRecipeId: null, version: 1 },
	{ id: FORK_A_ID, kitchenId: KITCHEN_A, baseRecipeId: ROOT_ID, version: 2 },
	{ id: FORK_B_ID, kitchenId: KITCHEN_B, baseRecipeId: ROOT_ID, version: 2 },
]
const MEAL_TYPES = [
	{ id: MEAL_GLOBAL, kitchenId: null },
	{ id: MEAL_B, kitchenId: KITCHEN_B },
]

/**
 * Stub do Drizzle. `findFirst` ignora o `where` e devolve a linha do id pedido (capturado pelo
 * teste); `findMany` devolve a linhagem inteira; `select().from(t).where()` devolve a tabela.
 */
function fakeDb(requestedId: string): SisubDb {
	const recipeRow = (r: Row) => ({ ...r, name: "Arroz", deletedAt: null, recipeIngredientsInKitchens: [] })
	return {
		query: {
			recipesInKitchen: {
				findFirst: () => Promise.resolve(recipeRow(LINEAGE.find((r) => r.id === requestedId) as Row)),
				findMany: () => Promise.resolve(LINEAGE.map(recipeRow)),
			},
		},
		select: () => ({
			from: (table: unknown) => ({
				where: () => Promise.resolve(table === recipesInKitchen ? LINEAGE : table === mealTypeInKitchen ? MEAL_TYPES : []),
			}),
		}),
		transaction: () => Promise.reject(new Error("não deveria chegar à escrita")),
	} as unknown as SisubDb
}

describe("fetchRecipe", () => {
	test("receita local de OUTRA cozinha é recusada", async () => {
		await expect(fetchRecipe(fakeDb(FORK_B_ID), kitchenCtx(KITCHEN_A), { recipeId: FORK_B_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
	})

	test("receita local da própria cozinha é lida", async () => {
		await expect(fetchRecipe(fakeDb(FORK_A_ID), kitchenCtx(KITCHEN_A), { recipeId: FORK_A_ID })).resolves.toMatchObject({ id: FORK_A_ID })
	})

	test("receita global é lida por cozinha e por catálogo global", async () => {
		await expect(fetchRecipe(fakeDb(ROOT_ID), kitchenCtx(KITCHEN_A), { recipeId: ROOT_ID })).resolves.toMatchObject({ id: ROOT_ID })
		await expect(fetchRecipe(fakeDb(ROOT_ID), globalCtx, { recipeId: ROOT_ID })).resolves.toMatchObject({ id: ROOT_ID })
	})

	test("`global` não abre receita de cozinha", async () => {
		await expect(fetchRecipe(fakeDb(FORK_A_ID), globalCtx, { recipeId: FORK_A_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})

describe("listRecipeVersions", () => {
	test("versões de uma receita global omitem o fork das outras cozinhas", async () => {
		const versions = await listRecipeVersions(fakeDb(ROOT_ID), kitchenCtx(KITCHEN_A), { recipeId: ROOT_ID })
		expect(versions.map((v) => v.id)).toEqual([ROOT_ID, FORK_A_ID])
	})

	test("pedir as versões pelo id do fork de outra cozinha é recusado", async () => {
		await expect(listRecipeVersions(fakeDb(FORK_B_ID), kitchenCtx(KITCHEN_A), { recipeId: FORK_B_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})

describe("conteúdo gravado num template fica no escopo do template", () => {
	const item = (recipeId: string, mealTypeId = MEAL_GLOBAL) => ({ dayOfWeek: 1, mealTypeId, recipeId, recommendedProportion: null })

	test("createTemplate recusa receita local de outra cozinha", async () => {
		const run = createTemplate(fakeDb(ROOT_ID), kitchenCtx(KITCHEN_A, 2), {
			name: "Semana",
			kitchenId: KITCHEN_A,
			templateType: "weekly",
			items: [item(ROOT_ID), item(FORK_B_ID)],
		})
		await expect(run).rejects.toBeInstanceOf(NotFoundError)
	})

	test("createTemplate recusa tipo de refeição local de outra cozinha", async () => {
		const run = createTemplate(fakeDb(ROOT_ID), kitchenCtx(KITCHEN_A, 2), {
			name: "Semana",
			kitchenId: KITCHEN_A,
			templateType: "weekly",
			items: [item(ROOT_ID, MEAL_B)],
		})
		await expect(run).rejects.toBeInstanceOf(NotFoundError)
	})

	test("saveTemplateEdit recusa receita de outra cozinha antes de escrever", async () => {
		const db = {
			...fakeDb(ROOT_ID),
			select: (cols?: unknown) =>
				cols && typeof cols === "object" && "template_type" in cols
					? {
							from: () => ({
								where: () => ({
									limit: () => Promise.resolve([{ id: TEMPLATE_ID, kitchen_id: KITCHEN_A, name: "Semana", deleted_at: null, template_type: "weekly" }]),
								}),
							}),
						}
					: (fakeDb(ROOT_ID) as unknown as { select: () => unknown }).select(),
		} as unknown as SisubDb
		const run = saveTemplateEdit(db, kitchenCtx(KITCHEN_A, 2), {
			templateId: TEMPLATE_ID,
			context: { scope: "kitchen", kitchenId: KITCHEN_A },
			items: [item(FORK_B_ID)],
		})
		await expect(run).rejects.toBeInstanceOf(NotFoundError)
	})

	test("receitas globais e da própria cozinha passam da validação e chegam à escrita", async () => {
		const run = createTemplate(fakeDb(ROOT_ID), kitchenCtx(KITCHEN_A, 2), {
			name: "Semana",
			kitchenId: KITCHEN_A,
			templateType: "weekly",
			items: [item(ROOT_ID), item(FORK_A_ID)],
		})
		// O stub recusa a transação: chegar nela prova que a validação deixou passar.
		await expect(run).rejects.toThrow("não deveria chegar à escrita")
	})
})
