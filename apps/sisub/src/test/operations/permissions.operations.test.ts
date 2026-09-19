/**
 * Regressão happy-path — operations de PERMISSIONS / RBAC (@iefa/sisub-domain).
 * Congela: injeção implícita de "diner", filtro de deny (level 0), CRUD admin, busca por email
 * e o PRAZO das concessões (`expires_at`).
 *
 * O prazo só tem teste de verdade aqui: a comparação é `now()` do Postgres, e nenhum teste
 * unitário consegue provar que a linha vencida some — só que o SQL a pede.
 *
 * ## Escritas de acesso: dentro de uma transação desfeita
 *
 * Desde 20260921120000 conceder/alterar/revogar grava a linha de
 * `access_control.sensitive_operation_log` na MESMA transação, com o ator da sessão — e o ator
 * tem de existir em `auth.users` (FK `on delete restrict`). Os testes que exercitam essas
 * operações rodam com um ator semeado e DENTRO de `inRollback`: a mudança e o log são desfeitos
 * juntos (o log de produção não guarda teste), e o ator pode ser apagado no cleanup. É também o
 * que permite provar, no banco real, que o log saiu na mesma transação da mudança.
 *
 * REQUER a fase 1 (20260921120000) aplicada no banco compartilhado.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { hasPermission } from "@iefa/pbac"
import {
	attachPolicy,
	createUserPermission,
	deleteUserPermission,
	fetchUserPermissionsAdmin,
	listEffectiveUserPermissions,
	listEffectiveUserPermissionsWithOrigin,
	listPolicyMembers,
	listUserPolicies,
	searchUsersByEmail,
	updateUserPermission,
} from "@iefa/sisub-domain"
import { sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

/** Sentinela do rollback: a transação termina SEMPRE desfeita. */
class Rollback extends Error {}

/**
 * Roda `fn` numa transação que é sempre desfeita. As operações de domínio recebem o `tx` como
 * handle — e enxergam o que escreveram, inclusive a linha de log.
 */
async function inRollback(db: SisubDb, fn: (tx: SisubDb) => Promise<void>): Promise<void> {
	try {
		await db.transaction(async (tx) => {
			await fn(tx as unknown as SisubDb)
			throw new Rollback()
		})
	} catch (e) {
		if (!(e instanceof Rollback)) throw e
	}
}

/** A linha de log gravada pela função auditada, lida na MESMA transação. */
async function logRow(tx: SisubDb, logId: string) {
	const rows = (await tx.execute(
		sql`select actor_id, operation, assurance, target from access_control.sensitive_operation_log where id = ${logId}::uuid`
	)) as unknown as Array<{ actor_id: string; operation: string; assurance: string; target: Record<string, unknown> }>
	return rows[0] ?? null
}

/** Instantes de referência do prazo — distantes o bastante para não correrem com a suíte. */
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

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

	test("CRUD admin: create → fetch (ordenado por module) → update → delete — cada passo com UMA linha de log na mesma transação", async () => {
		if (!reachable || !seeder || !db) return
		const actorId = await seeder.seedAuthUser()
		const userId = await seeder.seedAuthUser()
		const actor = fullAccessCtx(actorId)

		await inRollback(db, async (tx) => {
			const created = await createUserPermission(tx, actor, { userId, module: "kitchen", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null })
			expect(created.success).toBe(true)
			const createdLog = await logRow(tx, created.log_id)
			expect(createdLog).toMatchObject({ actor_id: actorId, operation: "createUserPermission", assurance: "session" })
			expect(createdLog?.target).toMatchObject({ target_user_id: userId, module: "kitchen", level: 1, action: "grant" })

			const rows = await fetchUserPermissionsAdmin(tx, actor, { userId })
			expect(rows).toHaveLength(1)
			const permId = rows[0].id
			expect(rows[0].module).toBe("kitchen")
			expect(rows[0].level).toBe(1)

			const updated = await updateUserPermission(tx, actor, { permissionId: permId, level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null })
			const afterUpdate = await fetchUserPermissionsAdmin(tx, actor, { userId })
			expect(afterUpdate[0].level).toBe(2)
			expect((await logRow(tx, updated.log_id))?.target).toMatchObject({ level: 2, previous: { level: 1 } })

			const deleted = await deleteUserPermission(tx, actor, { permissionId: permId })
			const afterDelete = await fetchUserPermissionsAdmin(tx, actor, { userId })
			expect(afterDelete).toHaveLength(0)
			expect(deleted.removed).toMatchObject({ userId, module: "kitchen", level: 2 })
			expect((await logRow(tx, deleted.log_id))?.target).toMatchObject({ target_user_id: userId, action: "revoke", previous: { level: 2 } })
		})
	})

	test("ator que não existe em auth.users: a concessão NÃO acontece (log e grant são uma transação só)", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)

		// `fullAccessCtx()` usa um id que não é conta nenhuma: a linha de log recusa a FK, e o
		// grant, gravado ANTES dela na mesma função, vai junto.
		await expect(createUserPermission(db, ctx, { userId, module: "storage", level: 1 })).rejects.toMatchObject({ code: "ACTOR_NOT_FOUND" })
		expect(await fetchUserPermissionsAdmin(db, ctx, { userId })).toHaveLength(0)
	})

	test("escrita direta em user_permissions é recusada — só vale depois da fase 2 (20260921120100)", async () => {
		if (!reachable || !seeder || !db) return
		const [{ enforced }] = (await db.execute(
			sql`select exists (select 1 from pg_trigger where tgname = 'enforce_audited_change' and tgrelid = 'access_control.user_permissions'::regclass) as enforced`
		)) as unknown as Array<{ enforced: boolean }>
		// Antes da fase 2 não há o que provar — e o teste NÃO pode reprovar a main por isso
		// (declara → aplica → mergeia). Depois dela, é a garantia de "isso deve ocorrer".
		if (!enforced) return
		const userId = await seeder.seedAuthUser()
		await inRollback(db, async (tx) => {
			await expect(
				tx.execute(sql`insert into access_control.user_permissions (user_id, module, level) values (${userId}::uuid, 'kitchen', 1)`)
			).rejects.toMatchObject({
				cause: { code: "42501" },
			})
		})
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

	// ── Prazo de validade (expires_at) ────────────────────────────────────────

	test("grant sem prazo e grant com prazo no FUTURO valem; o vencido some", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "kitchen", level: 2 }) // sem prazo
		await seeder.seedUserPermission({ userId, module: "unit", level: 2, expiresAt: FUTURE })
		await seeder.seedUserPermission({ userId, module: "storage", level: 2, expiresAt: PAST })

		const perms = await listEffectiveUserPermissions(db, { userId })

		expect(hasPermission(perms, "kitchen", 2)).toBe(true)
		expect(hasPermission(perms, "unit", 2)).toBe(true)
		// Vencido é AUSENTE: não aparece nem como allow nem como deny.
		expect(hasPermission(perms, "storage", 1)).toBe(false)
		expect(perms.some((p) => p.module === "storage")).toBe(false)
	})

	test("deny EXPIRADO deixa de negar — expirar é sumir, não bloquear", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		// Deny vencido sobre um allow vivo: se a expiração virasse deny, o allow morreria junto.
		await seeder.seedUserPermission({ userId, module: "global", level: 0, expiresAt: PAST })
		await seeder.seedUserPermission({ userId, module: "global", level: 2 })
		// Deny vencido de `diner`: o comensal implícito tem que voltar.
		await seeder.seedUserPermission({ userId, module: "diner", level: 0, expiresAt: PAST })

		const perms = await listEffectiveUserPermissions(db, { userId })

		expect(hasPermission(perms, "global", 2)).toBe(true)
		expect(hasPermission(perms, "diner", 1)).toBe(true)
	})

	test("deny VIGENTE continua negando (a expiração não afrouxou a precedência)", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "global", level: 0, expiresAt: FUTURE })
		await seeder.seedUserPermission({ userId, module: "global", level: 2 })

		const perms = await listEffectiveUserPermissions(db, { userId })

		expect(hasPermission(perms, "global", 1)).toBe(false)
	})

	test("anexo de política EXPIRADO não contribui statement nenhum", async () => {
		if (!reachable || !seeder || !db) return
		const liveUser = await seeder.seedAuthUser()
		const expiredUser = await seeder.seedAuthUser()
		const policyId = await seeder.seedPolicy()
		await seeder.seedPolicyStatement({ policyId, module: "analytics", level: 2 })
		seeder.trackWhere("user_policy_attachment", "policy_id", policyId)
		await seeder.seedPolicyAttachment({ userId: liveUser, policyId, expiresAt: FUTURE })
		await seeder.seedPolicyAttachment({ userId: expiredUser, policyId, expiresAt: PAST })

		const live = await listEffectiveUserPermissions(db, { userId: liveUser })
		const expired = await listEffectiveUserPermissions(db, { userId: expiredUser })

		expect(hasPermission(live, "analytics", 2)).toBe(true)
		expect(hasPermission(expired, "analytics", 1)).toBe(false)
	})

	test("o caminho COM ORIGEM enxerga o mesmo conjunto que a resolução canônica", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		const policyId = await seeder.seedPolicy()
		await seeder.seedPolicyStatement({ policyId, module: "analytics", level: 2 })
		seeder.trackWhere("user_policy_attachment", "policy_id", policyId)
		await seeder.seedPolicyAttachment({ userId, policyId, expiresAt: PAST })
		await seeder.seedUserPermission({ userId, module: "storage", level: 2, expiresAt: PAST })
		await seeder.seedUserPermission({ userId, module: "kitchen", level: 2 })

		const rows = await listEffectiveUserPermissionsWithOrigin(db, ctx, { userId })

		// O console não pode anunciar acesso que o guard já não concede.
		expect(rows.some((r) => r.module === "kitchen")).toBe(true)
		expect(rows.some((r) => r.module === "storage")).toBe(false)
		expect(rows.some((r) => r.module === "analytics")).toBe(false)
	})

	test("a tela de edição CONTINUA mostrando o grant vencido, marcado como expirado", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.trackWhere("user_permissions", "user_id", userId)
		await seeder.seedUserPermission({ userId, module: "storage", level: 2, expiresAt: PAST })
		await seeder.seedUserPermission({ userId, module: "kitchen", level: 2, expiresAt: FUTURE })
		await seeder.seedUserPermission({ userId, module: "global", level: 1 })

		const rows = await fetchUserPermissionsAdmin(db, ctx, { userId })
		const byModule = new Map(rows.map((r) => [r.module, r]))

		// Esconder o vencido o tornaria invisível E inalcançável: nem renovar, nem apagar.
		expect(rows).toHaveLength(3)
		expect(byModule.get("storage")?.expired).toBe(true)
		expect(byModule.get("kitchen")?.expired).toBe(false)
		expect(byModule.get("kitchen")?.expires_at).not.toBeNull()
		// Sem prazo é `false`, nunca NULL — senão a coluna viria vazia justo para o permanente.
		expect(byModule.get("global")?.expired).toBe(false)
		expect(byModule.get("global")?.expires_at).toBeNull()
	})

	test("createUserPermission grava o prazo; updateUserPermission só o toca quando é enviado", async () => {
		if (!reachable || !seeder || !db) return
		const actor = fullAccessCtx(await seeder.seedAuthUser())
		const userId = await seeder.seedAuthUser()

		await inRollback(db, async (tx) => {
			await createUserPermission(tx, actor, { userId, module: "kitchen", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null, expires_at: FUTURE })
			const [created] = await fetchUserPermissionsAdmin(tx, actor, { userId })
			expect(created.expires_at).not.toBeNull()
			expect(created.expired).toBe(false)

			// Sem `expires_at` no payload o prazo NÃO pode sumir — é o cliente antigo, que não
			// conhece o campo, editando o nível.
			await updateUserPermission(tx, actor, { permissionId: created.id, level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null })
			const [untouched] = await fetchUserPermissionsAdmin(tx, actor, { userId })
			expect(untouched.level).toBe(2)
			expect(untouched.expires_at).toBe(created.expires_at)

			// `null` explícito LIMPA o prazo: é a diferença entre ausente e nulo.
			await updateUserPermission(tx, actor, { permissionId: created.id, level: 2, mess_hall_id: null, kitchen_id: null, unit_id: null, expires_at: null })
			const [cleared] = await fetchUserPermissionsAdmin(tx, actor, { userId })
			expect(cleared.expires_at).toBeNull()
		})
	})

	test("attachPolicy é upsert: reanexar REESCREVE o prazo em vez de virar no-op — e o log distingue anexo de renovação", async () => {
		if (!reachable || !seeder || !db) return
		const actor = fullAccessCtx(await seeder.seedAuthUser())
		const userId = await seeder.seedAuthUser()
		const policyId = await seeder.seedPolicy()
		await seeder.seedPolicyStatement({ policyId, module: "analytics", level: 2 })
		seeder.trackWhere("user_policy_attachment", "policy_id", policyId)

		await inRollback(db, async (tx) => {
			const first = await attachPolicy(tx, actor, { userId, policyId, expires_at: PAST })
			expect(first.change).toBe("attach")
			expect(hasPermission(await listEffectiveUserPermissions(tx, { userId }), "analytics", 2)).toBe(false)

			// Renovar sem poder desanexar/reanexar perderia `created_at`/`created_by`.
			const renewed = await attachPolicy(tx, actor, { userId, policyId, expires_at: FUTURE })
			expect(renewed.change).toBe("expiry")
			expect((await logRow(tx, renewed.log_id))?.target).toMatchObject({ change: "expiry", policy_id: policyId })
			expect(hasPermission(await listEffectiveUserPermissions(tx, { userId }), "analytics", 2)).toBe(true)

			// Reanexar sem prazo torna permanente.
			await attachPolicy(tx, actor, { userId, policyId })
			const attached = await listUserPolicies(tx, actor, { userId })
			expect(attached.find((p) => p.id === policyId)?.expires_at).toBeNull()
		})
	})

	test("listPolicyMembers filtra o anexo vencido por padrão e o devolve marcado com includeExpired", async () => {
		if (!reachable || !seeder || !db) return
		const liveUser = await seeder.seedAuthUser()
		const expiredUser = await seeder.seedAuthUser()
		const policyId = await seeder.seedPolicy()
		seeder.trackWhere("user_policy_attachment", "policy_id", policyId)
		await seeder.seedPolicyAttachment({ userId: liveUser, policyId })
		await seeder.seedPolicyAttachment({ userId: expiredUser, policyId, expiresAt: PAST })

		const current = await listPolicyMembers(db, ctx, { policyId })
		expect(current.map((m) => m.user_id)).toEqual([liveUser])

		// O console precisa da linha vencida para poder removê-la ou renová-la.
		const all = await listPolicyMembers(db, ctx, { policyId, includeExpired: true })
		expect(all.map((m) => m.user_id).sort()).toEqual([liveUser, expiredUser].sort())
		expect(all.find((m) => m.user_id === expiredUser)?.expired).toBe(true)
		expect(all.find((m) => m.user_id === liveUser)?.expired).toBe(false)
	})
})
