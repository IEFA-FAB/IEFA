/**
 * Integração — o que vale para `kitchen.arranchamento` depois do contract do lote 7
 * (20260927140000), quando a suíte de compatibilidade do expand já saiu.
 *
 * O arranchamento é o rastro de quem come onde: só o servidor escreve, o leitor do analytics lê, e
 * nenhum cliente alcança. O analytics responde pelo nome do glossário, e a tabela guarda as regras
 * que a tela do comensal pressupõe (uma linha por comensal, data e refeição; refeição do
 * vocabulário; refeitório existente). Uma migration futura que mexa nisso reprova aqui.
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

describeIf("kitchen.arranchamento: grants, regras e analytics (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("só o servidor escreve, o analytics lê e nenhum cliente alcança; o nome antigo não existe", async () => {
		const [grants] = await sql`
			select
				has_table_privilege('service_role', 'kitchen.arranchamento', 'select')
					and has_table_privilege('service_role', 'kitchen.arranchamento', 'insert')
					and has_table_privilege('service_role', 'kitchen.arranchamento', 'update')
					and has_table_privilege('service_role', 'kitchen.arranchamento', 'delete') as service_role,
				has_table_privilege('analytics_reader', 'kitchen.arranchamento', 'select') as analytics_reads,
				has_table_privilege('analytics_reader', 'kitchen.arranchamento', 'insert, update, delete') as analytics_writes,
				has_table_privilege('anon', 'kitchen.arranchamento', 'select, insert, update, delete') as anon,
				has_table_privilege('authenticated', 'kitchen.arranchamento', 'select, insert, update, delete') as authenticated,
				to_regclass('kitchen.meal_forecasts') is null as old_name_gone`
		expect(grants).toEqual({
			service_role: true,
			analytics_reads: true,
			analytics_writes: false,
			anon: false,
			authenticated: false,
			old_name_gone: true,
		})
	})

	test("o analytics responde pelo nome do glossário", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				await tx`set local role service_role`
				const [row] = await tx`select sisub.execute_analytics_query(${`select count(*) as n from arranchamento where date = '${DATE}'`}) as r`
				expect(row.r).toEqual([{ n: 0 }])
			})
		).resolves.toBe("rolled-back")
	})

	test("uma linha por comensal, data e refeição; refeição do vocabulário; refeitório existente", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-L7C', 'unit teste lote 7') returning id`
				const [messHall] =
					await tx`insert into kitchen.mess_halls (unit_id, code, display_name) values (${unit.id}, 'ZZTEST-L7C-MH', 'refeitório lote 7') returning id`
				const [user] = await tx`select id from auth.users limit 1`

				await tx`insert into kitchen.arranchamento (date, user_id, meal, will_eat, mess_hall_id) values (${DATE}, ${user.id}, 'janta', true, ${messHall.id})`
				await expect(
					tx.savepoint(
						(sp) =>
							sp`insert into kitchen.arranchamento (date, user_id, meal, will_eat, mess_hall_id) values (${DATE}, ${user.id}, 'janta', false, ${messHall.id})`
					)
				).rejects.toMatchObject({ code: "23505" })
				await expect(
					tx.savepoint(
						(sp) =>
							sp`insert into kitchen.arranchamento (date, user_id, meal, will_eat, mess_hall_id) values (${DATE}, ${user.id}, 'lanche', true, ${messHall.id})`
					)
				).rejects.toMatchObject({ code: "23514" })
				await expect(tx.savepoint((sp) => sp`delete from kitchen.mess_halls where id = ${messHall.id}`)).rejects.toMatchObject({ code: "23503" })
			})
		).resolves.toBe("rolled-back")
	})

	test("constraints e índices levam o nome do glossário", async () => {
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
	})
})
