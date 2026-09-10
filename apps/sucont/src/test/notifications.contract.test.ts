/**
 * Contrato do sino.
 *
 * Os invariantes cobertos aqui são os que **não têm como aparecer num teste de
 * unidade** e que custam caro para consertar depois que produção já rodou:
 *
 *   • idempotência do fan-out e do cron — sem ela, um job reexecutado à mão duplica
 *     a caixa de entrada de todo mundo, e limpar duplicata em produção é manual;
 *   • `resolved_at` separado de `read_at` — colapsados, a purga apaga cedo demais e
 *     o contador da bolinha mente;
 *   • endereçamento pela SESSÃO — um `userId` de parâmetro entregaria a caixa de
 *     entrada de qualquer um, que é exatamente o IDOR que o `fetchUserPermissions`
 *     do sisub teve.
 *
 * A varredura é sobre o texto porque o risco não é a regra quebrar: é a próxima
 * migration recriar a função ou o índice sem ela.
 */
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "../../../..")
const MIGRATIONS_DIR = join(REPO_ROOT, "packages/database/supabase/migrations")

/**
 * Toda migration que toca o sino, concatenada. Migration nova entra sozinha: o
 * filtro é por conteúdo, não por uma lista de nomes que alguém teria de atualizar.
 */
const NOTIFICATION_SQL = readdirSync(MIGRATIONS_DIR)
	.filter((name) => name.endsWith(".sql"))
	.map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
	.filter((text) => text.includes("sucont.notification"))
	.join("\n")

const INBOX_FN = readFileSync(resolve(import.meta.dir, "../server/notifications.fn.ts"), "utf8")

describe("varredura", () => {
	it("encontrou o SQL do sino — um filtro que não casa passaria os testes abaixo vazios", () => {
		expect(NOTIFICATION_SQL).toContain("create table sucont.notification")
	})
})

describe("idempotência", () => {
	it("tem índice único de deduplicação por (destinatário, tipo, assunto, competência)", () => {
		expect(NOTIFICATION_SQL).toMatch(/create unique index notification_dedup_idx\s+on sucont\.notification \(user_id, kind, subject_id, occurrence_on\)/)
	})

	// Sem `nulls not distinct`, o `occurrence_on` nulo do aviso escapa do índice: o
	// Postgres trata cada NULL como distinto e o mesmo aviso entra duas vezes.
	it("trata NULL como valor no índice de deduplicação", () => {
		expect(NOTIFICATION_SQL).toMatch(/notification_dedup_idx[\s\S]{0,200}nulls not distinct/)
	})

	it("insere o fan-out com `on conflict do nothing`", () => {
		expect(NOTIFICATION_SQL).toMatch(/insert into sucont\.notification[\s\S]{0,400}on conflict do nothing/)
	})
})

describe("purga", () => {
	it("conta o prazo a partir da resolução, não só da leitura", () => {
		expect(NOTIFICATION_SQL).toContain("coalesce(resolved_at, read_at)")
	})

	it("tem teto absoluto além do prazo de resolvida", () => {
		expect(NOTIFICATION_SQL).toMatch(/created_at < now\(\) - interval '\d+ days'/)
	})
})

describe("os dois carimbos", () => {
	it("declara `read_at` e `resolved_at` como colunas distintas", () => {
		expect(NOTIFICATION_SQL).toMatch(/read_at timestamptz,\s*\n\s*resolved_at timestamptz/)
	})

	// Em gatilho, e não na server function: `resolved_at` só é confiável se for
	// verdade por qualquer caminho de escrita, inclusive um UPDATE pelo MCP.
	it("resolve por gatilho quando o aviso é apagado e quando a tarefa é feita", () => {
		expect(NOTIFICATION_SQL).toMatch(/create trigger notice_resolve_ad after delete on sucont\.notice/)
		expect(NOTIFICATION_SQL).toMatch(/create trigger occurrence_resolve_aiu after insert or update on sucont\.checklist_occurrence/)
	})
})

describe("endereçamento", () => {
	it("nunca aceita `userId` do cliente", () => {
		expect(INBOX_FN).not.toMatch(/userId:\s*z\./)
		expect(INBOX_FN).not.toMatch(/user_id:\s*z\./)
	})

	it("tira o destinatário da sessão e filtra toda leitura e escrita por ele", () => {
		expect(INBOX_FN).toContain("await requireSucontAccess()")
		// Duas chamadas de leitura (lista e contagem) e uma de escrita (marcar lida).
		expect(INBOX_FN.match(/\.eq\("user_id", ctx\.userId\)/g)?.length).toBe(3)
	})
})

describe("RPC do sino não é chamável pelo browser", () => {
	// Função em schema exposta ao PostgREST nasce com EXECUTE para PUBLIC.
	// `notify_section` posta na caixa de entrada da seção inteira.
	it("revoga execute das funções de escrita", () => {
		const revoked = NOTIFICATION_SQL.slice(NOTIFICATION_SQL.indexOf("revoke execute on function"))
		for (const fn of ["sucont.notify_section", "sucont.run_notification_tick", "sucont.purge_notifications", "sucont.notification_audience"]) {
			expect(revoked).toContain(fn)
		}
		expect(revoked).toMatch(/from public, anon, authenticated/)
	})
})

describe("search_path fixo", () => {
	// Não é o risco clássico de SECURITY DEFINER — nenhuma delas é definer. É o
	// cron: `run_notification_tick` roda como `postgres` e desce até
	// `access_control.user_permissions`. Nome resolvido pelo `search_path` do papel
	// nessa cadeia é nome resolvido com privilégio de superusuário.
	it("prende o search_path de toda função do sino", () => {
		for (const fn of [
			"sucont.today()",
			"sucont.business_days(date)",
			"sucont.nth_business_day(date, integer)",
			"sucont.last_business_day(date)",
			"sucont.checklist_period(text, integer, date)",
			"sucont.notification_audience()",
			"sucont.notify_section(text, text, text, text, uuid, date)",
			"sucont.purge_notifications()",
			"sucont.run_notification_tick()",
			"sucont.notice_notify()",
			"sucont.notice_resolve()",
			"sucont.occurrence_resolve()",
		]) {
			expect(NOTIFICATION_SQL).toContain(`alter function ${fn} set search_path = ''`)
		}
	})
})

describe("agendamento versionado", () => {
	// Job agendado pelo console do Supabase é estado de banco fora do git — a mesma
	// armadilha do `terraform apply` do alpha.
	it("agenda o tick na migration, com unschedule antes", () => {
		expect(NOTIFICATION_SQL).toContain("cron.unschedule('sucont-notification-tick')")
		expect(NOTIFICATION_SQL).toMatch(/cron\.schedule\('sucont-notification-tick', '0 11 \* \* \*'/)
	})
})
