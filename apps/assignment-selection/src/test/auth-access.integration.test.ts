import type { User } from "@supabase/supabase-js"
import { afterAll, beforeAll, expect, it } from "vitest"
import { createAnonClient, createServiceClient, describeIntegration, getTestEnv, type TestEnv } from "./supabase"

// Testes de integração do fluxo de auth/PBAC do /controller contra o Supabase de
// PROD (schema assignment_selection). Cobrem as regras de MAIOR impacto:
//  - access_grant não é legível por anon (sem enumeração de e-mails)
//  - person é lida por anon (telão público) mas NÃO escrita (writes só service_role)
//  - resolveAccess() autoriza só concessões ativas, por e-mail
// Todo dado criado usa o prefixo `zzz-test-audit-` e é removido no finally/afterAll.
// O suite é self-contained: não depende de nenhuma conta/concessão real de prod
// (que poderia mudar por motivo operacional) — cria e limpa seus próprios grants.

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
	// Carregado sob demanda: evita que os unit tests (sem env) importem env.server.
	let resolveAccess: (user: User | null) => Promise<Access>

	const asUser = (email: string) => ({ email }) as unknown as User

	beforeAll(async () => {
		;({ resolveAccess } = await import("@/lib/auth.server"))
		// Limpa qualquer resíduo de execuções anteriores.
		await service.from("access_grant").delete().like("email", `${TEST_PREFIX}%`)
	})

	afterAll(async () => {
		await service.from("access_grant").delete().like("email", `${TEST_PREFIX}%`)
	})

	// ── Regras de grant/RLS (segurança de maior impacto) ──────────────────────

	it("anon NÃO consegue ler access_grant (sem enumeração de e-mails)", async () => {
		const { data, error } = await anon.from("access_grant").select("email").limit(1)
		expect(error).not.toBeNull()
		expect(data).toBeNull()
	})

	it("anon consegue ler person (telão público)", async () => {
		const { error } = await anon.from("person").select("id").limit(1)
		expect(error).toBeNull()
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
		await service.from("access_grant").insert({ email, role: "admin", active: true })
		try {
			expect(await resolveAccess(asUser(email))).toEqual({ authorized: true, role: "admin" })
		} finally {
			await service.from("access_grant").delete().eq("email", email)
		}
	})

	it("resolveAccess: e-mail sem concessão → não autorizado", async () => {
		expect(await resolveAccess(asUser(`${TEST_PREFIX}nao-existe@fab.mil.br`))).toEqual({ authorized: false, role: null })
	})

	it("resolveAccess: concessão inativa (active=false) é ignorada", async () => {
		const email = `${TEST_PREFIX}inactive@fab.mil.br`
		await service.from("access_grant").insert({ email, role: "operator", active: false })
		try {
			expect(await resolveAccess(asUser(email))).toEqual({ authorized: false, role: null })
		} finally {
			await service.from("access_grant").delete().eq("email", email)
		}
	})

	it("resolveAccess: ciclo de vida (insert→autoriza, delete→nega)", async () => {
		const email = `${TEST_PREFIX}lifecycle@fab.mil.br`
		await service.from("access_grant").insert({ email, role: "operator", active: true })
		try {
			expect(await resolveAccess(asUser(email))).toEqual({ authorized: true, role: "operator" })
		} finally {
			await service.from("access_grant").delete().eq("email", email)
		}
		// Após a remoção, o mesmo e-mail deixa de ser autorizado.
		expect(await resolveAccess(asUser(email))).toEqual({ authorized: false, role: null })
	})
})
