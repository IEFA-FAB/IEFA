/**
 * Integração — camada de compatibilidade do rename 20260927130000 (lote 7 da linguagem ubíqua:
 * arranchamento), exercitada pelo caminho LEGADO: é o que o código da `main` em produção faz entre
 * a aplicação do expand e o deploy do código novo.
 *
 *   * `kitchen.meal_forecasts` é view auto-updatable sobre `kitchen.arranchamento`, com as mesmas
 *     colunas e defaults: o upsert do comensal (`on conflict (user_id, date, meal)`), o delete, o
 *     reset de treino e as leituras (painel, fiscal, API pública) passam direto para a tabela, e o
 *     trigger `set_updated_at` da tabela dispara;
 *   * os CHECKs, a unique e as FKs da tabela valem para o que a `main` grava pela view;
 *   * a view tem os grants da tabela: o servidor escreve, o leitor do analytics lê (o SQL que o
 *     modelo escrevia com o nome antigo continua respondendo) e nenhum cliente alcança.
 *
 * Sai no contract (20260927140000) junto com a camada que ele testa.
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

/** Data longe de qualquer arranchamento real: a chave (user, data, refeição) não colide. */
const DATE = "2099-12-31"

/** Uma OM, um refeitório e um usuário existente (a FK é para `auth.users`). */
async function seed(tx: postgres.TransactionSql) {
	const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-L7A', 'unit teste lote 7') returning id`
	const [messHall] =
		await tx`insert into kitchen.mess_halls (unit_id, code, display_name) values (${unit.id}, 'ZZTEST-L7-MH', 'refeitório lote 7') returning id`
	const [other] =
		await tx`insert into kitchen.mess_halls (unit_id, code, display_name) values (${unit.id}, 'ZZTEST-L7-MH2', 'outro refeitório lote 7') returning id`
	const [user] = await tx`select id from auth.users limit 1`
	return { messHallId: Number(messHall.id), otherMessHallId: Number(other.id), userId: user.id as string }
}

describeIf("compatibilidade do rename do lote 7: arranchamento (DB)", () => {
	let sql: postgres.Sql

	/**
	 * A camada existe só entre o expand e o contract. Depois de aplicado o contract (e até este
	 * arquivo sair da `main` com o PR dele), a suíte se pula sozinha em vez de derrubar o `gate` de
	 * todo PR aberto.
	 */
	let compatLayerPresent = false

	beforeAll(async () => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
		const [row] = await sql`select to_regclass('kitchen.meal_forecasts') is not null and to_regclass('kitchen.arranchamento') is not null as present`
		compatLayerPresent = row?.present === true
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("o upsert, o update e o delete da `main` pela view antiga caem na tabela, com defaults e trigger", async (ctx) => {
		if (!compatLayerPresent) ctx.skip()
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// INSERT sem id/created_at/updated_at, como o Drizzle da `main` grava.
				const [created] = await tx`
					insert into kitchen.meal_forecasts (date, user_id, meal, will_eat, mess_hall_id)
					values (${DATE}, ${s.userId}, 'almoco', true, ${s.messHallId})
					on conflict (user_id, date, meal) do update set will_eat = excluded.will_eat, mess_hall_id = excluded.mess_hall_id
					returning id, created_at, updated_at`
				expect(created.id).toBeTruthy()
				expect(created.created_at).toBeTruthy()
				expect(created.updated_at).toBeTruthy()

				// O mesmo upsert de novo: a unique (user_id, date, meal) resolve pela view.
				await tx`
					insert into kitchen.meal_forecasts (date, user_id, meal, will_eat, mess_hall_id)
					values (${DATE}, ${s.userId}, 'almoco', false, ${s.otherMessHallId})
					on conflict (user_id, date, meal) do update set will_eat = excluded.will_eat, mess_hall_id = excluded.mess_hall_id`
				const rows = await tx`select id, will_eat, mess_hall_id from kitchen.arranchamento where user_id = ${s.userId} and date = ${DATE}`
				expect(rows).toHaveLength(1)
				expect(rows[0]).toMatchObject({ id: created.id, will_eat: false })
				expect(Number(rows[0]?.mess_hall_id)).toBe(s.otherMessHallId)

				// UPDATE pela view dispara o `set_updated_at` da tabela: o trigger troca o valor que o
				// UPDATE tenta gravar por now(). Sem o trigger, ficaria 2000-01-01.
				await tx`update kitchen.meal_forecasts set will_eat = true, updated_at = '2000-01-01' where id = ${created.id}`
				const [touched] = await tx`select updated_at > '2000-01-02'::timestamptz as refreshed from kitchen.arranchamento where id = ${created.id}`
				expect(touched.refreshed).toBe(true)

				// A leitura da `main` (fiscal, painel) e a da tabela nova veem a mesma linha.
				const [viaView] = await tx`select will_eat from kitchen.meal_forecasts where user_id = ${s.userId} and date = ${DATE} and meal = 'almoco'`
				expect(viaView.will_eat).toBe(true)

				// DELETE pela view (desarranchar, reset de treino pelo refeitório).
				await tx`delete from kitchen.meal_forecasts where mess_hall_id = ${s.otherMessHallId}`
				const [left] = await tx`select count(*)::int as n from kitchen.arranchamento where user_id = ${s.userId} and date = ${DATE}`
				expect(left.n).toBe(0)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("CHECK, unique e FKs da tabela valem para o que a `main` grava pela view", async (ctx) => {
		if (!compatLayerPresent) ctx.skip()
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				await expect(
					tx.savepoint(
						(sp) =>
							sp`insert into kitchen.meal_forecasts (date, user_id, meal, will_eat, mess_hall_id) values (${DATE}, ${s.userId}, 'lanche', true, ${s.messHallId})`
					)
				).rejects.toMatchObject({ code: "23514" })

				await tx`insert into kitchen.meal_forecasts (date, user_id, meal, will_eat, mess_hall_id) values (${DATE}, ${s.userId}, 'janta', true, ${s.messHallId})`
				await expect(
					tx.savepoint(
						(sp) =>
							sp`insert into kitchen.meal_forecasts (date, user_id, meal, will_eat, mess_hall_id) values (${DATE}, ${s.userId}, 'janta', false, ${s.messHallId})`
					)
				).rejects.toMatchObject({ code: "23505" })

				// Refeitório com arranchamento não sai (RESTRICT), e refeitório inexistente não entra.
				await expect(tx.savepoint((sp) => sp`delete from kitchen.mess_halls where id = ${s.messHallId}`)).rejects.toMatchObject({ code: "23503" })
				await expect(
					tx.savepoint(
						(sp) => sp`insert into kitchen.meal_forecasts (date, user_id, meal, will_eat, mess_hall_id) values (${DATE}, ${s.userId}, 'ceia', true, -1)`
					)
				).rejects.toMatchObject({ code: "23503" })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("o analytics lê pelo nome antigo (SQL já gerado) e pelo novo, como `analytics_reader`", async (ctx) => {
		if (!compatLayerPresent) ctx.skip()
		await expect(
			inRollback(sql, async (tx) => {
				await tx`set local role service_role`
				const [viaOld] = await tx`select sisub.execute_analytics_query(${`select count(*) as n from meal_forecasts where date = '${DATE}'`}) as r`
				const [viaNew] = await tx`select sisub.execute_analytics_query(${`select count(*) as n from arranchamento where date = '${DATE}'`}) as r`
				expect(viaOld.r).toEqual([{ n: 0 }])
				expect(viaNew.r).toEqual([{ n: 0 }])
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("a view tem os grants da tabela: servidor escreve, analytics lê, cliente não alcança", async (ctx) => {
		if (!compatLayerPresent) ctx.skip()
		const [grants] = await sql`
			select
				has_table_privilege('service_role', 'kitchen.meal_forecasts', 'select') as service_view,
				has_table_privilege('service_role', 'kitchen.meal_forecasts', 'insert')
					and has_table_privilege('service_role', 'kitchen.meal_forecasts', 'update')
					and has_table_privilege('service_role', 'kitchen.meal_forecasts', 'delete') as service_view_writes,
				has_table_privilege('service_role', 'kitchen.arranchamento', 'insert') as service_table,
				has_table_privilege('analytics_reader', 'kitchen.meal_forecasts', 'select') as analytics_view,
				has_table_privilege('analytics_reader', 'kitchen.arranchamento', 'select') as analytics_table,
				has_table_privilege('analytics_reader', 'kitchen.meal_forecasts', 'insert') as analytics_writes,
				has_table_privilege('anon', 'kitchen.meal_forecasts', 'select, insert, update, delete') as anon_view,
				has_table_privilege('authenticated', 'kitchen.meal_forecasts', 'select, insert, update, delete') as authenticated_view,
				has_table_privilege('authenticated', 'kitchen.arranchamento', 'select, insert, update, delete') as authenticated_table`
		expect(grants).toEqual({
			service_view: true,
			service_view_writes: true,
			service_table: true,
			analytics_view: true,
			analytics_table: true,
			analytics_writes: false,
			anon_view: false,
			authenticated_view: false,
			authenticated_table: false,
		})

		const [view] = await sql`
			select c.relkind::text as kind, coalesce(c.reloptions, '{}') @> array['security_invoker=true'] as invoker
			from pg_class c where c.oid = 'kitchen.meal_forecasts'::regclass`
		expect(view).toEqual({ kind: "v", invoker: true })
	})

	test("constraints e índices levam o nome novo; a tabela tem comentário", async (ctx) => {
		if (!compatLayerPresent) ctx.skip()
		const names = await sql<{ name: string }[]>`
			select conname as name from pg_constraint where conrelid = 'kitchen.arranchamento'::regclass
			union
			select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid where i.indrelid = 'kitchen.arranchamento'::regclass
			order by 1`
		expect(names.map((n) => n.name)).toEqual([
			"arranchamento_date_idx",
			"arranchamento_meal_check",
			"arranchamento_mess_hall_id_fkey",
			"arranchamento_mess_hall_id_idx",
			"arranchamento_pkey",
			"arranchamento_user_id_date_meal_key",
			"arranchamento_user_id_fkey",
		])
		const [comment] = await sql`select obj_description('kitchen.arranchamento'::regclass, 'pg_class') as text`
		expect(comment.text).toMatch(/^Arranchamento:/)
	})
})
