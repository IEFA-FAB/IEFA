/**
 * Regressão happy-path — operations de COZINHAS (@iefa/sisub-domain).
 * Foco: join aninhado `unit` e projeção/ordenção de listUnitKitchens.
 */

import { listKitchens, listUnitKitchens } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("kitchens operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("kitchen")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("listKitchens retorna cozinhas com unidade aninhada (shape do join)", async () => {
		if (!reachable || !seeder) return
		const { id, unitId } = await seeder.seedKitchen()

		const kitchens = await listKitchens(client, ctx)
		const found = kitchens.find((k) => k.id === id)

		expect(found).toBeDefined()
		expect(found?.unit).toBeTruthy()
		expect(found?.unit.id).toBe(unitId)
	})

	test("listUnitKitchens projeta id+display_name das cozinhas da unidade", async () => {
		if (!reachable || !seeder) return
		const { id, unitId } = await seeder.seedKitchen()

		const kitchens = await listUnitKitchens(client, ctx, { unitId })
		const found = kitchens.find((k) => k.id === id)

		expect(found).toBeDefined()
		expect(found).toHaveProperty("display_name")
	})
})
