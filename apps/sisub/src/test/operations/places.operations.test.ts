/**
 * Regressão happy-path — operations de PLACES / org-graph (@iefa/sisub-domain).
 * Congela: reads de referência (units/mess_halls/graph), lookups por code, mutações,
 * other_presences (count/insert) e resolveDisplayName (v_user_identity) ANTES da migração Drizzle.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	addOtherPresence,
	fetchMessHallByCode,
	fetchMessHallIdByCode,
	fetchOtherPresencesCount,
	fetchPlacesGraph,
	listAllMessHalls,
	resolveDisplayName,
	updatePlacesEntity,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("places operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("mess_halls")
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

	test("listAllMessHalls inclui o rancho semeado com o shape esperado", async () => {
		if (!reachable || !seeder || !db) return
		const { id, unitId, code } = await seeder.seedMessHall()

		const all = await listAllMessHalls(db, ctx)
		const found = all.find((m) => m.id === id)
		expect(found).toBeDefined()
		expect(found).toMatchObject({ id, unit_id: unitId, code })
		expect(found).toHaveProperty("kitchen_id")
	})

	test("fetchMessHallByCode + fetchMessHallIdByCode resolvem por code", async () => {
		if (!reachable || !seeder || !db) return
		const { id, code, unitId } = await seeder.seedMessHall()

		const byCode = await fetchMessHallByCode(db, ctx, { code })
		expect(byCode).toMatchObject({ id, code, unit_id: unitId })

		const idByCode = await fetchMessHallIdByCode(db, ctx, { code })
		expect(idByCode).toBe(id)

		// code vazio → null sem query
		expect(await fetchMessHallIdByCode(db, ctx, { code: "" })).toBeNull()
	})

	test("fetchPlacesGraph retorna { units, kitchens, messHalls } como arrays", async () => {
		if (!reachable || !seeder || !db) return
		const { id: kitchenId, unitId } = await seeder.seedKitchen()
		const { id: messHallId } = await seeder.seedMessHall({ unitId, kitchenId })

		const graph = await fetchPlacesGraph(db, ctx)
		expect(Array.isArray(graph.units)).toBe(true)
		expect(Array.isArray(graph.kitchens)).toBe(true)
		expect(Array.isArray(graph.messHalls)).toBe(true)
		expect(graph.units.map((u: { id: number }) => u.id)).toContain(unitId)
		expect(graph.messHalls.map((m: { id: number }) => m.id)).toContain(messHallId)
	})

	test("updatePlacesEntity (mess_hall) renomeia e persiste", async () => {
		if (!reachable || !seeder || !db) return
		const { id, code } = await seeder.seedMessHall()
		const newName = uid("[TEST] Rancho Renomeado ")

		const res = await updatePlacesEntity(db, ctx, { entityType: "mess_hall", id, display_name: newName, code })
		expect(res).toEqual({ ok: true })

		const after = await fetchMessHallByCode(db, ctx, { code })
		expect(after?.display_name).toBe(newName)
	})

	test("addOtherPresence + fetchOtherPresencesCount contam presenças avulsas", async () => {
		if (!reachable || !seeder || !db) return
		const adminId = await seeder.seedAuthUser()
		const { id: messHallId } = await seeder.seedMessHall()
		const date = "2099-08-01"
		const meal = "almoco"
		// addOtherPresence (operation) cria a linha; rastrear p/ não bloquear o delete do auth user.
		seeder.trackWhere("other_presences", "admin_id", adminId)

		expect(await fetchOtherPresencesCount(db, ctx, { date, meal, messHallId })).toBe(0)
		await addOtherPresence(db, ctx, { adminId, date, meal, messHallId })
		expect(await fetchOtherPresencesCount(db, ctx, { date, meal, messHallId })).toBe(1)
	})

	test("resolveDisplayName cai para o email quando não há dado militar", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const email = `${uid("dn-")}@example.invalid`.toLowerCase()
		await seeder.seedUserData({ id: userId, email })

		const name = await resolveDisplayName(db, ctx, { userId })
		expect(name).toBe(email)
	})
})
