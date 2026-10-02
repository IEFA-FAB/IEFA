/**
 * Integração — matriz de efetivo por refeitório depois do contract 20260927160000 (lote 8b da
 * linguagem ubíqua): o que a camada de compatibilidade do expand testava e continua valendo com os
 * nomes do glossário, pelo caminho das operações de `@iefa/sisub-domain`.
 *
 *   * a resposta do refeitório (`kitchen.workforce_submission.mess_hall_workforce_id`) é gravada
 *     por upsert com `workforce_submission_mess_hall_workforce_uniq` como árbitro: salvar de novo a
 *     mesma competência atualiza, não duplica;
 *   * salvar tudo em branco apaga a resposta (ausência ≠ zero), e a observação exige a resposta;
 *   * o roster (`kitchen.mess_hall_workforce`) recusa `code` repetido e resposta sem refeitório;
 *   * o passo do reset do treino apaga as respostas da unidade pelos nomes novos.
 *
 * Banco real, transação do Drizzle sempre desfeita: nada persiste.
 */
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { addWorkforceNote, createMessHallWorkforce, fetchWorkforceMatrix, saveWorkforceSubmission, updateMessHallWorkforce } from "@iefa/sisub-domain"
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"
import { fullAccessCtx } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

/** Sentinela do rollback: a transação termina SEMPRE desfeita. */
class Rollback extends Error {}

async function inRollback(db: SisubDb, fn: (tx: SisubDb) => Promise<void>): Promise<string> {
	try {
		await db.transaction(async (tx) => {
			await fn(tx as unknown as SisubDb)
			throw new Rollback()
		})
	} catch (e) {
		if (e instanceof Rollback) return "rolled-back"
		throw e
	}
	return "committed"
}

/** Recusa esperada dentro da transação, isolada num savepoint para a transação seguir. */
async function refused(tx: SisubDb, body: (sp: SisubDb) => Promise<unknown>): Promise<string> {
	try {
		await tx.transaction(async (sp) => {
			await body(sp as unknown as SisubDb)
		})
	} catch (err) {
		const e = err as Error & { cause?: Error }
		return `${e.message} ${e.cause?.message ?? ""}`
	}
	return "aceito"
}

type Row = Record<string, unknown>

/** Uma OM, dois refeitórios no levantamento e uma competência aberta; o ator é um usuário real. */
async function seed(tx: SisubDb) {
	const [actor] = (await tx.execute(sql`select id from auth.users limit 1`)) as unknown as Row[]
	const ctx = fullAccessCtx(String(actor?.id))
	const [unit] = (await tx.execute(
		sql`insert into core.units (code, display_name) values ('ZZTEST-L8B-OP', 'unit teste lote 8b') returning id`
	)) as unknown as Row[]
	const unitId = Number(unit?.id)
	const first = await createMessHallWorkforce(tx, ctx, {
		unitId,
		eloCode: "ZZTEST-L8B-OP",
		code: "zztest-l8b-op-a",
		displayName: "Refeitório A",
		producesOwnMeals: true,
	})
	const second = await createMessHallWorkforce(tx, ctx, {
		unitId,
		eloCode: "ZZTEST-L8B-OP",
		code: "zztest-l8b-op-b",
		displayName: "Refeitório B",
		producesOwnMeals: true,
	})
	// Data de referência fora de qualquer competência real (a coluna é unique).
	const [survey] = (await tx.execute(
		sql`insert into kitchen.workforce_survey (reference_date, title) values ('1999-03-01', 'competência teste lote 8b') returning id`
	)) as unknown as Row[]
	const [category] = (await tx.execute(
		sql`select code from kitchen.workforce_category where deleted_at is null order by sort_order limit 1`
	)) as unknown as Row[]
	return {
		ctx,
		unitId,
		firstId: Number(first.id),
		secondId: Number(second.id),
		surveyId: String(survey?.id),
		categoryCode: String(category?.code),
	}
}

describeSupabaseIntegration("matriz de efetivo por refeitório (DB)", () => {
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(() => {
		const url = getSisubDatabaseUrl()
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		const t = createSisubTestDb(url)
		db = t.db
		closeDb = t.close
	})

	afterAll(async () => {
		await closeDb?.()
	})

	test("salvar a resposta de novo atualiza a mesma linha; em branco, apaga", async () => {
		if (!db) throw new Error("db ausente")
		await expect(
			inRollback(db, async (tx) => {
				const s = await seed(tx)
				const saved = await saveWorkforceSubmission(tx, s.ctx, {
					surveyId: s.surveyId,
					messHallWorkforceId: s.firstId,
					entries: [{ categoryCode: s.categoryCode, headcount: 10 }],
					declaredTotal: 10,
				})
				expect(saved).toMatchObject({ messHallWorkforceId: s.firstId, answered: true, total: 10, declaredTotal: 10 })

				const again = await saveWorkforceSubmission(tx, s.ctx, {
					surveyId: s.surveyId,
					messHallWorkforceId: s.firstId,
					entries: [{ categoryCode: s.categoryCode, headcount: 12 }],
					declaredTotal: 13,
				})
				expect(again).toMatchObject({ total: 12, declaredTotal: 13, declaredTotalDiverges: true })
				const count = (await tx.execute(
					sql`select count(*)::int as n from kitchen.workforce_submission where survey_id = ${s.surveyId} and mess_hall_workforce_id = ${s.firstId}`
				)) as unknown as Row[]
				expect(count[0]?.n).toBe(1)

				const note = await addWorkforceNote(tx, s.ctx, {
					surveyId: s.surveyId,
					messHallWorkforceId: s.firstId,
					kind: "leave",
					quantity: 2,
					detail: "2 afastados",
				})
				expect(note.kind).toBe("leave")

				// Sem resposta, a observação não tem onde ficar.
				expect(
					await refused(tx, (sp) =>
						addWorkforceNote(sp, s.ctx, { surveyId: s.surveyId, messHallWorkforceId: s.secondId, kind: "leave", quantity: 1, detail: "x" })
					)
				).toMatch(/Preencha o efetivo do refeitório/)

				const matrix = await fetchWorkforceMatrix(tx, s.ctx, { unitId: s.unitId, surveyId: s.surveyId })
				expect(matrix.mess_hall_workforce.map((r) => r.messHallWorkforceId).sort()).toEqual([s.firstId, s.secondId].sort())
				expect(matrix.summary).toMatchObject({ messHalls: 2, answeredMessHalls: 1 })

				const cleared = await saveWorkforceSubmission(tx, s.ctx, {
					surveyId: s.surveyId,
					messHallWorkforceId: s.firstId,
					entries: [{ categoryCode: s.categoryCode, headcount: null }],
					declaredTotal: null,
				})
				expect(cleared.answered).toBe(false)
			})
		).resolves.toBe("rolled-back")
	})

	test("o roster recusa code repetido e a resposta exige refeitório existente", async () => {
		if (!db) throw new Error("db ausente")
		await expect(
			inRollback(db, async (tx) => {
				const s = await seed(tx)
				expect(
					await refused(tx, (sp) =>
						createMessHallWorkforce(sp, s.ctx, {
							unitId: s.unitId,
							eloCode: "ZZTEST-L8B-OP",
							code: "zztest-l8b-op-a",
							displayName: "outro",
							producesOwnMeals: true,
						})
					)
				).toMatch(/Já existe refeitório no levantamento/)

				const updated = await updateMessHallWorkforce(tx, s.ctx, { messHallWorkforceId: s.secondId, displayName: "Refeitório B (oficiais)" })
				expect(updated.display_name).toBe("Refeitório B (oficiais)")

				expect(await refused(tx, (sp) => sp.execute(sql`insert into kitchen.workforce_submission (survey_id) values (${s.surveyId})`))).toMatch(
					/mess_hall_workforce_id/
				)
				expect(
					await refused(tx, (sp) => sp.execute(sql`insert into kitchen.workforce_submission (survey_id, mess_hall_workforce_id) values (${s.surveyId}, -1)`))
				).toMatch(/workforce_submission_mess_hall_workforce_id_fkey/)
			})
		).resolves.toBe("rolled-back")
	})

	test("o passo do reset do treino apaga as respostas da unidade pelos nomes novos", async () => {
		if (!db) throw new Error("db ausente")
		await expect(
			inRollback(db, async (tx) => {
				const s = await seed(tx)
				for (const id of [s.firstId, s.secondId]) {
					await saveWorkforceSubmission(tx, s.ctx, {
						surveyId: s.surveyId,
						messHallWorkforceId: id,
						entries: [{ categoryCode: s.categoryCode, headcount: 1 }],
						declaredTotal: null,
					})
				}
				// Mesmo SQL do passo `kitchen.workforce_submission` de RESET_STEPS (`operations/training.ts`).
				const deleted = (await tx.execute(
					sql`delete from kitchen.workforce_submission where mess_hall_workforce_id in (select id from kitchen.mess_hall_workforce where unit_id = ${s.unitId}) returning 1`
				)) as unknown as Row[]
				expect(deleted).toHaveLength(2)
			})
		).resolves.toBe("rolled-back")
	})
})
