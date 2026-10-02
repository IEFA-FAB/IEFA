/**
 * Invariantes TEXTUAIS das migrations de auditoria de acesso (20260921130000 e 20260921130100).
 *
 * O comportamento é provado num Postgres descartável (`scripts/access-audit/run.sh`: mudança +
 * log na mesma transação, rollback quando o log falha, trigger recusando escrita direta,
 * cascata e bypass passando, corrida entre dois administradores). Este teste é o aviso barato
 * que roda em todo `bun run test`: quem reescreve uma função com `create or replace` tende a
 * partir do corpo antigo e apagar a linha que abre o contexto ou grava o log — e a regressão
 * só apareceria depois da fase 2, como escrita recusada em produção.
 *
 * Prova texto, não comportamento. Não substitui o `run.sh`.
 */

import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const MIGRATIONS = join(import.meta.dir, "..", "supabase", "migrations")
const PHASE_1 = "20260921130000_access_change_audited_functions.sql"
const PHASE_2 = "20260921130100_access_change_enforcement.sql"

/**
 * As tabelas vigiadas — e em que só função auditada escreve. A fase 2 ligou o trigger nas nove
 * primeiras; tabela de acesso que nasce depois liga o dela na própria migration
 * (`signup_allowlist`, 20261001100000).
 */
const ACCESS_TABLES = [
	"access_control.user_permissions",
	"access_control.policy",
	"access_control.policy_statement",
	"access_control.user_policy_attachment",
	"access_control.mcp_api_keys",
	"forms.response_viewer",
	"forms.response_viewer_scope_binding",
	"forms.questionnaire_editor",
	"journal.user_profiles",
	"access_control.signup_allowlist",
] as const

/** Corpo da definição MAIS RECENTE de cada função, na ordem cronológica das migrations. */
function latestFunctionBodies(): Map<string, { file: string; body: string }> {
	const files = readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith(".sql"))
		.sort()
	const bodies = new Map<string, { file: string; body: string }>()
	const head = /create or replace function ([a-z_]+\.[a-z_]+)\s*\(/gi
	for (const file of files) {
		const sql = readFileSync(join(MIGRATIONS, file), "utf8")
		for (const match of sql.matchAll(head)) {
			const start = match.index ?? 0
			// O corpo vai até o fim do bloco dollar-quoted que começa depois do cabeçalho.
			const open = sql.indexOf("$$", start)
			const close = sql.indexOf("$$", open + 2)
			bodies.set(match[1].toLowerCase(), { file, body: sql.slice(start, close + 2) })
		}
	}
	return bodies
}

/** Escreve em tabela de acesso? (insert/update/delete explícitos no corpo). */
function writesAccessTable(body: string): boolean {
	return ACCESS_TABLES.some((table) => new RegExp(`(insert\\s+into|update|delete\\s+from)\\s+${table.replace(".", "\\.")}\\b`, "i").test(body))
}

const bodies = latestFunctionBodies()

/**
 * Funções que escrevem em tabela de acesso SEM abrir contexto — cada uma com o motivo. Entrada
 * nova aqui é decisão de revisão, não atalho: a fase 2 recusaria a escrita dela em produção.
 */
const EXEMPT: Record<string, string> = {
	// Interna: só roda dentro das funções de visualizador, que já abriram o contexto e gravam o log.
	"forms.replace_viewer_bindings": "chamada só por forms.add_response_viewer/update_response_viewer_policy",
	// Escreve só colunas de perfil (whitelist; `role` recusado em p_fields) e nasce `author`; a
	// troca de papel é delegada a journal.change_user_role, que abre o contexto e grava o log.
	"journal.save_user_profile": "só campos de perfil; o papel vai por journal.change_user_role",
}

describe("fase 1 — toda função que escreve em tabela de acesso é auditada", () => {
	const writers = [...bodies.entries()].filter(([name, { body }]) => writesAccessTable(body) && !(name in EXEMPT))

	test("o scanner acha as funções (proteção contra teste vazio)", () => {
		expect(writers.length).toBeGreaterThanOrEqual(20)
	})

	test.each(writers.map(([name, info]) => [name, info] as const))("%s abre o contexto e grava o log", (_name, { body }) => {
		expect(body).toMatch(/perform access_control\.audit_context\(/)
		// O log: pelo gravador comum, ou (change_module_permission, anterior a ele) direto.
		expect(body).toMatch(/access_control\.record_access_change\(|insert into access_control\.sensitive_operation_log/)
		// Ninguém rebaixa o contexto a SECURITY DEFINER: quem executa é a service role, e o
		// privilégio do dono (postgres) atravessaria RLS e grants.
		expect(body).toMatch(/security invoker/)
		expect(body).toMatch(/set search_path = ''/)
	})

	test("o contexto é aberto ANTES da primeira escrita", () => {
		const late: string[] = []
		for (const [name, { body }] of writers) {
			const context = body.search(/perform access_control\.audit_context\(/)
			const write = body.search(/(insert\s+into|update|delete\s+from)\s+(access_control|forms|journal)\.(?!sensitive_operation_log)/i)
			if (context === -1 || context > write) late.push(name)
		}
		expect(late).toEqual([])
	})

	test("PUBLIC, anon e authenticated perdem o EXECUTE; só a service role o ganha", () => {
		const sql = readFileSync(join(MIGRATIONS, PHASE_1), "utf8")
		// `revoke … from anon, authenticated` sozinho NÃO tira o que vem de PUBLIC.
		expect(sql).toContain("revoke all on function %s from public, anon, authenticated")
		expect(sql).toContain("grant execute on function %s to service_role")
	})
})

describe("fase 2 — os triggers cobrem todas as tabelas de acesso", () => {
	const sql = readFileSync(join(MIGRATIONS, PHASE_2), "utf8")
	/** Todas as migrations da fase 2 em diante: tabela vigiada nova traz o trigger junto. */
	const fromPhase2On = readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith(".sql") && name >= PHASE_2)
		.sort()
		.map((name) => readFileSync(join(MIGRATIONS, name), "utf8"))
		.join("\n")

	test.each([...ACCESS_TABLES])("%s tem o trigger de recusa", (table) => {
		expect(fromPhase2On).toMatch(
			new RegExp(`on ${table.replace(".", "\\.")}\\s+for each row[\\s\\S]*?execute function access_control\\.enforce_audited_access_change\\(\\)`)
		)
	})

	test("a recusa aceita só contexto, bypass explícito ou cascata", () => {
		const body = sql.slice(sql.indexOf("create or replace function access_control.enforce_audited_access_change"))
		expect(body).toContain("current_setting('iefa.audit_operation', true)")
		expect(body).toContain("current_setting('iefa.audit_bypass', true)")
		expect(body).toContain("pg_trigger_depth() <= 1")
		expect(body).toContain("ACCESS_CHANGE_UNAUDITED")
	})

	test("o `last_used_at` do sisub-mcp e os campos não-papel do perfil ficam de fora", () => {
		expect(sql).toMatch(/before update on access_control\.mcp_api_keys\s+for each row\s+when \(/)
		expect(sql).not.toMatch(/last_used_at is distinct/)
		expect(sql).toMatch(/when \(old\.role is distinct from new\.role\)/)
	})
})

test("journal.save_user_profile delega o papel à função auditada e recusa `role` nos campos", () => {
	const body = bodies.get("journal.save_user_profile")?.body ?? ""
	expect(body).toContain("perform journal.change_user_role(p_actor, p_user, p_role, p_assurance)")
	expect(body).toMatch(/where k not in \('full_name', 'affiliation', 'orcid', 'bio', 'expertise', 'email_notifications'\)/)
	expect(body).not.toMatch(/insert into journal\.user_profiles \([^)]*\brole\b/)
})

test("set_module_block (20260921090100, aplicada) é substituída pela versão que abre o contexto", () => {
	const latest = bodies.get("access_control.set_module_block")
	expect(latest?.file).toBe(PHASE_1)
	expect(latest?.body).toContain("perform access_control.audit_context(p_app || '.permission.' || case when p_blocked then 'block' else 'unblock' end)")
	// A assinatura não muda: `create or replace` sobre a função viva, sem sobrecarga nova.
	expect(latest?.body).toMatch(
		/p_actor\s+uuid,\s*p_app\s+text,\s*p_user\s+uuid,\s*p_modules\s+text\[\],\s*p_blocked\s+boolean,\s*p_assurance\s+text default 'session'/
	)
})

// ═════════════════════════════════════════════════════════════════════════════
// 20261001140000…140200 — log append-only, TRUNCATE e troca de e-mail
// ═════════════════════════════════════════════════════════════════════════════

const APPEND_ONLY = "20261001140000_audit_log_append_only.sql"
const TRUNCATE_GUARD = "20261001140100_access_tables_truncate_guard.sql"
const EMAIL_GUARD = "20261001140200_auth_email_change_domain_guard.sql"
const AUDIT_LOGS = ["access_control.sensitive_operation_log", "access_control.mfa_reset_log"] as const

/** Migrations com nome maior que `after` (ou igual, com `inclusive`), concatenadas. */
function migrationsAfter(after: string, inclusive = false): string {
	return readdirSync(MIGRATIONS)
		.filter((name) => name.endsWith(".sql") && (inclusive ? name >= after : name > after))
		.sort()
		.map((name) => readFileSync(join(MIGRATIONS, name), "utf8"))
		.join("\n")
}

describe("log de auditoria append-only (20261001140000)", () => {
	const sql = readFileSync(join(MIGRATIONS, APPEND_ONLY), "utf8")

	test.each([...AUDIT_LOGS])("%s perde UPDATE/DELETE/TRUNCATE e ganha os triggers de recusa", (table) => {
		const t = table.replace(".", "\\.")
		expect(sql).toMatch(new RegExp(`revoke update, delete, truncate on table ${t} from public, anon, authenticated, service_role`))
		expect(sql).toMatch(new RegExp(`before update or delete on ${t}\\s+for each row execute function access_control\\.refuse_audit_log_change\\(\\)`))
		expect(sql).toMatch(new RegExp(`before truncate on ${t}\\s+for each statement execute function access_control\\.refuse_audit_log_change\\(\\)`))
	})

	test("nenhuma migration posterior devolve escrita no log nem desliga o trigger", () => {
		const later = migrationsAfter(APPEND_ONLY)
		for (const table of AUDIT_LOGS) {
			const t = table.replace(".", "\\.")
			expect(later).not.toMatch(new RegExp(`grant[^;]*\\b(update|delete|truncate|all)\\b[^;]*on (table )?${t}\\b`, "i"))
			expect(later).not.toMatch(new RegExp(`alter table ${t}\\s+disable trigger`, "i"))
		}
	})

	test("nenhuma função reescreve ou apaga o log", () => {
		const offenders = [...bodies.entries()]
			.filter(([, { body }]) => /(update|delete\s+from|truncate)\s+(table\s+)?access_control\.(sensitive_operation_log|mfa_reset_log)\b/i.test(body))
			.map(([name]) => name)
		expect(offenders).toEqual([])
	})

	test("UPDATE e TRUNCATE não têm exceção; DELETE só com bypass E conta de fixture", () => {
		const body = bodies.get("access_control.refuse_audit_log_change")?.body ?? ""
		expect(body).toMatch(/if tg_op = 'DELETE' and coalesce\(current_setting\('iefa\.audit_bypass', true\), ''\) <> ''/)
		expect(body).toContain("lower(u.email) like '%@example.invalid'")
		expect(body).toContain("AUDIT_LOG_APPEND_ONLY")
		expect(body).not.toContain("iefa.audit_operation")
	})
})

describe("TRUNCATE nas tabelas vigiadas (20261001140100)", () => {
	const fromGuard = migrationsAfter(TRUNCATE_GUARD, true)

	test.each([...ACCESS_TABLES])("%s tem o trigger BEFORE TRUNCATE", (table) => {
		expect(fromGuard).toMatch(
			new RegExp(`before truncate on ${table.replace(".", "\\.")}\\s+for each statement execute function access_control\\.refuse_unaudited_truncate\\(\\)`)
		)
	})

	test("só o bypass explícito libera — o contexto de função auditada não", () => {
		const body = bodies.get("access_control.refuse_unaudited_truncate")?.body ?? ""
		expect(body).toContain("current_setting('iefa.audit_bypass', true)")
		expect(body).not.toContain("iefa.audit_operation")
		expect(body).toContain("ACCESS_CHANGE_UNAUDITED")
	})
})

describe("troca de e-mail em auth.users (20261001140200)", () => {
	const sql = readFileSync(join(MIGRATIONS, EMAIL_GUARD), "utf8")
	const body = bodies.get("access_control.enforce_institutional_email_change")?.body ?? ""

	test("SECURITY DEFINER do postgres, search_path vazio, EXECUTE só com o dono", () => {
		expect(body).toMatch(/security definer\s+set search_path = ''/)
		expect(sql).toContain("alter function access_control.enforce_institutional_email_change() owner to postgres")
		expect(sql).toContain("revoke all on function access_control.enforce_institutional_email_change() from public, anon, authenticated, service_role")
	})

	test("mesma regra de domínio do hook de cadastro, e a allowlist ativa", () => {
		const hook = bodies.get("access_control.before_user_created")?.body ?? ""
		const domain = "~ '^[^@[:space:]]+@fab\\.mil\\.br$'"
		expect(hook).toContain(domain)
		expect(body).toContain(domain)
		expect(body).toMatch(/from access_control\.signup_allowlist a\s+where a\.email = v_candidate and a\.revoked_at is null/)
	})

	test("só confere endereço que MUDOU (login, refresh e recovery não trocam e-mail)", () => {
		expect(body).toContain("case when v_new_email <> v_old_email then v_new_email end")
		expect(body).toContain("case when v_new_change <> v_old_change then v_new_change end")
		expect(sql).toMatch(/when \(old\.email is distinct from new\.email or old\.email_change is distinct from new\.email_change\)/)
	})

	test("o trigger é criado só se não existir (o postgres não é dono de auth.users e não o remove)", () => {
		// O cabeçalho ensina a remover como supabase_auth_admin; o que conta é o SQL que executa.
		expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/drop trigger[^;]*on auth\.users/i)
		expect(sql).toMatch(/if not exists \([\s\S]*?tgname = 'enforce_institutional_email'[\s\S]*?create trigger enforce_institutional_email/)
	})
})
