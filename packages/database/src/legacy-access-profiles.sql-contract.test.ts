/**
 * Invariantes TEXTUAIS de 20260926218000 (legacy_access_profiles).
 *
 * O comportamento é provado no Postgres descartável (`scripts/access-audit/run.sh`, arquivo
 * `legacy-access-profiles.test.sql`): tabela arquivada sem acesso de cliente, cadastro sem
 * perfil, perfil nascendo pela função auditada, painel com submissão de quem não tem perfil.
 * Este teste é o aviso barato de todo `bun run test` para quem reescrever o arquivo ou recriar,
 * depois, o que ele desfez.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS = join(import.meta.dir, "..", "supabase", "migrations")
const FILE = "20260926218000_legacy_access_profiles.sql"
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8")

/** SQL sem comentários de linha, em minúsculas: o que executa. */
const executable = sql.replace(/--[^\n]*/g, "").toLowerCase()

/** Migrations em ordem cronológica, a partir desta (inclusive). */
const fromThisOn = readdirSync(MIGRATIONS)
	.filter((name) => name.endsWith(".sql") && name >= FILE)
	.sort()
	.map((name) => ({
		name,
		sql: readFileSync(join(MIGRATIONS, name), "utf8")
			.replace(/--[^\n]*/g, "")
			.toLowerCase(),
	}))

describe("profiles_admin arquivada", () => {
	test("sai de access_control para legacy_access, com o enum", () => {
		expect(executable).toContain("alter table access_control.profiles_admin set schema legacy_access")
		expect(executable).toContain('alter type public."userlevels" set schema legacy_access')
	})

	test("sem acesso de cliente nem da service role: schema e tabela", () => {
		expect(executable).toContain("revoke all on schema legacy_access from public, anon, authenticated, service_role")
		expect(executable).toContain("revoke all on table legacy_access.profiles_admin from public, anon, authenticated, service_role")
		// Expor o schema no PostgREST desfaria o arquivamento.
		expect(executable).not.toMatch(/alter role [^;]*pgrst\.db_schemas/)
		expect(executable).not.toMatch(/grant [^;]* on [^;]*legacy_access/)
	})

	test("tabela e enum opcionais do começo ao fim: todo passo sobre eles só age se existirem", () => {
		const block = executable.slice(executable.indexOf("if to_regclass('access_control.profiles_admin') is not null then"))
		const end = block.indexOf("end $$")
		for (const step of [
			"alter table access_control.profiles_admin set schema legacy_access",
			'alter type public."userlevels" set schema legacy_access',
			"revoke all on table legacy_access.profiles_admin",
			"comment on table legacy_access.profiles_admin",
			'comment on type legacy_access."userlevels"',
		]) {
			const at = block.indexOf(step)
			expect(at, step).toBeGreaterThan(-1)
			expect(at, step).toBeLessThan(end)
		}
		expect(executable).not.toContain("if exists access_control.profiles_admin")
	})

	test("o comentário diz desde quando pode ser apagada", () => {
		expect(sql).toMatch(/comment on table legacy_access\.profiles_admin is\s+'ARQUIVADA em 2026-09-26[^']*DROP[^']*2026-12-26/)
	})

	test("para, em vez de arquivar, se algo voltou a depender da tabela", () => {
		expect(sql).toContain("PROFILES_ADMIN_STILL_REFERENCED")
		for (const catalog of ["pg_proc", "pg_views", "pg_matviews", "pg_policies", "pg_constraint"]) expect(executable).toContain(catalog)
	})
})

describe("perfil do journal sob demanda", () => {
	test("nenhuma migration daqui em diante volta a criar perfil no cadastro do Auth", () => {
		for (const { name, sql: body } of fromThisOn) {
			const head = body.search(/create or replace function public\.handle_new_user\s*\(/)
			if (head === -1) continue
			const open = body.indexOf("$$", head)
			const fn = body.slice(head, body.indexOf("$$", open + 2))
			expect(fn, name).not.toMatch(/insert\s+into\s+journal\.user_profiles/)
		}
		expect(executable).not.toMatch(/insert\s+into\s+journal\.user_profiles/)
	})

	test("a função vira no-op antes da tentativa de remover o trigger", () => {
		const noop = executable.indexOf("create or replace function public.handle_new_user()")
		const drop = executable.indexOf("drop trigger if exists on_auth_user_created on auth.users")
		expect(noop).toBeGreaterThan(-1)
		expect(drop).toBeGreaterThan(noop)
		// Sem ser dono de auth.users, a remoção falha com 42501; o no-op já vale.
		expect(executable).toContain("when insufficient_privilege then")
	})

	test("não apaga os perfis existentes (exclusão de dado pessoal é decisão do mantenedor)", () => {
		expect(executable).not.toMatch(/delete\s+from\s+journal\./)
		expect(executable).not.toMatch(/truncate/)
	})

	test("o painel editorial não esconde submissão de quem não tem perfil", () => {
		const view = executable.slice(executable.indexOf("create or replace view journal.editorial_dashboard"))
		expect(view).toContain("with (security_invoker = on)")
		expect(view).toContain("left join journal.user_profiles up on up.id = a.submitter_id")
		// `create or replace view` só acrescenta coluna no fim: as de antes na mesma ordem, e
		// `title_pt` (que o painel mostra e ordena) por último.
		expect(view).toMatch(/as pending_reviews,\s*a\.title_pt\s*from journal\.articles a/)
	})
})

describe("regras gerais de migration", () => {
	test("não escreve linha em tabela nenhuma: sem bypass de auditoria", () => {
		expect(executable).not.toMatch(/\b(insert\s+into|update\s+[a-z_]+\.[a-z_]+\s+set|delete\s+from)\b/)
		// Sem `set_config` nenhum: nem bypass de auditoria nem contexto de operação.
		expect(executable).not.toContain("set_config(")
	})

	test("toda função criada fixa search_path vazio", () => {
		const heads = [...executable.matchAll(/create or replace function [^(]+\(/g)]
		expect(heads.length).toBeGreaterThan(0)
		for (const head of heads) {
			const body = executable.slice(head.index ?? 0, executable.indexOf("$$", head.index ?? 0))
			expect(body).toContain("set search_path = ''")
		}
	})
})
