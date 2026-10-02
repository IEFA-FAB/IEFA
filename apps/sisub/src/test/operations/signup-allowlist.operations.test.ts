/**
 * Integração — autorização de cadastro externo e o hook "Before User Created" no banco REAL.
 *
 * REQUER 20261001100000 (signup_allowlist), 20261001100100 (before_user_created_hook) e
 * 20261001100200 (link_own_saram) APLICADAS no banco compartilhado. Antes disso este arquivo
 * falha — é o teste que o orquestrador roda depois do apply, não um teste para a CI do PR que as
 * declara (o PR registra isso).
 *
 * O que só o banco real prova (o Postgres descartável de `scripts/access-audit/run.sh` prova o
 * resto com um esqueleto):
 *   - a autorização e a linha de `sensitive_operation_log` saem na MESMA transação, com o ator
 *     da sessão, pelas operações de domínio que o console usa;
 *   - o hook, executado como no GoTrue, permite @fab.mil.br e a autorização ativa e recusa o resto;
 *   - a escrita direta na tabela é recusada pelo trigger.
 *
 * Escritas dentro de `inRollback`: o log de produção não guarda teste, e o ator semeado pode ser
 * apagado no cleanup (FK `on delete restrict`).
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { authorizeExternalSignup, listSignupAllowlist, revokeExternalSignup } from "@iefa/sisub-domain"
import { sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

class Rollback extends Error {}

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

async function logRow(tx: SisubDb, logId: string) {
	const rows = (await tx.execute(
		sql`select actor_id, operation, assurance, target from access_control.sensitive_operation_log where id = ${logId}::uuid`
	)) as unknown as Array<{ actor_id: string; operation: string; assurance: string; target: Record<string, unknown> }>
	return rows[0] ?? null
}

async function hook(tx: SisubDb, user: Record<string, unknown>): Promise<Record<string, unknown>> {
	const event = { metadata: { uuid: crypto.randomUUID(), time: new Date().toISOString(), name: "before-user-created", ip_address: "127.0.0.1" }, user }
	const rows = (await tx.execute(sql`select access_control.before_user_created(${JSON.stringify(event)}::jsonb) as result`)) as unknown as Array<{
		result: Record<string, unknown>
	}>
	return rows[0]?.result ?? {}
}

const ALLOWED = {}

describeSupabaseIntegration("signup allowlist + hook do Auth (banco real)", () => {
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
	})

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	})

	afterAll(async () => {
		await closeDb?.()
	})

	test("autorizar → listar → revogar, cada mudança com UMA linha de log na mesma transação", async () => {
		if (!reachable || !seeder || !db) return
		const actorId = await seeder.seedAuthUser()
		const actor = fullAccessCtx(actorId)
		const email = `${uid("parceiro-")}@gs1br.example.invalid`.toLowerCase()

		await inRollback(db, async (tx) => {
			const authorized = await authorizeExternalSignup(tx, actor, { email, reason: "parceria GS1 Brasil — teste de integração" }, undefined, {
				operation: "authorizeExternalSignupFn",
				grade: "fresh",
			})
			expect(authorized.email).toBe(email)
			const grantLog = await logRow(tx, authorized.log_id)
			expect(grantLog).toMatchObject({ actor_id: actorId, operation: "authorizeExternalSignupFn", assurance: "fresh" })
			expect(grantLog?.target).toMatchObject({ action: "grant", email })

			const listed = await listSignupAllowlist(tx, actor)
			const row = listed.find((entry) => entry.id === authorized.id)
			expect(row).toMatchObject({ email, revoked_at: null, has_account: false })

			// o hook enxerga a autorização ativa
			expect(await hook(tx, { email: email.toUpperCase(), is_anonymous: false })).toEqual(ALLOWED)

			const revoked = await revokeExternalSignup(tx, actor, { id: authorized.id }, undefined, { operation: "revokeExternalSignupFn", grade: "fresh" })
			expect(revoked.changed).toBe(true)
			const revokeLog = await logRow(tx, revoked.log_id as string)
			expect(revokeLog).toMatchObject({ actor_id: actorId, operation: "revokeExternalSignupFn" })

			// revogada: o hook volta a recusar
			const refusal = await hook(tx, { email })
			expect((refusal.error as { http_code: number }).http_code).toBe(403)

			// revogar de novo não é fato
			expect(await revokeExternalSignup(tx, actor, { id: authorized.id })).toEqual({ log_id: null, changed: false })
		})
	})

	test("e-mail institucional não é autorizável, e a autorização ativa é única", async () => {
		if (!reachable || !seeder || !db) return
		const actor = fullAccessCtx(await seeder.seedAuthUser())
		const email = `${uid("dup-")}@parceiro.example.invalid`.toLowerCase()

		// Cada recusa na sua transação: erro de SQL aborta a transação inteira.
		await inRollback(db, async (tx) => {
			await expect(authorizeExternalSignup(tx, actor, { email: "fulano@fab.mil.br", reason: "não deveria precisar" })).rejects.toMatchObject({
				code: "SIGNUP_INSTITUTIONAL_EMAIL",
			})
		})
		await inRollback(db, async (tx) => {
			await authorizeExternalSignup(tx, actor, { email, reason: "primeira autorização" })
			await expect(authorizeExternalSignup(tx, actor, { email, reason: "segunda autorização" })).rejects.toMatchObject({ code: "CONFLICT" })
		})
	})

	test("o hook decide pelo domínio exato e recusa anônimo e conta sem e-mail", async () => {
		if (!reachable || !db) return
		const tx = db
		expect(await hook(tx, { email: "Fulano@FAB.mil.br" })).toEqual(ALLOWED)
		for (const user of [
			{ email: "x@fab.mil.br.evil.com" },
			{ email: "x@evil.fab.mil.br" },
			{ email: "fulano@gmail.com" },
			{ email: "fulano@fab.mil.br", is_anonymous: true },
			{ phone: "5561999999999" },
		]) {
			const result = await hook(tx, user)
			expect(result.error, JSON.stringify(user)).toMatchObject({ http_code: 403 })
		}
	})

	test("escrita direta na tabela é recusada pelo trigger", async () => {
		if (!reachable || !db) return
		const error = await inRollback(db, async (tx) => {
			await tx.execute(sql`insert into access_control.signup_allowlist (email, reason) values ('direto@x.example.invalid', 'sem função auditada')`)
		}).catch((e: unknown) => e)
		// O drizzle embrulha o erro; o do Postgres fica em `.cause`.
		const cause = (error as { cause?: { message?: string } } | undefined)?.cause
		expect(cause?.message ?? String(error)).toContain("ACCESS_CHANGE_UNAUDITED")
	})

	test("o GoTrue (supabase_auth_admin) executa o hook e lê só o necessário", async () => {
		if (!reachable || !db) return
		const rows = (await db.execute(sql`
			select
				has_function_privilege('supabase_auth_admin', 'access_control.before_user_created(jsonb)', 'execute') as hook_exec,
				has_function_privilege('anon', 'access_control.before_user_created(jsonb)', 'execute') as anon_exec,
				has_function_privilege('authenticated', 'access_control.authorize_external_signup(uuid, text, text, text, text)', 'execute') as client_authorize,
				has_column_privilege('supabase_auth_admin', 'access_control.signup_allowlist', 'email', 'select') as auth_email,
				has_column_privilege('supabase_auth_admin', 'access_control.signup_allowlist', 'reason', 'select') as auth_reason,
				has_function_privilege('service_role', 'core.link_own_saram(uuid, text, text)', 'execute') as saram_service,
				has_function_privilege('authenticated', 'core.link_own_saram(uuid, text, text)', 'execute') as saram_client
		`)) as unknown as Array<Record<string, boolean>>
		expect(rows[0]).toEqual({
			hook_exec: true,
			anon_exec: false,
			client_authorize: false,
			auth_email: true,
			auth_reason: false,
			saram_service: true,
			saram_client: false,
		})
	})
})
