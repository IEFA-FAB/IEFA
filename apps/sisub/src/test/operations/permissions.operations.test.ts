/**
 * Regressão happy-path — operations de PERMISSIONS / RBAC (@iefa/sisub-domain).
 * Congela: injeção implícita de "diner", filtro de deny (level 0), CRUD admin, busca por email.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	createUserPermission,
	deleteUserPermission,
	fetchUserPermissionsAdmin,
	listEffectiveUserPermissions,
	searchUsersByEmail,
	updateUserPermission,
} from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("permissions operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("user_permissions")
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

	test("listEffectiveUserPermissions injeta diner implícito e descarta deny (level 0)", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "kitchen", level: 2 })
		await seeder.seedUserPermission({ userId, module: "global", level: 0 }) // deny explícito

		const perms = await listEffectiveUserPermissions(db, { userId })
		const byModule = new Map(perms.map((p) => [p.module, p.level]))
		expect(byModule.get("kitchen")).toBe(2)
		expect(byModule.get("diner")).toBe(1) // injetado (não havia regra diner)
		expect(byModule.has("global")).toBe(false) // deny removido
	})

	test("listEffectiveUserPermissions NÃO injeta diner quando já existe regra diner", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "diner", level: 2 })

		const perms = await listEffectiveUserPermissions(db, { userId })
		const dinerRules = perms.filter((p) => p.module === "diner")
		expect(dinerRules).toHaveLength(1)
		expect(dinerRules[0].level).toBe(2) // a regra explícita, não a injetada
	})

	test("CRUD admin: create → fetch (ordenado por module) → update → delete", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)

		const created = await createUserPermission(db, ctx, { userId, module: "kitchen", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null })
		expect(created).toEqual({ success: true })

		const rows = await fetchUserPermissionsAdmin(db, ctx, { userId })
		expect(rows).toHaveLength(1)
		const permId = rows[0].id
		expect(rows[0].module).toBe("kitchen")
		expect(rows[0].level).toBe(1)

		await updateUserPermission(db, ctx, { permissionId: permId, level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null })
		const afterUpdate = await fetchUserPermissionsAdmin(db, ctx, { userId })
		expect(afterUpdate[0].level).toBe(2)

		await deleteUserPermission(db, ctx, { permissionId: permId })
		const afterDelete = await fetchUserPermissionsAdmin(db, ctx, { userId })
		expect(afterDelete).toHaveLength(0)
	})

	test("searchUsersByEmail encontra por ilike e devolve { id, email, nrOrdem }", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const tag = uid("search")
		const email = `${tag}@example.invalid`.toLowerCase()
		await seeder.seedUserData({ id: userId, email })

		const results = await searchUsersByEmail(db, ctx, { email: tag })
		const found = results.find((r) => r.id === userId)
		expect(found).toBeDefined()
		expect(found?.email).toBe(email)
		expect(found).toHaveProperty("nrOrdem")
	})
})
