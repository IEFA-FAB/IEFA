import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import type { UserContext, UserPermission } from "../types/context.ts"
import { NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { type AssetKind, authorizeAssetMutation, requireAssetWriteForScope, resolveAssetOwner } from "./asset-ownership.ts"

function ctx(permissions: UserPermission[]): UserContext {
	return { userId: "user-1", permissions }
}

function permission(overrides: Partial<UserPermission> = {}): UserPermission {
	return { module: "kitchen", level: 1, kitchen_id: null, mess_hall_id: null, unit_id: null, ...overrides }
}

/**
 * Stub do handle Drizzle: o guard só exercita `db.query.<table>.findFirst`, e o `where`
 * do Drizzle não é inspecionável sem montar o dialeto inteiro. Como cada teste avalia
 * UM ativo, o stub devolve o dono configurado sem olhar o `where` — o que está sob teste
 * é a decisão de autorização, não a montagem da query.
 */
function fakeDb(owner: number | null): SisubDb {
	return stub(() => Promise.resolve({ kitchenId: owner }))
}

/** Stub para linha inexistente. */
function fakeDbMissing(): SisubDb {
	return stub(() => Promise.resolve(undefined))
}

function stub(findFirst: () => Promise<{ kitchenId: number | null } | undefined>): SisubDb {
	const table = { findFirst }
	return {
		query: {
			recipesInKitchen: table,
			menuTemplateInKitchen: table,
			mealTypeInKitchen: table,
			stepTemplateInKitchen: table,
			utensilInKitchen: table,
		},
	} as unknown as SisubDb
}

const KITCHEN_7_WRITE = permission({ module: "kitchen", level: 2, kitchen_id: 7 })
const KITCHEN_ANY_WRITE = permission({ module: "kitchen", level: 2 })
const GLOBAL_WRITE = permission({ module: "global", level: 2 })
const GLOBAL_READ = permission({ module: "global", level: 1 })

describe("requireAssetWriteForScope", () => {
	test("escopo global exige global:2 — kitchen:2 não serve", () => {
		expect(() => requireAssetWriteForScope(ctx([KITCHEN_ANY_WRITE]), null)).toThrow(PermissionDeniedError)
	})

	test("escopo global aceita global:2", () => {
		expect(() => requireAssetWriteForScope(ctx([GLOBAL_WRITE]), null)).not.toThrow()
	})

	test("escopo global rejeita global:1 (leitura estrita)", () => {
		expect(() => requireAssetWriteForScope(ctx([GLOBAL_READ]), null)).toThrow(PermissionDeniedError)
	})

	test("escopo local exige kitchen:2 naquela cozinha", () => {
		expect(() => requireAssetWriteForScope(ctx([KITCHEN_7_WRITE]), 7)).not.toThrow()
	})

	test("escopo local rejeita kitchen:2 de outra cozinha", () => {
		expect(() => requireAssetWriteForScope(ctx([KITCHEN_7_WRITE]), 9)).toThrow(PermissionDeniedError)
	})

	test("global:2 não substitui escopo de cozinha", () => {
		// Ser da SDAB não dá escrita na cozinha alheia — são eixos independentes.
		expect(() => requireAssetWriteForScope(ctx([GLOBAL_WRITE]), 7)).toThrow(PermissionDeniedError)
	})
})

describe("resolveAssetOwner", () => {
	test("devolve null para ativo global", async () => {
		await expect(resolveAssetOwner(fakeDb(null), "recipe", "recipe-g")).resolves.toBeNull()
	})

	test("devolve a cozinha dona para ativo local", async () => {
		await expect(resolveAssetOwner(fakeDb(7), "recipe", "recipe-l")).resolves.toBe(7)
	})

	test("linha inexistente lança NotFoundError", async () => {
		await expect(resolveAssetOwner(fakeDbMissing(), "recipe", "nope")).rejects.toThrow(NotFoundError)
	})
})

describe("authorizeAssetMutation", () => {
	const kinds: AssetKind[] = ["recipe", "menu_template", "meal_type", "step_template", "utensil"]

	for (const kind of kinds) {
		test(`${kind}: cozinha não muta ativo global`, async () => {
			const db = fakeDb(null)
			await expect(authorizeAssetMutation(db, ctx([KITCHEN_ANY_WRITE]), kind, "asset-global")).rejects.toThrow(PermissionDeniedError)
		})

		test(`${kind}: cozinha não muta ativo de outra cozinha`, async () => {
			const db = fakeDb(9)
			await expect(authorizeAssetMutation(db, ctx([KITCHEN_7_WRITE]), kind, "asset-k9")).rejects.toThrow(PermissionDeniedError)
		})

		test(`${kind}: cozinha muta o próprio ativo`, async () => {
			const db = fakeDb(7)
			await expect(authorizeAssetMutation(db, ctx([KITCHEN_7_WRITE]), kind, "asset-k7")).resolves.toBe(7)
		})

		test(`${kind}: SDAB muta ativo global`, async () => {
			const db = fakeDb(null)
			await expect(authorizeAssetMutation(db, ctx([GLOBAL_WRITE]), kind, "asset-global")).resolves.toBeNull()
		})
	}

	test("id inexistente lança NotFoundError antes de checar permissão", async () => {
		// Mesmo erro para id desconhecido e para id de outra cozinha: sondar não revela posse.
		await expect(authorizeAssetMutation(fakeDbMissing(), ctx([]), "recipe", "nope")).rejects.toThrow(NotFoundError)
	})
})
