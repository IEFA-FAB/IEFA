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

/** As tabelas que a fase 2 vigia — e em que só função auditada escreve. */
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
	// Trigger do cadastro (auth.users): insere o perfil com papel `author`, o default — fora do
	// WHEN do journal, e não é concessão de nada.
	"public.handle_new_user": "perfil `author` do cadastro, fora do que a fase 2 vigia",
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

	test.each([...ACCESS_TABLES])("%s tem o trigger de recusa", (table) => {
		expect(sql).toMatch(
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
