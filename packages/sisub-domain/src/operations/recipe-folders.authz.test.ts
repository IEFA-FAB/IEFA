/**
 * Contrato de autorização das PASTAS DE PREPARAÇÃO.
 *
 * A pasta é agrupamento simples, mas envolve dois níveis distintos de escrita, e trocá-los é o
 * erro fácil:
 *   - o CONJUNTO de pastas é catálogo → `global:2` (como as pastas de insumo);
 *   - ARQUIVAR uma preparação segue a POSSE dela — global exige `global:2`, local exige
 *     `kitchen:2` NAQUELA cozinha, sempre lida da linha persistida (nunca do input).
 *
 * O caso que este teste existe para travar: um lote misto. `setRecipeFolder` recebe várias
 * preparações de uma vez; autorizar item a item enquanto escreve deixaria as primeiras
 * arquivadas antes de recusar a primeira alheia — meia operação aplicada, sem erro visível para
 * o que já passou.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import { createRecipeFolder, deleteRecipeFolder, renameRecipeFolder, setRecipeFolder } from "./recipes.ts"

const FOLDER_ID = "11111111-1111-4111-8111-111111111111"
const OWNER_KITCHEN = 3
const OTHER_KITCHEN = 9

function ctx(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions }
}

const kitchenCtx = (kitchenId: number, level = 2) => ctx([{ module: "kitchen", level, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])

const globalCtx = (level = 2) => ctx([{ module: "global", level, kitchen_id: null, mess_hall_id: null, unit_id: null }])

/**
 * Stub do handle Drizzle. `setRecipeFolder` lê os donos com
 * `select(...).from(...).where(...)` (sem `.limit()`) e escreve com
 * `update(...).set(...).where(...).returning(...)`; `updates` registra as escritas para provar
 * que a recusa acontece ANTES de qualquer uma.
 */
function fakeDb(owners: { id: string; kitchenId: number | null }[]) {
	const updates: unknown[] = []
	const db = {
		select: () => {
			const chain = { from: () => chain, where: () => Promise.resolve(owners) }
			return chain
		},
		update: () => {
			const chain = {
				set: (values: unknown) => {
					updates.push(values)
					return chain
				},
				where: () => chain,
				returning: () => Promise.resolve(owners.map((o) => ({ id: o.id }))),
			}
			return chain
		},
		query: {
			recipeFolderInKitchen: { findFirst: () => Promise.resolve({ id: FOLDER_ID }) },
		},
	}
	return { db: db as unknown as SisubDb, updates }
}

const LOCAL = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kitchenId: OWNER_KITCHEN }
const OTHERS = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", kitchenId: OTHER_KITCHEN }
const GLOBAL = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", kitchenId: null }

describe("catálogo de pastas de preparação", () => {
	const CATALOG_OPS: [string, (db: SisubDb, c: UserContext) => Promise<unknown>][] = [
		["createRecipeFolder", (db, c) => createRecipeFolder(db, c, { name: "Carnes" })],
		["renameRecipeFolder", (db, c) => renameRecipeFolder(db, c, { id: FOLDER_ID, name: "Carnes" })],
		["deleteRecipeFolder", (db, c) => deleteRecipeFolder(db, c, { id: FOLDER_ID })],
	]

	test.each(CATALOG_OPS)("%s nega quem só tem kitchen:2", async (_name, run) => {
		const { db, updates } = fakeDb([])
		await expect(run(db, kitchenCtx(OWNER_KITCHEN))).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(updates).toHaveLength(0)
	})

	test.each(CATALOG_OPS)("%s nega global:1 (leitura estrita)", async (_name, run) => {
		const { db, updates } = fakeDb([])
		await expect(run(db, globalCtx(1))).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(updates).toHaveLength(0)
	})
})

describe("setRecipeFolder — posse da preparação", () => {
	test("arquiva as preparações da própria cozinha", async () => {
		const { db, updates } = fakeDb([LOCAL])
		const result = await setRecipeFolder(db, kitchenCtx(OWNER_KITCHEN), { recipeIds: [LOCAL.id], folderId: FOLDER_ID })
		expect(result.updated).toBe(1)
		expect(updates).toEqual([{ folderId: FOLDER_ID }])
	})

	test("kitchen:2 não arquiva preparação GLOBAL (isso é do catálogo da SDAB)", async () => {
		const { db, updates } = fakeDb([GLOBAL])
		await expect(setRecipeFolder(db, kitchenCtx(OWNER_KITCHEN), { recipeIds: [GLOBAL.id], folderId: FOLDER_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(updates).toHaveLength(0)
	})

	test("kitchen:2 não arquiva preparação de OUTRA cozinha", async () => {
		const { db, updates } = fakeDb([OTHERS])
		await expect(setRecipeFolder(db, kitchenCtx(OWNER_KITCHEN), { recipeIds: [OTHERS.id], folderId: FOLDER_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(updates).toHaveLength(0)
	})

	test("lote misto é recusado INTEIRO — nada é escrito antes da primeira recusa", async () => {
		const { db, updates } = fakeDb([LOCAL, OTHERS])
		await expect(setRecipeFolder(db, kitchenCtx(OWNER_KITCHEN), { recipeIds: [LOCAL.id, OTHERS.id], folderId: FOLDER_ID })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
		expect(updates).toHaveLength(0)
	})

	test("global:2 arquiva preparação global", async () => {
		const { db, updates } = fakeDb([GLOBAL])
		const result = await setRecipeFolder(db, globalCtx(), { recipeIds: [GLOBAL.id], folderId: null })
		expect(result.updated).toBe(1)
		expect(updates).toEqual([{ folderId: null }])
	})
})
