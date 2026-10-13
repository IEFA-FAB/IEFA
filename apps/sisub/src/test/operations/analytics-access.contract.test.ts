/**
 * Integração — o que o assistente de analytics enxerga de pessoa, e quem pode tê-lo.
 *
 * - `analytics.v_user_identity` (e a `v_meal_presences_with_user`, que lê dela) nunca publica
 *   e-mail: sem posto/nome de guerra, o rótulo é `Usuário <8 primeiros do id>`
 *   (20261001130000). Antes caía no `core.user_data.email`, e 159 contas apareciam ao modelo
 *   pelo e-mail.
 * - `analytics` não aceita escopo, nem em grant inline nem em statement de política
 *   (20261001130100): o assistente lê todas as OMs com BYPASSRLS, e escopo ali só enganaria
 *   quem concede.
 *
 * Só leitura e catálogo: nada é gravado.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

describeIf("analytics: identidade sem dado pessoal e módulo sem escopo (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	// Duas leituras, porque cada uma sozinha falha de um lado:
	// - dependência de coluna (`pg_depend` da regra da view): pega qualquer coluna `*email*` lida,
	//   de qualquer tabela, sem olhar o texto. É a prova principal.
	// - texto da definição SEM os literais entre aspas: pega o e-mail que chega por expressão que
	//   não deixa dependência de coluna (função, `to_jsonb(linha)`). Os literais saem porque
	//   `saram_verified_by in ('email', 'cpf', …)` cita o VALOR "email": o regex no texto cru acusava
	//   a `v_user_identity` desde 20261003100000 sem ela ler e-mail nenhum.
	test("nenhuma view do schema analytics lê e-mail", async () => {
		const byColumn = await sql<{ name: string }[]>`
			select distinct n.nspname || '.' || v.relname || ' <- ' || a.attrelid::regclass::text || '.' || a.attname as name
			from pg_class v
			join pg_namespace n on n.oid = v.relnamespace
			join pg_rewrite r on r.ev_class = v.oid
			join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid and d.refobjsubid > 0
			join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
			where n.nspname = 'analytics' and v.relkind in ('v', 'm') and a.attname ~* 'email'`
		const byText = await sql<{ name: string }[]>`
			select schemaname || '.' || viewname as name
			from pg_views
			where schemaname = 'analytics'
				and regexp_replace(definition, $$'([^']|'')*'$$, '', 'g') ~* '\\memail\\M'`
		expect([...byColumn, ...byText].map((r) => r.name)).toEqual([])
	})

	test("o rótulo de quem não tem nome de guerra é o id curto, e nenhum rótulo é e-mail", async () => {
		const [row] = await sql<{ with_at: number; fallback_ok: boolean; total: number }[]>`
			select
				count(*) filter (where v.display_name like '%@%')::int as with_at,
				bool_and(v.display_name = 'Usuário ' || left(v.id::text, 8)) filter (where v.display_name like 'Usuário %') as fallback_ok,
				count(*)::int as total
			from analytics.v_user_identity v`
		expect(row.total).toBeGreaterThan(0)
		expect(row.with_at).toBe(0)
		// Sem nenhuma conta sem nome de guerra o agregado é null — também vale.
		expect(row.fallback_ok ?? true).toBe(true)
	})

	test("o assistente, pela RPC, também não vê e-mail na presença", async () => {
		const [row] = await sql.begin(async (tx) => {
			await tx`set local role service_role`
			return tx`select sisub.execute_analytics_query(${"select count(*) as n from v_meal_presences_with_user where display_name like '%@%'"}) as r`
		})
		expect(row.r).toEqual([{ n: 0 }])
	})

	test("grants da view intactos: só o analytics_reader lê", async () => {
		const [grants] = await sql`
			select
				has_table_privilege('analytics_reader', 'analytics.v_user_identity', 'select') as reader,
				has_table_privilege('anon', 'analytics.v_user_identity', 'select') as anon,
				has_table_privilege('authenticated', 'analytics.v_user_identity', 'select') as authenticated`
		expect(grants).toEqual({ reader: true, anon: false, authenticated: false })
	})

	test("analytics sem escopo: CHECK nas duas tabelas de acesso, validado, e nenhuma linha escopada", async () => {
		const constraints = await sql<{ conname: string; convalidated: boolean; def: string }[]>`
			select conname, convalidated, pg_get_constraintdef(oid) as def
			from pg_constraint
			where conname in ('user_permissions_analytics_unscoped', 'policy_statement_analytics_unscoped')
			order by conname`
		expect(constraints.map((c) => c.conname)).toEqual(["policy_statement_analytics_unscoped", "user_permissions_analytics_unscoped"])
		for (const c of constraints) {
			expect(c.convalidated).toBe(true)
			expect(c.def).toContain("'analytics'")
		}

		const [scoped] = await sql<{ n: number }[]>`
			select (
				(select count(*) from access_control.user_permissions where module = 'analytics' and (unit_id is not null or kitchen_id is not null or mess_hall_id is not null))
				+ (select count(*) from access_control.policy_statement where module = 'analytics' and (unit_id is not null or kitchen_id is not null or mess_hall_id is not null))
			)::int as n`
		expect(scoped.n).toBe(0)
	})
})
