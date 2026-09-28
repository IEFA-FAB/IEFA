/**
 * Integração — camada de compatibilidade do lote 6 da linguagem ubíqua (20260927180000: SARAM),
 * exercitada pelo caminho LEGADO: é o que o código da `main` em produção faz entre a aplicação do
 * expand e o deploy do código novo.
 *
 *   * `core.user_data."nrOrdem"` convive com `saram`, com um trigger que espelha os dois sentidos e
 *     recusa valores divergentes: o upsert do vínculo do SARAM da `main`
 *     (`insert … on conflict (id) do update set email, "nrOrdem"`) grava a coluna nova, e o código
 *     novo (`saram`) grava a antiga;
 *   * `core.person.nr_ordem` convive com `saram` do mesmo jeito; o UNIQUE antigo e o novo recusam o
 *     mesmo SARAM em duas pessoas (o sucont traduz o 23505 de qualquer um);
 *   * `core.person_identity` mantém `nr_ordem` e ganha `saram`; `core.v_user_identity` junta pela
 *     coluna nova;
 *   * o espelho do cadastro de pessoal (`core.user_military_data."nrOrdem"`) não muda.
 *
 * Sai no contract (20260927190000) junto com a camada que ele testa. Entre a aplicação do contract
 * e o merge do PR dele, o banco já não tem as colunas antigas e a `main` ainda tem este arquivo: os
 * casos se pulam quando a coluna nova existe e a antiga não, para não avermelhar o gate de todo PR
 * nessa janela. Antes do expand (a coluna nova ainda não existe), falham.
 *
 * Banco real, `sql.begin` + savepoints + ROLLBACK final: nada persiste.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, type TestContext, test } from "vitest"
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

/** SARAM de teste: dígitos com prefixo que não colide com o efetivo real. */
const testSaram = (suffix: string) => `ZZL6-${Date.now().toString(36)}-${suffix}`

describeIf("compatibilidade do lote 6 (SARAM: nr_ordem/nrOrdem → saram) (DB)", () => {
	let sql: postgres.Sql

	/** Contract já aplicado: a camada que este arquivo testa não existe mais. */
	let contracted = false

	beforeAll(async () => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
		const [state] = await sql<{ legacy: boolean; current: boolean }[]>`
			select
				exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'user_data' and column_name = 'nrOrdem') as legacy,
				exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'user_data' and column_name = 'saram') as current`
		contracted = state.current && !state.legacy
	})

	const skipIfContracted = (ctx: TestContext) => {
		if (contracted) ctx.skip("contract 20260927190000 aplicado: a camada de compatibilidade já saiu")
	}

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("as colunas antigas e as novas convivem, anuláveis, com unicidade e índice próprios", async (ctx) => {
		skipIfContracted(ctx)
		const columns = await sql<{ name: string; nullable: string }[]>`
			select table_name || '.' || column_name as name, is_nullable as nullable
			from information_schema.columns
			where table_schema = 'core'
				and ((table_name = 'person' and column_name in ('nr_ordem', 'saram'))
					or (table_name = 'user_data' and column_name in ('nrOrdem', 'saram')))
			order by 1`
		expect(columns).toEqual([
			{ name: "person.nr_ordem", nullable: "YES" },
			{ name: "person.saram", nullable: "YES" },
			{ name: "user_data.nrOrdem", nullable: "YES" },
			{ name: "user_data.saram", nullable: "YES" },
		])
		const [state] = await sql<{ person_unique: boolean; user_data_index: boolean; view_columns: string[] }[]>`
			select
				exists (select 1 from pg_constraint where conname = 'person_saram_key' and contype = 'u') as person_unique,
				to_regclass('core.user_data_saram_idx') is not null as user_data_index,
				(select array_agg(column_name::text order by ordinal_position) from information_schema.columns
					where table_schema = 'core' and table_name = 'person_identity' and column_name in ('nr_ordem', 'saram')) as view_columns`
		expect(state).toEqual({ person_unique: true, user_data_index: true, view_columns: ["nr_ordem", "saram"] })
	})

	test("vínculo do SARAM pelo upsert da main: a coluna nova recebe o valor, e a volta também espelha", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const [account] = await tx<{ id: string; email: string }[]>`select id, email from core.user_data order by created_at limit 1`
				if (!account) throw new Error("core.user_data vazia")
				const saram = testSaram("u")

				// Caminho da `main` (`upsertUserDataReclaimingEmail`): insert com a coluna antiga, conflito
				// pelo `id`, update das duas colunas que ele conhece.
				await tx`
					insert into core.user_data (id, email, "nrOrdem") values (${account.id}, ${account.email}, ${saram})
					on conflict (id) do update set email = excluded.email, "nrOrdem" = excluded."nrOrdem"`
				const [afterLegacy] = await tx<{ legacy: string | null; current: string | null }[]>`
					select "nrOrdem" as legacy, saram as current from core.user_data where id = ${account.id}`
				expect(afterLegacy).toEqual({ legacy: saram, current: saram })

				// Caminho novo: grava `saram`, a antiga acompanha; limpar uma limpa a outra.
				const other = testSaram("v")
				await tx`update core.user_data set saram = ${other} where id = ${account.id}`
				const [afterNew] = await tx<{ legacy: string | null }[]>`select "nrOrdem" as legacy from core.user_data where id = ${account.id}`
				expect(afterNew.legacy).toBe(other)
				await tx`update core.user_data set "nrOrdem" = null where id = ${account.id}`
				const [cleared] = await tx<{ current: string | null }[]>`select saram as current from core.user_data where id = ${account.id}`
				expect(cleared.current).toBeNull()

				// As duas com valores diferentes no mesmo update: recusado.
				const divergent = await refused(
					tx,
					(sp) => sp`update core.user_data set saram = ${testSaram("a")}, "nrOrdem" = ${testSaram("b")} where id = ${account.id}`
				)
				expect(divergent).toMatch(/divergem/)
			})
		).resolves.toBe("rolled-back")
	})

	test("pessoa: nr_ordem da main e saram do código novo espelham, e o SARAM repetido é recusado", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const saram = testSaram("p")
				// Como o sucont da `main` vincula: `update person set nr_ordem`.
				const [person] = await tx<{ id: string }[]>`insert into core.person (display_name) values ('[TEST] lote 6') returning id`
				await tx`update core.person set nr_ordem = ${saram} where id = ${person.id}`
				const [linked] = await tx<{ legacy: string | null; current: string | null }[]>`
					select nr_ordem as legacy, saram as current from core.person where id = ${person.id}`
				expect(linked).toEqual({ legacy: saram, current: saram })

				// A view mantém a coluna antiga para a `main` e já tem a nova.
				const [identity] = await tx<{ nr_ordem: string | null; saram: string | null }[]>`
					select nr_ordem, saram from core.person_identity where id = ${person.id}`
				expect(identity).toEqual({ nr_ordem: saram, saram })

				// Código novo: insert por `saram` preenche a antiga.
				const second = testSaram("q")
				const [created] = await tx<{ legacy: string | null }[]>`
					insert into core.person (display_name, saram) values ('[TEST] lote 6 b', ${second}) returning nr_ordem as legacy`
				expect(created.legacy).toBe(second)

				// O mesmo SARAM em outra pessoa, por qualquer das duas colunas: 23505.
				const byLegacy = await refused(tx, (sp) => sp`insert into core.person (display_name, nr_ordem) values ('[TEST] dup', ${saram})`)
				expect(byLegacy).toMatch(/person_(nr_ordem|saram)_key/)
				const byNew = await refused(tx, (sp) => sp`insert into core.person (display_name, saram) values ('[TEST] dup', ${saram})`)
				expect(byNew).toMatch(/person_(nr_ordem|saram)_key/)

				const divergent = await refused(
					tx,
					(sp) => sp`insert into core.person (display_name, nr_ordem, saram) values ('[TEST] div', ${testSaram("x")}, ${testSaram("y")})`
				)
				expect(divergent).toMatch(/divergem/)
			})
		).resolves.toBe("rolled-back")
	})

	test("as views do servidor juntam pela coluna nova; o espelho do cadastro não mudou", async (ctx) => {
		skipIfContracted(ctx)
		const [state] = await sql<{ v_user: string; analytics: string; mirror: boolean }[]>`
			select
				pg_get_viewdef('core.v_user_identity'::regclass) as v_user,
				pg_get_viewdef('analytics.v_user_identity'::regclass) as analytics,
				exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'user_military_data' and column_name = 'nrOrdem') as mirror`
		expect(state.v_user).toMatch(/ud\.saram/)
		expect(state.v_user).not.toMatch(/ud\."nrOrdem"/)
		expect(state.analytics).toMatch(/ud\.saram/)
		expect(state.mirror).toBe(true)
	})
})
