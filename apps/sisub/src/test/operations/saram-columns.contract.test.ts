/**
 * Integração — o que vale para o SARAM depois do contract do lote 6 (20260927190000), quando a
 * suíte de compatibilidade do expand já saiu.
 *
 *   * `core.user_data.saram` e `core.person.saram` são as únicas colunas do SARAM nos objetos
 *     nossos: anuláveis (o SARAM é opcional na conta e na pessoa), sem FK para o espelho (quem
 *     chegou depois da última carga continua cadastrável), `saram` UNIQUE na pessoa;
 *   * `core.person_identity` expõe `saram`, e as views de identidade juntam por ele; o cronograma do
 *     sucont (`sucont.checklist_current`), que o contract recriou junto, segue legível pelo servidor;
 *   * o espelho do cadastro de pessoal (`core.user_military_data`) continua no formato do patch do
 *     mantenedor (`LGPD.md`): as sete colunas do sistema de origem, na ordem, e `id` por último;
 *   * nenhum cliente alcança as tabelas nem as views.
 *
 * Banco real, `sql.begin` + savepoints + ROLLBACK final: nada persiste.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

async function inRollback(sql: postgres.Sql, body: (tx: postgres.TransactionSql) => Promise<void>): Promise<string> {
	return sql
		.begin(async (tx) => {
			await body(tx)
			throw new Rollback()
		})
		.then(
			() => "committed",
			(err) => {
				if (err instanceof Rollback) return "rolled-back"
				throw err
			}
		)
}

/** Recusa esperada dentro da transação, isolada num savepoint para a transação seguir. */
async function refused(tx: postgres.TransactionSql, body: (sp: postgres.TransactionSql) => Promise<unknown>): Promise<string> {
	try {
		await tx.savepoint(body)
	} catch (err) {
		return (err as Error).message
	}
	return "aceito"
}

const testSaram = (suffix: string) => `ZZL6C-${Date.now().toString(36)}-${suffix}`

describeIf("SARAM depois do contract do lote 6 (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("só `saram` nas tabelas e na view nossas; anulável, sem FK para o espelho", async () => {
		const columns = await sql<{ name: string; nullable: string }[]>`
			select table_name || '.' || column_name as name, is_nullable as nullable
			from information_schema.columns
			where table_schema = 'core' and table_name in ('person', 'user_data', 'person_identity')
				and column_name in ('saram', 'nr_ordem', 'nrOrdem')
			order by 1`
		expect(columns).toEqual([
			{ name: "person.saram", nullable: "YES" },
			{ name: "person_identity.saram", nullable: "YES" },
			{ name: "user_data.saram", nullable: "YES" },
		])
		const [state] = await sql<{ person_unique: boolean; user_data_index: boolean; mirror_fk: number; mirror_triggers: number; mirror_functions: number }[]>`
			select
				exists (select 1 from pg_constraint where conname = 'person_saram_key' and conrelid = 'core.person'::regclass and contype = 'u') as person_unique,
				to_regclass('core.user_data_saram_idx') is not null as user_data_index,
				(select count(*)::int from pg_constraint where confrelid = 'core.user_military_data'::regclass) as mirror_fk,
				(select count(*)::int from pg_trigger where tgrelid in ('core.person'::regclass, 'core.user_data'::regclass) and tgname like '%mirror_saram%') as mirror_triggers,
				(select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
					where n.nspname = 'core' and p.proname in ('mirror_person_saram', 'mirror_user_data_saram')) as mirror_functions`
		expect(state).toEqual({ person_unique: true, user_data_index: true, mirror_fk: 0, mirror_triggers: 0, mirror_functions: 0 })
	})

	test("o espelho do cadastro de pessoal segue no formato do patch", async () => {
		const [mirror] = await sql<{ columns: string; pk: string; cpf_unique: boolean }[]>`
			select
				(select string_agg(attname, ',' order by attnum) from pg_attribute
					where attrelid = 'core.user_military_data'::regclass and attnum > 0 and not attisdropped) as columns,
				(select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'core.user_military_data'::regclass and contype = 'p') as pk,
				exists (select 1 from pg_constraint where conrelid = 'core.user_military_data'::regclass and contype = 'u'
					and pg_get_constraintdef(oid) = 'UNIQUE ("nrCpf")') as cpf_unique`
		expect(mirror).toEqual({ columns: "nrOrdem,nrCpf,nmGuerra,nmPessoa,sgPosto,sgOrg,dataAtualizacao,id", pk: "PRIMARY KEY (id)", cpf_unique: true })
	})

	test("as views de identidade juntam por `saram` e nenhum cliente as alcança", async () => {
		const [state] = await sql<{ person: string; v_user: string; analytics: string; client: boolean }[]>`
			select
				pg_get_viewdef('core.person_identity'::regclass) as person,
				pg_get_viewdef('core.v_user_identity'::regclass) as v_user,
				pg_get_viewdef('analytics.v_user_identity'::regclass) as analytics,
				has_table_privilege('anon', 'core.person_identity', 'select') or has_table_privilege('authenticated', 'core.person_identity', 'select')
					or has_table_privilege('anon', 'core.user_data', 'select') or has_table_privilege('authenticated', 'core.user_data', 'select')
					or has_table_privilege('anon', 'core.person', 'select') or has_table_privilege('authenticated', 'core.person', 'select') as client`
		expect(state.person).toMatch(/mi\.saram = p\.saram/)
		expect(state.v_user).toMatch(/mi\.saram = ud\.saram/)
		expect(state.analytics).toMatch(/umd\."nrOrdem" = ud\.saram/)
		expect(state.client).toBe(false)
	})

	test("o cronograma do sucont, recriado junto com core.person_identity, segue legível pelo servidor", async () => {
		const [checklist] = await sql<{ invoker: boolean; server: boolean; client: boolean; reads_identity: boolean }[]>`
			select
				(select coalesce(reloptions, '{}') @> array['security_invoker=true'] from pg_class where oid = 'sucont.checklist_current'::regclass) as invoker,
				has_table_privilege('service_role', 'sucont.checklist_current', 'select') as server,
				has_table_privilege('anon', 'sucont.checklist_current', 'select') or has_table_privilege('authenticated', 'sucont.checklist_current', 'select') as client,
				pg_get_viewdef('sucont.checklist_current'::regclass) ~ 'core\.person_identity' as reads_identity`
		expect(checklist).toEqual({ invoker: true, server: true, client: false, reads_identity: true })
		const rows = await sql`select assignees from sucont.checklist_current limit 1`
		expect(Array.isArray(rows)).toBe(true)
	})

	test("pessoa: SARAM repetido recusado, SARAM ausente do espelho aceito e sem posto", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const saram = testSaram("p")
				const [person] = await tx<{ id: string }[]>`insert into core.person (display_name, saram) values ('[TEST] lote 6 contract', ${saram}) returning id`
				const [identity] = await tx<{ saram: string | null; posto: string | null; label: string }[]>`
					select saram, posto, label from core.person_identity where id = ${person.id}`
				expect(identity).toEqual({ saram, posto: null, label: "[TEST] lote 6 contract" })

				const duplicate = await refused(tx, (sp) => sp`insert into core.person (display_name, saram) values ('[TEST] lote 6 dup', ${saram})`)
				expect(duplicate).toMatch(/person_saram_key/)
			})
		).resolves.toBe("rolled-back")
	})
})
