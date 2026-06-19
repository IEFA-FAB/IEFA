/**
 * Regressão happy-path — operations de COZINHAS (@iefa/sisub-domain).
 * Foco: join aninhado `unit` e projeção/ordenção de listUnitKitchens.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { listKitchens, listUnitKitchens } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("kitchens operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops migradas recebem `db` (Drizzle); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("kitchen")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	test("listKitchens retorna cozinhas com unidade aninhada (shape do join)", async () => {
		if (!reachable || !seeder || !db) return
		const { id, unitId } = await seeder.seedKitchen()

		const kitchens = await listKitchens(db, ctx)
		const found = kitchens.find((k) => k.id === id)

		expect(found).toBeDefined()
		expect(found?.unit).toBeTruthy()
		expect(found?.unit?.id).toBe(unitId)
	})

	test("listUnitKitchens projeta id+display_name das cozinhas da unidade", async () => {
		if (!reachable || !seeder || !db) return
		const { id, unitId } = await seeder.seedKitchen()

		const kitchens = await listUnitKitchens(db, ctx, { unitId })
		const found = kitchens.find((k) => k.id === id)

		expect(found).toBeDefined()
		expect(found).toHaveProperty("display_name")
	})
})
