/**
 * Contrato de autorização dos EQUIPAMENTOS.
 *
 * Três donos diferentes convivem nas mesmas operações, e trocá-los é o erro fácil:
 *   - modelo do CATÁLOGO GLOBAL (`kitchen_id` null) → escrita exige `global:2`;
 *   - modelo e PARQUE de uma cozinha → escrita exige `kitchen:2` NAQUELA cozinha;
 *   - lista mínima da preparação → segue a posse da RECEITA.
 *
 * O caso que este teste existe para travar é o mesmo do bug de `kitchen:2` mutando ativo global
 * (ver guards/asset-ownership.ts): o dono tem de sair da LINHA PERSISTIDA, nunca do input — e a
 * recusa tem de acontecer ANTES de qualquer escrita.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext } from "../types/context.ts"
import { PermissionDeniedError } from "../types/errors.ts"
import {
	createEquipmentModel,
	createEquipmentUnit,
	deleteEquipmentUnit,
	fetchRecipeEquipment,
	listKitchenEquipment,
	saveRecipeEquipment,
	updateEquipmentModel,
	updateEquipmentUnit,
} from "./equipment.ts"

const OWNER_KITCHEN = 3
const OTHER_KITCHEN = 9
const MODEL_ID = "11111111-1111-4111-8111-111111111111"
const UNIT_ID = "22222222-2222-4222-8222-222222222222"
const ROLE_ID = "33333333-3333-4333-8333-333333333333"
const RECIPE_ID = "44444444-4444-4444-8444-444444444444"

function ctx(permissions: UserContext["permissions"]): UserContext {
	return { userId: "user-1", permissions }
}

const kitchenCtx = (kitchenId: number, level = 2) => ctx([{ module: "kitchen", level, kitchen_id: kitchenId, mess_hall_id: null, unit_id: null }])
const globalCtx = (level = 2) => ctx([{ module: "global", level, kitchen_id: null, mess_hall_id: null, unit_id: null }])

/**
 * Stub do handle Drizzle. `rows` alimenta todo `select(...).from(...).where(...)`
 * (dono da unidade, papéis existentes, modelo visível); `owner` alimenta os `findFirst`
 * do guard de ownership. `writes` registra escritas para provar que a recusa vem antes.
 */
function fakeDb(rows: unknown[] = [], owner: { kitchenId: number | null } | undefined = undefined) {
	const writes: string[] = []
	const selectChain: Record<string, unknown> = {}
	selectChain.from = () => selectChain
	selectChain.where = () => Object.assign(Promise.resolve(rows), selectChain)
	selectChain.orderBy = () => Promise.resolve(rows)
	selectChain.limit = () => Promise.resolve(rows)

	const findFirst = () => Promise.resolve(owner)
	// Promise REAL com os métodos da chain pendurados: as operations tanto encadeiam
	// (`.returning()`) quanto aguardam direto (`.then(() => undefined)`), e um objeto literal
	// com `then` seria um thenable falso (biome/noThenProperty).
	const settled = () => Object.assign(Promise.resolve(rows), { returning: () => Promise.resolve(rows) })
	const db = {
		select: () => selectChain,
		insert: () => {
			writes.push("insert")
			return { values: () => settled() }
		},
		update: () => {
			writes.push("update")
			const chain: Record<string, unknown> = {}
			chain.set = () => chain
			chain.where = () => settled()
			return chain
		},
		transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
		query: {
			recipesInKitchen: { findFirst },
			equipmentModelInKitchen: { findFirst },
		},
	}
	return { db: db as unknown as SisubDb, writes }
}

const MODEL_INPUT = { name: "Forno teste", roles: [{ roleId: ROLE_ID, isPrimary: true }], simultaneousSlots: 1, isGeneric: false }
const UNIT_INPUT = { modelId: MODEL_ID, label: "Forno 1", status: "active" as const, roleOverrides: [] }

describe("catálogo global de modelos", () => {
	test("criar modelo global com kitchen:2 é recusado (exige global:2)", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentModel(db, kitchenCtx(OWNER_KITCHEN), { ...MODEL_INPUT, kitchenId: null })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("editar modelo global com kitchen:2 é recusado — o dono vem da linha, não do input", async () => {
		const { db, writes } = fakeDb([], { kitchenId: null })
		await expect(updateEquipmentModel(db, kitchenCtx(OWNER_KITCHEN), { modelId: MODEL_ID, name: "outro" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("editar modelo de OUTRA cozinha é recusado mesmo com kitchen:2 na própria", async () => {
		const { db, writes } = fakeDb([], { kitchenId: OTHER_KITCHEN })
		await expect(updateEquipmentModel(db, kitchenCtx(OWNER_KITCHEN), { modelId: MODEL_ID, name: "outro" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})
})

describe("parque instalado", () => {
	test("cadastrar equipamento em outra cozinha é recusado", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN), { ...UNIT_INPUT, kitchenId: OTHER_KITCHEN })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("cadastrar equipamento com kitchen:1 é recusado (leitura não escreve)", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN, 1), { ...UNIT_INPUT, kitchenId: OWNER_KITCHEN })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
		expect(writes).toEqual([])
	})

	test("editar equipamento resolve a cozinha DONA no banco antes de autorizar", async () => {
		const { db, writes } = fakeDb([{ kitchenId: OTHER_KITCHEN }])
		await expect(updateEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN), { unitId: UNIT_ID, label: "renomeado" })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("remover equipamento de outra cozinha é recusado", async () => {
		const { db, writes } = fakeDb([{ kitchenId: OTHER_KITCHEN }])
		await expect(deleteEquipmentUnit(db, kitchenCtx(OWNER_KITCHEN), { unitId: UNIT_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("listar o parque de outra cozinha é recusado", async () => {
		const { db } = fakeDb([])
		await expect(listKitchenEquipment(db, kitchenCtx(OWNER_KITCHEN), { kitchenId: OTHER_KITCHEN, includeInactive: false })).rejects.toBeInstanceOf(
			PermissionDeniedError
		)
	})

	test("global:2 NÃO abre o parque de uma cozinha — o módulo é outro", async () => {
		const { db, writes } = fakeDb()
		await expect(createEquipmentUnit(db, globalCtx(), { ...UNIT_INPUT, kitchenId: OWNER_KITCHEN })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})
})

describe("lista mínima da preparação", () => {
	test("salvar exigência de preparação GLOBAL com kitchen:2 é recusado", async () => {
		const { db, writes } = fakeDb([], { kitchenId: null })
		await expect(saveRecipeEquipment(db, kitchenCtx(OWNER_KITCHEN), { recipeId: RECIPE_ID, requirements: [] })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("salvar exigência de preparação de OUTRA cozinha é recusado", async () => {
		const { db, writes } = fakeDb([], { kitchenId: OTHER_KITCHEN })
		await expect(saveRecipeEquipment(db, kitchenCtx(OWNER_KITCHEN), { recipeId: RECIPE_ID, requirements: [] })).rejects.toBeInstanceOf(PermissionDeniedError)
		expect(writes).toEqual([])
	})

	test("ler a lista de preparação de outra cozinha é recusado", async () => {
		const { db } = fakeDb([{ kitchenId: OTHER_KITCHEN }])
		await expect(fetchRecipeEquipment(db, kitchenCtx(OWNER_KITCHEN, 1), { recipeId: RECIPE_ID })).rejects.toBeInstanceOf(PermissionDeniedError)
	})
})
