/**
 * Integração — camada de compatibilidade do lote 8b da linguagem ubíqua (20260927150000: o efetivo
 * por refeitório), exercitada pelo caminho LEGADO: é o que o código da `main` em produção faz entre
 * a aplicação do expand e o deploy do código novo.
 *
 *   * `kitchen.rancho` é view auto-updatable sobre `kitchen.mess_hall_workforce`, com os defaults
 *     da tabela: o `insert … on conflict (code) do nothing` do roster (o Drizzle manda `default` nas
 *     colunas omitidas), o `update` e o `select` passam pela view;
 *   * `kitchen.workforce_submission.mess_hall_workforce_id` convive com `rancho_id`, com um trigger
 *     que espelha os dois sentidos e recusa valores divergentes; a antiga fica anulável (o trigger a
 *     preenche) e mantém o unique `(survey_id, rancho_id)` que o `on conflict` da `main` usa;
 *   * o passo do reset do treino da `main` (`where rancho_id in (select id from kitchen.rancho …)`)
 *     continua apagando as respostas da unidade;
 *   * as views `core.rancho` e `core.workforce_submission` continuam legíveis até o contract.
 *
 * Sai no contract (20260927160000) junto com a camada que ele testa. Entre a aplicação do contract
 * e o merge do PR dele, o banco já não tem os nomes antigos e a `main` ainda tem este arquivo: os
 * casos se pulam quando a tabela nova existe e a view antiga não, para não avermelhar o gate de
 * todo PR nessa janela. Antes do expand (a tabela nova ainda não existe), falham.
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

/** Uma OM, dois refeitórios no levantamento gravados pelo nome ANTIGO e uma competência. */
async function seed(tx: postgres.TransactionSql) {
	const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-L8B', 'unit teste lote 8b') returning id`
	// Insert como o Drizzle da `main` o monta: todas as colunas, `default` nas que ele não informa.
	const [first] = await tx`
		insert into kitchen.rancho (id, unit_id, elo_code, code, display_name, mess_hall_id, kitchen_id, produces_own_meals, active, notes, created_at, updated_at)
		values (default, ${unit.id}, 'ZZTEST-L8B', 'zztest-l8b-a', 'Refeitório A', null, null, default, default, null, default, default)
		on conflict (code) do nothing
		returning id, produces_own_meals, active, created_at`
	const [second] = await tx`
		insert into kitchen.rancho (unit_id, elo_code, code, display_name) values (${unit.id}, 'ZZTEST-L8B', 'zztest-l8b-b', 'Refeitório B') returning id`
	// Data de referência fora de qualquer competência real (a coluna é unique).
	const [survey] = await tx`insert into kitchen.workforce_survey (reference_date, title) values ('1999-01-01', 'competência teste lote 8b') returning id`
	return {
		unitId: Number(unit.id),
		firstId: Number(first.id),
		firstDefaults: { produces_own_meals: first.produces_own_meals, active: first.active, hasCreatedAt: first.created_at != null },
		secondId: Number(second.id),
		surveyId: survey.id as string,
	}
}

describeIf("compatibilidade do lote 8b (efetivo por refeitório: kitchen.rancho → kitchen.mess_hall_workforce) (DB)", () => {
	let sql: postgres.Sql

	/** Contract já aplicado: a camada que este arquivo testa não existe mais. */
	let contracted = false

	beforeAll(async () => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
		const [state] = await sql<{ legacy: boolean; current: boolean }[]>`
			select to_regclass('kitchen.rancho') is not null as legacy, to_regclass('kitchen.mess_hall_workforce') is not null as current`
		contracted = state.current && !state.legacy
	})

	const skipIfContracted = (ctx: TestContext) => {
		if (contracted) ctx.skip("contract 20260927160000 aplicado: a camada de compatibilidade já saiu")
	}

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("a tabela tem o nome novo e o antigo é uma view security_invoker só do servidor", async (ctx) => {
		skipIfContracted(ctx)
		const [state] = await sql<{ table_kind: string; view_kind: string; invoker: boolean; client: boolean; server: boolean }[]>`
			select
				(select relkind::text from pg_class where oid = 'kitchen.mess_hall_workforce'::regclass) as table_kind,
				(select relkind::text from pg_class where oid = 'kitchen.rancho'::regclass) as view_kind,
				(select coalesce(reloptions, '{}') @> array['security_invoker=true'] from pg_class where oid = 'kitchen.rancho'::regclass) as invoker,
				has_table_privilege('authenticated', 'kitchen.rancho', 'select') or has_table_privilege('anon', 'kitchen.rancho', 'select') as client,
				has_table_privilege('service_role', 'kitchen.rancho', 'insert') as server`
		expect(state).toEqual({ table_kind: "r", view_kind: "v", invoker: true, client: false, server: true })
	})

	test("a coluna antiga fica anulável; a nova, obrigatória, com FK e unique próprios", async (ctx) => {
		skipIfContracted(ctx)
		const columns = await sql<{ name: string; nullable: string }[]>`
			select column_name as name, is_nullable as nullable
			from information_schema.columns
			where table_schema = 'kitchen' and table_name = 'workforce_submission' and column_name in ('rancho_id', 'mess_hall_workforce_id')
			order by 1`
		expect(columns).toEqual([
			{ name: "mess_hall_workforce_id", nullable: "NO" },
			{ name: "rancho_id", nullable: "YES" },
		])
		const indexes = await sql<{ name: string; def: string }[]>`
			select indexrelid::regclass::text as name, pg_get_indexdef(indexrelid) as def
			from pg_index where indrelid = 'kitchen.workforce_submission'::regclass and indisunique and not indisprimary
			order by 1`
		expect(indexes.map((i) => i.name)).toEqual(["kitchen.workforce_submission_mess_hall_workforce_uniq", "kitchen.workforce_submission_uniq"])
		const [fk] = await sql<{ target: string }[]>`
			select confrelid::regclass::text as target from pg_constraint where conname = 'workforce_submission_mess_hall_workforce_id_fkey'`
		expect(fk?.target).toBe("kitchen.mess_hall_workforce")
	})

	test("roster pelo nome antigo: defaults, on conflict pelo code, update e leitura pela view", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				expect(s.firstDefaults).toEqual({ produces_own_meals: true, active: true, hasCreatedAt: true })

				// O code repetido não duplica (a `main` traduz o vazio em "já existe").
				const replay = await tx`
					insert into kitchen.rancho (unit_id, elo_code, code, display_name) values (${s.unitId}, 'ZZTEST-L8B', 'zztest-l8b-a', 'outro')
					on conflict (code) do nothing returning id`
				expect(replay).toHaveLength(0)

				const [updated] = await tx`
					update kitchen.rancho set display_name = 'Refeitório A (oficiais)', updated_at = now() where id = ${s.firstId} returning display_name`
				expect(updated.display_name).toBe("Refeitório A (oficiais)")

				const [table] = await tx`select display_name, code from kitchen.mess_hall_workforce where id = ${s.firstId}`
				expect(table).toEqual({ display_name: "Refeitório A (oficiais)", code: "zztest-l8b-a" })

				const [core] = await tx`select count(*)::int as n from core.rancho where unit_id = ${s.unitId}`
				expect(core.n).toBe(2)
			})
		).resolves.toBe("rolled-back")
	})

	test("resposta: o código antigo grava e lê rancho_id, o novo mess_hall_workforce_id", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				const read = async (id: string) => {
					const [row] = await tx`select rancho_id, mess_hall_workforce_id, declared_total from kitchen.workforce_submission where id = ${id}`
					return { rancho_id: Number(row.rancho_id), mess_hall_workforce_id: Number(row.mess_hall_workforce_id), declared_total: row.declared_total }
				}

				// Upsert da `main` (`saveWorkforceSubmission`), com o unique antigo como árbitro.
				const [legacy] = await tx`
					insert into kitchen.workforce_submission (survey_id, rancho_id, declared_total, submitted_at)
					values (${s.surveyId}, ${s.firstId}, 10, now())
					on conflict (survey_id, rancho_id) do update set declared_total = excluded.declared_total, updated_at = now()
					returning id`
				expect(await read(legacy.id)).toEqual({ rancho_id: s.firstId, mess_hall_workforce_id: s.firstId, declared_total: 10 })

				// O mesmo upsert de novo cai no do update, sem duplicar.
				await tx`
					insert into kitchen.workforce_submission (survey_id, rancho_id, declared_total)
					values (${s.surveyId}, ${s.firstId}, 12)
					on conflict (survey_id, rancho_id) do update set declared_total = excluded.declared_total`
				expect(await read(legacy.id)).toMatchObject({ declared_total: 12 })

				// Upsert do código novo, pelo unique novo: acha a mesma linha.
				const [current] = await tx`
					insert into kitchen.workforce_submission (survey_id, mess_hall_workforce_id, declared_total)
					values (${s.surveyId}, ${s.firstId}, 15)
					on conflict (survey_id, mess_hall_workforce_id) do update set declared_total = excluded.declared_total
					returning id`
				expect(current.id).toBe(legacy.id)
				expect(await read(legacy.id)).toEqual({ rancho_id: s.firstId, mess_hall_workforce_id: s.firstId, declared_total: 15 })

				// Insert novo só com a coluna nova: o espelho preenche a antiga.
				const [second] = await tx`
					insert into kitchen.workforce_submission (survey_id, mess_hall_workforce_id) values (${s.surveyId}, ${s.secondId}) returning id`
				expect(await read(second.id)).toMatchObject({ rancho_id: s.secondId, mess_hall_workforce_id: s.secondId })

				// Update por qualquer uma das duas leva a outra junto; o que não cita nenhuma não mexe.
				await tx`update kitchen.workforce_submission set declared_total = 3 where id = ${second.id}`
				expect(await read(second.id)).toMatchObject({ rancho_id: s.secondId, mess_hall_workforce_id: s.secondId, declared_total: 3 })
				const [other] = await tx`
					insert into kitchen.workforce_survey (reference_date, title) values ('1999-02-01', 'outra competência teste lote 8b') returning id`
				const [moved] = await tx`
					insert into kitchen.workforce_submission (survey_id, rancho_id) values (${other.id}, ${s.firstId}) returning id`
				await tx`update kitchen.workforce_submission set rancho_id = ${s.secondId} where id = ${moved.id}`
				expect(await read(moved.id)).toMatchObject({ rancho_id: s.secondId, mess_hall_workforce_id: s.secondId })
				await tx`update kitchen.workforce_submission set mess_hall_workforce_id = ${s.firstId} where id = ${moved.id}`
				expect(await read(moved.id)).toMatchObject({ rancho_id: s.firstId, mess_hall_workforce_id: s.firstId })

				// A view do núcleo continua lendo pela coluna antiga.
				const [core] = await tx`select rancho_id from core.workforce_submission where id = ${legacy.id}`
				expect(Number(core.rancho_id)).toBe(s.firstId)
			})
		).resolves.toBe("rolled-back")
	})

	test("valores divergentes e resposta sem refeitório são recusados", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				expect(
					await refused(
						tx,
						(sp) => sp`
							insert into kitchen.workforce_submission (survey_id, rancho_id, mess_hall_workforce_id) values (${s.surveyId}, ${s.firstId}, ${s.secondId})`
					)
				).toMatch(/divergem/)
				expect(await refused(tx, (sp) => sp`insert into kitchen.workforce_submission (survey_id) values (${s.surveyId})`)).toMatch(/mess_hall_workforce_id/)

				// As duas mudadas no mesmo UPDATE, para valores diferentes: recusa. Só uma mudada: vale ela.
				const [third] = await tx`
					insert into kitchen.mess_hall_workforce (unit_id, elo_code, code, display_name)
					values (${s.unitId}, 'ZZTEST-L8B', 'zztest-l8b-c', 'Refeitório C') returning id`
				const [row] = await tx`
					insert into kitchen.workforce_submission (survey_id, rancho_id) values (${s.surveyId}, ${s.firstId}) returning id`
				expect(
					await refused(
						tx,
						(sp) => sp`update kitchen.workforce_submission set rancho_id = ${s.secondId}, mess_hall_workforce_id = ${third.id} where id = ${row.id}`
					)
				).toMatch(/divergem/)
			})
		).resolves.toBe("rolled-back")
	})

	test("o passo do reset do treino da `main` apaga as respostas da unidade pelos nomes antigos", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				await tx`insert into kitchen.workforce_submission (survey_id, mess_hall_workforce_id) values (${s.surveyId}, ${s.firstId})`
				await tx`insert into kitchen.workforce_submission (survey_id, mess_hall_workforce_id) values (${s.surveyId}, ${s.secondId})`
				const deleted = await tx`
					delete from kitchen.workforce_submission where rancho_id in (select id from kitchen.rancho where unit_id = ${s.unitId}) returning 1`
				expect(deleted).toHaveLength(2)
			})
		).resolves.toBe("rolled-back")
	})
})
