/**
 * Invariantes TEXTUAIS de 20261001100000 (signup_allowlist), 20261001100100 (hook "Before User
 * Created") e 20261001100200 (link_own_saram).
 *
 * O comportamento é provado no Postgres descartável (`scripts/access-audit/run.sh`, arquivo
 * `signup-allowlist.test.sql`): domínio exato, autorização ativa/revogada, recusa de anônimo e
 * de conta sem e-mail, privilégio mínimo do `supabase_auth_admin`, write-once e exclusividade do
 * SARAM. Este é o aviso barato de todo `bun run test` para quem reescrever as funções partindo do
 * corpo antigo e apagar uma trava.
 *
 * Prova texto, não comportamento. Não substitui o `run.sh`.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS = join(import.meta.dir, "..", "supabase", "migrations")
const ALLOWLIST = "20261001100000_signup_allowlist.sql"
const HOOK = "20261001100100_before_user_created_hook.sql"
const SARAM = "20261001100200_link_own_saram.sql"

const read = (file: string) => readFileSync(join(MIGRATIONS, file), "utf8")
/** SQL sem comentários de linha: o que executa. */
const executable = (file: string) => read(file).replace(/--[^\n]*/g, "")

/** Corpo da definição MAIS RECENTE da função, na ordem cronológica das migrations. */
function latestBody(name: string): { file: string; body: string } | null {
	let latest: { file: string; body: string } | null = null
	const head = new RegExp(`create or replace function ${name.replace(".", "\\.")}\\s*\\(`, "i")
	for (const file of readdirSync(MIGRATIONS)
		.filter((f) => f.endsWith(".sql"))
		.sort()) {
		const sql = read(file)
		const at = sql.search(head)
		if (at === -1) continue
		const open = sql.indexOf("$$", at)
		latest = { file, body: sql.slice(at, sql.indexOf("$$", open + 2) + 2) }
	}
	return latest
}

describe("hook access_control.before_user_created", () => {
	const hook = latestBody("access_control.before_user_created")

	test("vive na migration do hook e é a última definição", () => {
		expect(hook?.file).toBe(HOOK)
	})

	test("SECURITY INVOKER, search_path vazio, recebe e devolve jsonb", () => {
		expect(hook?.body).toMatch(/\(event jsonb\)\s*returns jsonb/)
		expect(hook?.body).toContain("security invoker")
		expect(hook?.body).not.toMatch(/security definer/i)
		expect(hook?.body).toContain("set search_path = ''")
	})

	test("domínio exato, sobre o e-mail normalizado", () => {
		expect(hook?.body).toContain("lower(btrim(coalesce(v_user ->> 'email', '')))")
		expect(hook?.body).toContain("v_email ~ '^[^@[:space:]]+@fab\\.mil\\.br$'")
		// `like '%@fab.mil.br'` aceitaria `x@evil.fab.mil.br`; sem âncora, `...br.evil.com`.
		expect(hook?.body).not.toMatch(/like\s+'%@fab/i)
	})

	test("consulta só autorização ATIVA", () => {
		expect(hook?.body).toMatch(/from access_control\.signup_allowlist a\s+where a\.email = v_email and a\.revoked_at is null/)
	})

	test("recusa anônimo e conta sem e-mail ANTES de olhar o domínio", () => {
		const body = hook?.body ?? ""
		const anonymous = body.indexOf("v_user -> 'is_anonymous' = 'true'::jsonb")
		const noEmail = body.indexOf("if v_email = '' then")
		const domain = body.indexOf("v_email ~ '^[^@")
		expect(anonymous).toBeGreaterThan(-1)
		expect(noEmail).toBeGreaterThan(-1)
		expect(anonymous).toBeLessThan(domain)
		expect(noEmail).toBeLessThan(domain)
	})

	test("a recusa é 403 com mensagem, no formato que o GoTrue repassa", () => {
		expect(hook?.body).toMatch(/'error', jsonb_build_object\(\s*'http_code', 403,\s*'message', 'Cadastro restrito a e-mails institucionais @fab\.mil\.br\./)
	})

	test("executável só pelo GoTrue e pela service role", () => {
		const sql = executable(HOOK)
		expect(sql).toContain("revoke all on function access_control.before_user_created(jsonb) from public, anon, authenticated")
		expect(sql).toContain("grant execute on function access_control.before_user_created(jsonb) to supabase_auth_admin, service_role")
		expect(sql).not.toMatch(/grant [^;]*to [^;]*\b(anon|authenticated|public)\b/)
	})
})

describe("access_control.signup_allowlist", () => {
	const sql = executable(ALLOWLIST)

	test("vigiada pelo trigger de recusa", () => {
		expect(sql).toMatch(
			/before insert or update or delete on access_control\.signup_allowlist\s+for each row execute function access_control\.enforce_audited_access_change\(\)/
		)
	})

	test("uma autorização ativa por e-mail, e-mail normalizado no banco", () => {
		expect(sql).toMatch(
			/create unique index if not exists signup_allowlist_active_email_uniq\s+on access_control\.signup_allowlist \(email\) where revoked_at is null/
		)
		expect(sql).toContain("check (email = lower(btrim(email)))")
	})

	test("RLS ligada; o GoTrue lê só e-mail e revogação das ativas", () => {
		expect(sql).toContain("alter table access_control.signup_allowlist enable row level security")
		expect(sql).toContain("grant select (email, revoked_at) on table access_control.signup_allowlist to supabase_auth_admin")
		expect(sql).toMatch(/for select to supabase_auth_admin\s+using \(revoked_at is null\)/)
		// Nada de cliente: o navegador não lê a lista (CLIENT_TABLE_ALLOWLIST do audit:rls).
		expect(sql).not.toMatch(/grant [^;]* on [^;]*signup_allowlist[^;]* to [^;]*\b(anon|authenticated)\b/)
		expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*supabase_auth_admin/)
	})

	test("a prova não some com a conta de quem autorizou", () => {
		expect(sql).toContain("authorized_by uuid references auth.users(id) on delete restrict")
		expect(sql).toContain("revoked_by    uuid references auth.users(id) on delete restrict")
	})

	test.each(["access_control.authorize_external_signup", "access_control.revoke_external_signup"])(
		"%s: contexto antes da escrita, log, ator do argumento",
		(name) => {
			const fn = latestBody(name)
			expect(fn?.file).toBe(ALLOWLIST)
			const body = fn?.body ?? ""
			expect(body).toContain("security invoker")
			expect(body).toContain("set search_path = ''")
			expect(body).toMatch(/\(\s*p_actor\s+uuid,\s*p_operation\s+text,/)
			const context = body.indexOf("perform access_control.audit_context(p_operation)")
			const write = body.search(/(insert into|update) access_control\.signup_allowlist/)
			expect(context).toBeGreaterThan(-1)
			expect(context).toBeLessThan(write)
			expect(body).toContain("access_control.record_access_change(\n\t\tp_actor, p_operation, p_assurance,")
		}
	)

	test("autorizar recusa e-mail que já é institucional, pela mesma regra do hook", () => {
		expect(latestBody("access_control.authorize_external_signup")?.body).toContain("v_email ~ '^[^@[:space:]]+@fab\\.mil\\.br$'")
	})

	test("revogar não apaga a autorização nem a conta: só marca", () => {
		const body = latestBody("access_control.revoke_external_signup")?.body ?? ""
		expect(body).toContain("update access_control.signup_allowlist set revoked_at = now(), revoked_by = p_actor")
		expect(body).not.toMatch(/delete from/i)
		expect(body).not.toMatch(/auth\.users/)
	})

	test("funções executáveis só pela service role", () => {
		for (const signature of ["authorize_external_signup(uuid, text, text, text, text)", "revoke_external_signup(uuid, text, uuid, text)"]) {
			expect(sql).toContain(`revoke all on function access_control.${signature} from public, anon, authenticated`)
			expect(sql).toContain(`grant execute on function access_control.${signature} to service_role`)
		}
	})
})

/**
 * Desde 20261003100000 nem o sisub nem o sucont chamam `core.link_own_saram`: os dois passam por
 * `core.claim_saram` (`saram-link.sql-contract.test.ts`). A função fica até o deploy do sucont
 * (a versão em produção a chama) e sai num PR seguinte; enquanto existir, segue com as travas.
 */
describe("core.link_own_saram (legado do sucont, até o deploy de saram-verified-link)", () => {
	const fn = latestBody("core.link_own_saram")
	const domain = readFileSync(join(import.meta.dir, "..", "..", "sisub-domain", "src", "operations", "user.ts"), "utf8")

	test("mesma chave de advisory lock das funções de vínculo verificado", () => {
		expect(fn?.body).toContain("perform pg_advisory_xact_lock(hashtext('saram:' || v_requested))")
		expect(read("20261003100000_saram_verified_link.sql")).toContain("perform pg_advisory_xact_lock(hashtext('saram:' || v_saram))")
		// o sisub não grava SARAM por conta própria: entrega ao banco
		expect(domain).toContain("claimSaram(db,")
		expect(domain).not.toContain("pg_advisory_xact_lock")
	})

	test("as duas travas", () => {
		for (const token of ["SARAM_LOCKED", "SARAM_TAKEN"]) {
			expect(fn?.body).toContain(`'${token}'`)
		}
		// write-once: só trava quando o SARAM ATUAL localiza cadastro militar
		expect(fn?.body).toContain("exists (select 1 from core.military_identity mi where mi.saram = v_current)")
	})

	test("SECURITY INVOKER, search_path vazio, só a service role executa", () => {
		expect(fn?.file).toBe(SARAM)
		expect(fn?.body).toContain("security invoker")
		expect(fn?.body).toContain("set search_path = ''")
		const sql = executable(SARAM)
		expect(sql).toContain("revoke all on function core.link_own_saram(uuid, text, text) from public, anon, authenticated")
		expect(sql).toContain("grant execute on function core.link_own_saram(uuid, text, text) to service_role")
	})
})
