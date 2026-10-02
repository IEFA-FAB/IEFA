import type { User } from "@supabase/supabase-js"
import { afterAll, beforeAll, expect, it } from "vitest"
import { createGrantFixtureWriter, type GrantFixtureWriter } from "./access-fixture-writer"
import { createAnonClient, createServiceClient, describeIntegration, getTestEnv, type TestEnv } from "./supabase"

// Testes de integração do fluxo de auth/PBAC do /controller contra o Supabase de
// PROD (schema assignment_selection). Cobrem as regras de MAIOR impacto:
//  - access_grant não é legível por anon (sem enumeração de e-mails)
//  - access_grant só muda por função auditada (20261001150000): escrita direta é recusada
//  - person é lida por anon (telão público) só da edição ATIVA, e NÃO escrita
//  - resolveAccess() autoriza só concessões ativas, por e-mail
// Todo dado criado usa o prefixo `zzz-test-audit-` e é removido no finally/afterAll. As
// concessões de teste entram pela conexão direta com o bypass de manutenção
// (`access-fixture-writer.ts`): não são concessão a ninguém e não vão para o log de produção.

const TEST_PREFIX = "zzz-test-audit-"
const env = getTestEnv()

type Access = { authorized: boolean; role: string | null }

describeIntegration("assignment_selection · auth/PBAC (prod DB, com cleanup)", () => {
	if (!env) {
		it("env de integração ausente — pulando", () => {
			expect(env).toBeNull()
		})
		return
	}

	const e: TestEnv = env
	const service = createServiceClient(e)
	const anon = createAnonClient(e)
	let grants: GrantFixtureWriter
	// Carregado sob demanda: evita que os unit tests (sem env) importem env.server.
	let resolveAccess: (user: User | null) => Promise<Access>

	const asUser = (email: string) => ({ email }) as unknown as User

	beforeAll(async () => {
		;({ resolveAccess } = await import("@/lib/auth.server"))
		grants = createGrantFixtureWriter(e.databaseUrl)
		// Limpa qualquer resíduo de execuções anteriores.
		await grants.deleteGrantsLike(`${TEST_PREFIX}%`)
	})

	afterAll(async () => {
		await grants.deleteGrantsLike(`${TEST_PREFIX}%`)
		await grants.close()
	})

	// ── Regras de grant/RLS (segurança de maior impacto) ──────────────────────

	it("anon NÃO consegue ler access_grant (sem enumeração de e-mails)", async () => {
		const { data, error } = await anon.from("access_grant").select("email").limit(1)
		expect(error).not.toBeNull()
		expect(data).toBeNull()
	})

	it("service role NÃO escreve access_grant direto (só função auditada)", async () => {
		const { error } = await service.from("access_grant").insert({ email: `${TEST_PREFIX}direct@fab.mil.br`, role: "operator", active: true })
		expect(error?.code).toBe("42501")
		expect(error?.message).toContain("ACCESS_CHANGE_UNAUDITED")
	})

	it("a função auditada desfaz a concessão inteira quando o ator não existe", async () => {
		const email = `${TEST_PREFIX}ghost-actor@fab.mil.br`
		const rpc = service.rpc.bind(service) as unknown as (
			fn: string,
			args: Record<string, unknown>
		) => PromiseLike<{ error: { message: string; code?: string } | null }>
		const { error } = await rpc("grant_controller_access", { p_actor: "00000000-0000-0000-0000-000000000000", p_email: email })
		expect(error?.message).toContain("ACCESS_ACTOR_NOT_FOUND")
		expect(await resolveAccess(asUser(email))).toEqual({ authorized: false, role: null })
	})

	it("anon NÃO executa as funções de concessão", async () => {
		const rpc = anon.rpc.bind(anon) as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>
		const { error } = await rpc("grant_controller_access", { p_actor: "00000000-0000-0000-0000-000000000000", p_email: `${TEST_PREFIX}x@fab.mil.br` })
		expect(error).not.toBeNull()
	})

	it("só nannijpsn@fab.mil.br tem concessão ativa (decisão do mantenedor)", async () => {
		const { data, error } = await service.from("access_grant").select("email").eq("active", true).not("email", "like", `${TEST_PREFIX}%`)
		expect(error).toBeNull()
		expect((data ?? []).map((row) => row.email)).toEqual(["nannijpsn@fab.mil.br"])
	})

	it("anon lê person da edição ativa (telão público)", async () => {
		const { data: active } = await service.from("edition").select("id").eq("active", true).maybeSingle()
		const { data, error } = await anon.from("person").select("id, edition_id").limit(5)
		expect(error).toBeNull()
		if (active) {
			expect((data ?? []).every((row) => row.edition_id === active.id)).toBe(true)
		}
	})

	it("anon NÃO lê person de edição inativa", async () => {
		const { data: inactive } = await service.from("edition").select("id").eq("active", false)
		for (const edition of inactive ?? []) {
			const { data, error } = await anon.from("person").select("id").eq("edition_id", edition.id).limit(1)
			expect(error).toBeNull()
			expect(data ?? []).toHaveLength(0)
		}
	})

	it("anon NÃO consegue escrever em person (writes só service_role)", async () => {
		const { data, error } = await anon.from("person").update({ nome: "SHOULD_NOT_PERSIST" }).eq("id", -1).select("id")
		expect(error).not.toBeNull()
		expect(data ?? []).toHaveLength(0)
	})

	// ── PBAC (resolveAccess) ──────────────────────────────────────────────────

	it("resolveAccess: visitante anônimo (null) → não autorizado", async () => {
		expect(await resolveAccess(null)).toEqual({ authorized: false, role: null })
	})

	it("resolveAccess: usuário sem e-mail → não autorizado", async () => {
		expect(await resolveAccess({} as User)).toEqual({ authorized: false, role: null })
	})

	it("resolveAccess: concessão admin ativa → autorizado como admin", async () => {
		const email = `${TEST_PREFIX}admin@fab.mil.br`
		await grants.insertGrant({ email, role: "admin", active: true })
		try {
			expect(await resolveAccess(asUser(email))).toEqual({ authorized: true, role: "admin" })
		} finally {
			await grants.deleteGrantsLike(email)
		}
	})

	it("resolveAccess: e-mail sem concessão → não autorizado", async () => {
		expect(await resolveAccess(asUser(`${TEST_PREFIX}nao-existe@fab.mil.br`))).toEqual({ authorized: false, role: null })
	})

	it("resolveAccess: concessão inativa (active=false) é ignorada", async () => {
		const email = `${TEST_PREFIX}inactive@fab.mil.br`
		await grants.insertGrant({ email, role: "operator", active: false })
		try {
			expect(await resolveAccess(asUser(email))).toEqual({ authorized: false, role: null })
		} finally {
			await grants.deleteGrantsLike(email)
		}
	})

	it("resolveAccess: ciclo de vida (insert→autoriza, delete→nega)", async () => {
		const email = `${TEST_PREFIX}lifecycle@fab.mil.br`
		await grants.insertGrant({ email, role: "operator", active: true })
		try {
			expect(await resolveAccess(asUser(email))).toEqual({ authorized: true, role: "operator" })
		} finally {
			await grants.deleteGrantsLike(email)
		}
		// Após a remoção, o mesmo e-mail deixa de ser autorizado.
		expect(await resolveAccess(asUser(email))).toEqual({ authorized: false, role: null })
	})
})
