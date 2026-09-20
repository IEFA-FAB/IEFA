/**
 * Regressão happy-path — operations de PERMISSIONS / RBAC (@iefa/sisub-domain).
 * Congela: injeção implícita de "diner", filtro de deny (level 0), CRUD admin, busca por email
 * e o PRAZO das concessões (`expires_at`) nas duas origens — grant inline e anexo de política.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { hasPermission } from "@iefa/pbac"
import {
	attachPolicy,
	createUserPermission,
	deleteUserPermission,
	fetchUserPermissionsAdmin,
	listEffectiveUserPermissions,
	listPolicyMembers,
	listUserPolicies,
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

	test("listEffectiveUserPermissions injeta diner implícito e nega o módulo com deny", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "kitchen", level: 2 })
		await seeder.seedUserPermission({ userId, module: "global", level: 0 }) // deny explícito

		const perms = await listEffectiveUserPermissions(db, { userId })

		expect(hasPermission(perms, "kitchen", 2)).toBe(true)
		expect(hasPermission(perms, "diner", 1)).toBe(true) // injetado (não havia regra diner)
		// O deny permanece no conjunto — é o que permite ao guard negar um allow SEM escopo —,
		// mas com level 0 nunca concede. A asserção é sobre a DECISÃO, não sobre a lista.
		expect(hasPermission(perms, "global", 1)).toBe(false)
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

	// ── Prazo (expires_at) ─────────────────────────────────────────────────────
	//
	// A comparação é do BANCO (`now()`), então estes casos só provam alguma coisa contra o
	// Postgres real: um teste com relógio de JS mockado passaria mesmo se o filtro tivesse
	// sido escrito em TS.

	const past = () => new Date(Date.now() - 60 * 60 * 1000).toISOString()
	const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

	test("grant sem prazo e grant com prazo futuro concedem; grant vencido não", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "kitchen", level: 2 }) // sem prazo
		await seeder.seedUserPermission({ userId, module: "storage", level: 2, expiresAt: future() })
		await seeder.seedUserPermission({ userId, module: "analytics", level: 2, expiresAt: past() })

		const perms = await listEffectiveUserPermissions(db, { userId })

		expect(hasPermission(perms, "kitchen", 2)).toBe(true)
		expect(hasPermission(perms, "storage", 2)).toBe(true)
		expect(hasPermission(perms, "analytics", 1)).toBe(false)
	})

	test("DENY vencido deixa de negar — expirado é ausência, não deny", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		// O deny vem de uma política; o allow, do grant inline. É a única combinação em que a
		// diferença entre "ausente" e "deny" é observável: com uma origem só, a UI edita a
		// mesma linha e as duas leituras coincidiriam.
		const policyId = await seeder.seedPolicy()
		await seeder.seedPolicyStatement({ policyId, module: "kitchen", level: 0 })
		await seeder.seedPolicyAttachment({ userId, policyId, expiresAt: past() })
		await seeder.seedUserPermission({ userId, module: "kitchen", level: 2 })

		const perms = await listEffectiveUserPermissions(db, { userId })

		// Se a expiração virasse deny, isto seria false e a permissão teria sido revogada por
		// uma linha morta.
		expect(hasPermission(perms, "kitchen", 2)).toBe(true)
	})

	test("anexo de política vencido não concede nada", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const policyId = await seeder.seedPolicy()
		await seeder.seedPolicyStatement({ policyId, module: "storage", level: 2 })
		await seeder.seedPolicyAttachment({ userId, policyId, expiresAt: past() })

		expect(hasPermission(await listEffectiveUserPermissions(db, { userId }), "storage", 1)).toBe(false)
	})

	test("o comensal implícito volta quando o deny de diner vence", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "diner", level: 0, expiresAt: past() })

		expect(hasPermission(await listEffectiveUserPermissions(db, { userId }), "diner", 1)).toBe(true)
	})

	test("listagem admin MOSTRA o vencido, marcado — sumir com ele o tornaria inalcançável", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "analytics", level: 2, expiresAt: past() })
		await seeder.seedUserPermission({ userId, module: "storage", level: 2 })

		const rows = await fetchUserPermissionsAdmin(db, ctx, { userId })
		const expired = rows.find((r) => r.module === "analytics")
		const permanent = rows.find((r) => r.module === "storage")

		expect(expired?.expired).toBe(true)
		expect(expired?.expires_at).not.toBeNull()
		expect(permanent?.expired).toBe(false)
		expect(permanent?.expires_at).toBeNull()
	})

	test("update: null LIMPA o prazo, ausente PRESERVA", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		const deadline = future()
		await createUserPermission(db, ctx, { userId, module: "kitchen", level: 1, expiresAt: deadline })

		const [created] = await fetchUserPermissionsAdmin(db, ctx, { userId })
		expect(created.expires_at).not.toBeNull()

		// Sem `expiresAt` no input: só o nível muda, o prazo fica.
		await updateUserPermission(db, ctx, { permissionId: created.id, level: 2 })
		expect((await fetchUserPermissionsAdmin(db, ctx, { userId }))[0].expires_at).toBe(created.expires_at)

		// `null` explícito: a concessão volta a ser permanente.
		await updateUserPermission(db, ctx, { permissionId: created.id, level: 2, expiresAt: null })
		expect((await fetchUserPermissionsAdmin(db, ctx, { userId }))[0].expires_at).toBeNull()
	})

	test("attachPolicy renova o prazo do anexo existente sem perder o anexo", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const policyId = await seeder.seedPolicy()
		await seeder.seedPolicyStatement({ policyId, module: "storage", level: 2 })
		seeder.trackWhere("user_policy_attachment", "policy_id", policyId)
		await seeder.seedPolicyAttachment({ userId, policyId, expiresAt: past() })

		expect(hasPermission(await listEffectiveUserPermissions(db, { userId }), "storage", 2)).toBe(false)

		await attachPolicy(db, ctx, { userId, policyId, expiresAt: future() })

		expect(hasPermission(await listEffectiveUserPermissions(db, { userId }), "storage", 2)).toBe(true)
		const attached = await listUserPolicies(db, ctx, { userId })
		expect(attached).toHaveLength(1)
		expect(attached[0].expired).toBe(false)

		// A turma continua enxergando a pessoa, agora vigente.
		const members = await listPolicyMembers(db, ctx, { policyId })
		expect(members.find((m) => m.user_id === userId)?.expired).toBe(false)
	})

	test("attachPolicy SEM expiresAt não mexe no prazo já gravado", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const policyId = await seeder.seedPolicy()
		seeder.trackWhere("user_policy_attachment", "policy_id", policyId)
		const deadline = future()
		await seeder.seedPolicyAttachment({ userId, policyId, expiresAt: deadline })

		await attachPolicy(db, ctx, { userId, policyId })

		const attached = await listUserPolicies(db, ctx, { userId })
		expect(attached[0].expires_at).not.toBeNull()
		expect(attached[0].expired).toBe(false)
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
