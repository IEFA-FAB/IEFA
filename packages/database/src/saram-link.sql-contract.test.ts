/**
 * Invariantes TEXTUAIS de 20261003100000 (vínculo de SARAM verificado e conta institucional).
 *
 * O comportamento é provado no Postgres descartável (`scripts/access-audit/run.sh`, arquivo
 * `saram-link.test.sql`: chave, backfill, homônimos, CPF com bloqueio, disputa, institucional,
 * decisões do admin) e no banco real (`apps/sisub/src/test/operations/saram-link.operations.test.ts`,
 * depois do apply). Este é o aviso barato de todo `bun run test` para quem reescrever uma função
 * partindo do corpo antigo e apagar uma trava.
 *
 * Prova texto, não comportamento. Não substitui o `run.sh`.
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const FILE = "20261003100000_saram_verified_link.sql"
const source = readFileSync(join(import.meta.dir, "..", "supabase", "migrations", FILE), "utf8")
/** SQL sem comentários de linha: o que executa. */
const executable = source.replace(/--[^\n]*/g, "")

/** Corpo de cada função criada, por nome qualificado. */
function functions(): Map<string, string> {
	const out = new Map<string, string>()
	const head = /create or replace function ([a-z_]+\.[a-z_]+)\s*\(/gi
	let match = head.exec(executable)
	while (match !== null) {
		const open = executable.indexOf("$$", match.index)
		const close = executable.indexOf("$$", open + 2)
		out.set(match[1] as string, executable.slice(match.index, close + 2))
		match = head.exec(executable)
	}
	return out
}

const all = functions()
const body = (name: string) => all.get(name) ?? ""

describe(`migration ${FILE}`, () => {
	test("o scanner acha as funções (proteção contra teste que passa vazio)", () => {
		expect(all.size).toBeGreaterThanOrEqual(25)
	})

	test("toda função fixa search_path vazio e nenhuma é SECURITY DEFINER", () => {
		for (const [name, text] of all) {
			expect(text, name).toContain("set search_path = ''")
		}
		expect(executable).not.toMatch(/security definer/i)
	})

	test("toda função exposta é revogada de cliente e concedida só ao service_role", () => {
		const grants = executable.slice(executable.indexOf("foreach f in array array["))
		for (const name of all.keys()) {
			if (name === "core.guard_user_data_saram_link" || name === "kitchen.refuse_institutional_account_meal") {
				expect(grants, name).toContain(`revoke all on function ${name}() from public, anon, authenticated`)
				continue
			}
			expect(grants, name).toContain(`'${name}(`)
		}
		expect(grants).toContain("revoke all on function %s from public, anon, authenticated")
		expect(grants).toContain("grant execute on function %s to service_role")
	})

	test("chave: domínio exato, sem tp. e sem dígitos finais; nome sem as preposições", () => {
		expect(body("core.email_name_key")).toContain("e.email ~ '^[^@[:space:]]+@fab\\.mil\\.br$'")
		expect(body("core.email_name_key")).toContain("'^tp\\.'")
		expect(body("core.email_name_key")).toContain("'[0-9]+$'")
		expect(body("core.military_name_key")).toContain("w.word not in ('de', 'da', 'do', 'das', 'dos', 'e')")
		// dicionário explícito: o que deixa a função ser imutável e indexável
		expect(body("core.military_name_key")).toContain("public.unaccent('public.unaccent'::regdictionary")
		expect(executable).toMatch(/create index if not exists user_military_data_name_key_idx on core\.\w+ \(core\.military_name_key\("nmGuerra", "nmPessoa"\)\)/)
	})

	test("o estado nunca publica SARAM, CPF ou nome completo de candidato", () => {
		const status = body("core.saram_link_status")
		const candidates = status.slice(status.indexOf("jsonb_agg(jsonb_build_object("), status.indexOf("into v_candidates"))
		expect(candidates).toContain("'ref', c.roster_id")
		expect(candidates).not.toMatch(/'saram'/)
		expect(status).not.toMatch(/nrCpf|nmPessoa/)
	})

	test("conferência por CPF e por sufixo registram a tentativa sem exceção, e o bloqueio vem antes", () => {
		for (const name of ["core.verify_saram_by_cpf", "core.confirm_saram_candidate"]) {
			const text = body(name)
			const locked = text.indexOf("core.saram_attempt_locked_until(")
			const attempt = text.indexOf("insert into core.saram_verification_attempt")
			expect(locked, name).toBeGreaterThan(-1)
			expect(attempt, name).toBeGreaterThan(locked)
			expect(text, name).toContain("'outcome', 'mismatch'")
			expect(text, name).toContain("'outcome', 'locked'")
		}
		// 5 falhas na última hora, por conta e por SARAM
		expect(body("core.saram_attempt_locked_until")).toMatch(/offset 4 limit 1[\s\S]*offset 4 limit 1/)
		expect(body("core.saram_attempt_locked_until")).toContain("a.saram = p_saram")
	})

	test("o mesmo advisory lock de sempre, por SARAM, antes de gravar", () => {
		for (const name of [
			"core.confirm_saram_candidate",
			"core.verify_saram_by_cpf",
			"core.request_saram_link",
			"core.claim_saram",
			"core.decide_saram_request",
			"core.admin_link_saram",
		]) {
			expect(body(name), name).toContain("perform pg_advisory_xact_lock(hashtext('saram:' ||")
		}
	})

	test("o vínculo só é gravado com o contexto aberto pela função", () => {
		expect(body("core.assign_saram")).toContain("current_setting('iefa.saram_link', true), '') is distinct from p_via")
		expect(body("core.apply_saram_link")).toContain("current_setting('iefa.saram_link', true), '') is distinct from p_via")
		expect(body("core.guard_user_data_saram_link")).toContain("new.saram_verified_by := null")
		expect(body("core.guard_user_data_saram_link")).toContain("'SARAM_LINK_OUTSIDE_FUNCTION' using errcode = '42501'")
		expect(executable).toContain("before insert or update on core.user_data")
	})

	test("verificado prevalece sobre legacy com log; titular verificado vira contestação", () => {
		const apply = body("core.apply_saram_link")
		expect(apply).toContain("ud.saram_verified_by in ('email', 'cpf', 'admin')")
		expect(apply).toContain("'dispute'")
		expect(apply.indexOf("access_control.audit_context('claimSaramFromUnverifiedHolder')")).toBeLessThan(apply.indexOf("access_control.record_access_change("))
	})

	test("decisões do admin: contexto de auditoria primeiro, log na mesma função, versão conferida", () => {
		for (const name of ["core.decide_saram_request", "core.admin_link_saram", "core.admin_unlink_saram", "core.admin_set_account_kind"]) {
			const text = body(name)
			const context = text.indexOf("perform access_control.audit_context(p_operation)")
			expect(context, name).toBeGreaterThan(-1)
			expect(context, name).toBeLessThan(text.indexOf("update "))
			expect(text, name).toContain("access_control.record_access_change(p_actor, p_operation, p_assurance,")
		}
		expect(body("core.decide_saram_request")).toContain("'REQUEST_NOT_PENDING'")
		expect(body("core.admin_link_saram")).toContain("'SARAM_LINK_CHANGED'")
		expect(body("core.admin_unlink_saram")).toContain("'SARAM_LINK_CHANGED'")
		expect(body("core.admin_set_account_kind")).toContain("'ACCOUNT_KIND_CHANGED'")
	})

	test("conta institucional: CHECK sem SARAM e recusa de arranchamento/presença no banco", () => {
		expect(executable).toContain("check (account_kind = 'pessoal' or saram is null)")
		expect(executable).toContain("before insert or update on kitchen.arranchamento")
		expect(executable).toContain("before insert or update on kitchen.meal_presences")
		expect(body("kitchen.refuse_institutional_account_meal")).toContain("'ACCOUNT_INSTITUTIONAL_NO_MEALS'")
		// arranchamentos de hoje em diante, pela data civil de Brasília
		expect(body("core.apply_institutional_account")).toContain("date >= (now() at time zone 'America/Sao_Paulo')::date")
	})

	test("backfill: email para quem bate, legacy para o resto; um verificado por SARAM", () => {
		const backfill = executable.slice(
			executable.indexOf("select set_config('iefa.saram_link', 'backfill', true)"),
			executable.indexOf("drop trigger if exists user_data_guard_saram_link")
		)
		expect(backfill).toContain('core.military_name_key(m."nmGuerra", m."nmPessoa") = core.email_name_key(ud.email)')
		expect(backfill).toContain("case when r.matches and r.rn = 1 then 'email' else 'legacy' end")
		expect(executable).toMatch(
			/create unique index if not exists user_data_saram_verified_uniq on core\.user_data \(saram\)\s+where saram_verified_by in \('email', 'cpf', 'admin'\)/
		)
	})

	test("tabelas novas sem cliente e sem escopo do treino", () => {
		for (const table of ["core.saram_link_request", "core.saram_verification_attempt"]) {
			expect(executable).toContain(`alter table ${table} enable row level security`)
			expect(executable).toContain(`revoke all on ${table} from public, anon, authenticated`)
		}
		const tables = executable.slice(
			executable.indexOf("create table if not exists core.saram_link_request"),
			executable.indexOf("create or replace function core.military_name_key")
		)
		expect(tables).toContain("create table if not exists core.saram_verification_attempt")
		expect(tables).not.toMatch(/\b(kitchen_id|unit_id|mess_hall_id)\b/)
	})
})
