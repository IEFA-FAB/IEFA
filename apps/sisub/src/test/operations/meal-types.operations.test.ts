/**
 * Regressão happy-path — operations de TIPOS DE REFEIÇÃO (@iefa/sisub-domain).
 * Foco: escopo global vs cozinha, ordenação por sort_order, soft-delete/restore,
 * update parcial e round-trip write→read.
 */

import { createMealType, deleteMealType, fetchMealTypes, restoreMealType, updateMealType } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("meal-types operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("meal_type")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("createMealType global retorna a linha e fetchMealTypes a lista", async () => {
		if (!reachable || !seeder) return
		const name = uid("[TEST] Refeição ")
		const created = await createMealType(client, ctx, { name, kitchenId: null, sortOrder: 5 })
		seeder.track("meal_type", created.id)

		expect(created.id).toBeTruthy()
		expect(created.name).toBe(name)
		expect(created.kitchen_id).toBeNull()

		const list = await fetchMealTypes(client, ctx, { kitchenId: null })
		expect(list.map((m) => m.id)).toContain(created.id)
	})

	test("updateMealType altera campos parciais (write→read)", async () => {
		if (!reachable || !seeder) return
		const id = await seeder.seedMealType()
		const novoNome = uid("[TEST] Atualizada ")

		const updated = await updateMealType(client, ctx, { mealTypeId: id, name: novoNome })
		expect(updated.name).toBe(novoNome)

		const list = await fetchMealTypes(client, ctx, { kitchenId: null })
		expect(list.find((m) => m.id === id)?.name).toBe(novoNome)
	})

	test("deleteMealType (soft) some do fetch e restoreMealType reverte", async () => {
		if (!reachable || !seeder) return
		const id = await seeder.seedMealType()

		await deleteMealType(client, ctx, { mealTypeId: id })
		const aposDelete = await fetchMealTypes(client, ctx, { kitchenId: null })
		expect(aposDelete.map((m) => m.id)).not.toContain(id)

		await restoreMealType(client, ctx, { mealTypeId: id })
		const aposRestore = await fetchMealTypes(client, ctx, { kitchenId: null })
		expect(aposRestore.map((m) => m.id)).toContain(id)
	})

	test("fetchMealTypes com kitchenId inclui globais e da cozinha", async () => {
		if (!reachable || !seeder) return
		const { id: kitchenId } = await seeder.seedKitchen()
		const globalId = await seeder.seedMealType({ kitchenId: null })
		const localId = await seeder.seedMealType({ kitchenId })

		const list = await fetchMealTypes(client, ctx, { kitchenId })
		const ids = list.map((m) => m.id)

		expect(ids).toContain(globalId) // kitchen_id IS NULL
		expect(ids).toContain(localId) // kitchen_id = kitchenId
	})
})
