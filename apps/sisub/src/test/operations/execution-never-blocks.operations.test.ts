/**
 * Integração — a execução nunca trava (migration 20260926217000_execution_never_blocks).
 *
 * "O rancho é rápido e dinâmico": o que falta na execução vira pendência registrada, e o
 * bloqueio fica só onde é imprescindível. Contra o banco real, o que só ele prova:
 *
 * Domínio (seeder + limpeza):
 *  - o turno (`kitchen-production:1`) inclui preparação no cardápio de HOJE, com a tarefa do
 *    quadro e quem/quando/por quê; outra data e `kitchen:1` são recusados (PC-TRN-06);
 *  - preparação que não existe nasce provisória, é reaproveitada pelo nome, não entra em
 *    cardápio-modelo, e sai da pendência quando a ficha é salva (PC-TRN-07, GC-EXE-02);
 *  - a inclusão aparece para a nutricionista e some ao revisar (GC-EXE-01);
 *  - o turno registra o que ENTROU na substituição (PC-TRN-01);
 *  - a tarefa do dia nasce sem o quadro aberto (EST-SAI-03).
 *
 * SQL (transação com ROLLBACK):
 *  - o dia esquecido aberto fecha sozinho, `closed_unexplained` só com desvio relevante (EST-SAI-05);
 *  - a saída tardia grava a data real e o motivo, e recusa competência fechada e dupla baixa (EST-SAI-01);
 *  - a contagem não trava pela tarefa já baixada e aceita ressalva registrada (EST-CNT-02);
 *  - a sobra entra numa congelada provisória da cozinha, reaproveitada pelo nome (PC-TRN-08).
 *
 * NÃO rodado no PR que o introduziu: a migration ainda não estava aplicada no banco compartilhado.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	addExecutionMenuItem,
	brasiliaToday,
	createMissingProductionTasks,
	createTemplate,
	fetchExecutionReviewStatus,
	fetchProductionBoard,
	recordProductionSubstitution,
	reviewExecutionMenuItem,
	saveRecipeEdit,
	type UserContext,
} from "@iefa/sisub-domain"
import postgres from "postgres"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const nutritionist = fullAccessCtx()

function shiftCtx(kitchenId: number, level = 1): UserContext {
	return {
		userId: "00000000-0000-4000-8000-000000000003",
		permissions: [{ module: "kitchen-production", level, kitchen_id: kitchenId, unit_id: null, mess_hall_id: null }],
		aal: 1,
		lastFactorAt: null,
		origin: "session",
	}
}

function plannerReadCtx(kitchenId: number): UserContext {
	return {
		userId: "00000000-0000-4000-8000-000000000004",
		permissions: [{ module: "kitchen", level: 1, kitchen_id: kitchenId, unit_id: null, mess_hall_id: null }],
		aal: 1,
		lastFactorAt: null,
		origin: "session",
	}
}

/** "AAAA-MM-DD" + n dias, em aritmética de data civil (sem fuso). */
function plusDays(isoDate: string, days: number): string {
	const d = new Date(`${isoDate}T12:00:00Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

describeSupabaseIntegration("execução do dia pelo turno (domínio)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("production_task")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	/** Cozinha + refeição. A limpeza das receitas da cozinha roda DEPOIS da dos cardápios (LIFO). */
	async function setupKitchen() {
		if (!seeder) throw new Error("no seeder")
		const { id: kitchenId } = await seeder.seedKitchen()
		seeder.trackWhere("recipes", "kitchen_id", kitchenId)
		seeder.trackFn(() => seeder?.purgeKitchenMenus(kitchenId) ?? Promise.resolve())
		seeder.trackWhere("production_task", "kitchen_id", kitchenId)
		const mealTypeId = await seeder.seedMealType({ kitchenId })
		return { kitchenId, mealTypeId }
	}

	test("o turno inclui preparação do catálogo HOJE: cardápio, item com quem/quando/por quê e tarefa no quadro", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId } = await setupKitchen()
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 10 })
		const today = brasiliaToday()

		const result = await addExecutionMenuItem(db, shiftCtx(kitchenId), {
			kitchenId,
			serviceDate: today,
			mealTypeId,
			recipeId,
			plannedPortionQuantity: 80,
			reason: "[TEST] faltou o feijão",
		})
		expect(result.provisional).toBe(false)

		const board = await fetchProductionBoard(db, shiftCtx(kitchenId), { kitchenId, date: today })
		const item = board.find((i) => i.menuItem.id === result.menuItemId)
		expect(item?.task.id).toBe(result.taskId)
		expect(item?.task.status).toBe("PENDING")
		expect(item?.menuItem.execution?.reason).toBe("[TEST] faltou o feijão")
		expect(Number(item?.menuItem.planned_portion_quantity)).toBe(80)

		// a pendência chega à nutricionista e sai quando ela revisa
		const before = await fetchExecutionReviewStatus(db, nutritionist, { kitchenId })
		expect(before.addedItems.map((a) => a.menuItemId)).toContain(result.menuItemId)
		await reviewExecutionMenuItem(db, nutritionist, { menuItemId: result.menuItemId })
		const after = await fetchExecutionReviewStatus(db, nutritionist, { kitchenId })
		expect(after.addedItems.map((a) => a.menuItemId)).not.toContain(result.menuItemId)
		// o turno não revisa: revisar é planejamento
		await expect(reviewExecutionMenuItem(db, shiftCtx(kitchenId), { menuItemId: result.menuItemId })).rejects.toThrow()
	}, 60_000)

	test("outra data é planejamento, e quem só lê o cardápio não inclui", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId } = await setupKitchen()
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 10 })
		const tomorrow = plusDays(brasiliaToday(), 1)

		await expect(
			addExecutionMenuItem(db, shiftCtx(kitchenId), { kitchenId, serviceDate: tomorrow, mealTypeId, recipeId, reason: "[TEST] amanhã" })
		).rejects.toThrow(/só no cardápio de hoje/)
		await expect(
			addExecutionMenuItem(db, plannerReadCtx(kitchenId), { kitchenId, serviceDate: brasiliaToday(), mealTypeId, recipeId, reason: "[TEST] sem grant" })
		).rejects.toThrow()
	}, 60_000)

	test("preparação que não existe nasce provisória, é reaproveitada pelo nome, não entra em cardápio-modelo e sai da pendência com a ficha salva", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId } = await setupKitchen()
		const today = brasiliaToday()
		const name = `[TEST] Farofa ${Date.now()}`

		const first = await addExecutionMenuItem(db, shiftCtx(kitchenId), {
			kitchenId,
			serviceDate: today,
			mealTypeId,
			provisionalRecipeName: name,
			reason: "[TEST] sobrou ovo",
		})
		expect(first.provisional).toBe(true)
		const second = await addExecutionMenuItem(db, shiftCtx(kitchenId), {
			kitchenId,
			serviceDate: today,
			mealTypeId,
			provisionalRecipeName: name.toUpperCase(),
			reason: "[TEST] de novo",
		})
		expect(second.recipeId).toBe(first.recipeId)

		// funciona no dia: a tarefa existe e avisa a ficha incompleta
		const board = await fetchProductionBoard(db, shiftCtx(kitchenId), { kitchenId, date: today })
		const onBoard = board.find((i) => i.menuItem.id === first.menuItemId)
		expect(onBoard?.menuItem.recipe_gaps).toContain("provisional")
		expect(onBoard?.menuItem.recipe_gaps).toContain("no_ingredients")

		// não entra em cardápio-modelo (o anexo e a compra dependem da ficha)
		await expect(
			createTemplate(db, nutritionist, {
				name: "[TEST] semana",
				kitchenId,
				templateType: "weekly",
				items: [{ dayOfWeek: 1, mealTypeId, recipeId: first.recipeId, recommendedProportion: null }],
			})
		).rejects.toThrow(/provisória.*Complete a ficha/)

		const pending = await fetchExecutionReviewStatus(db, nutritionist, { kitchenId })
		expect(pending.provisionalRecipes.map((r) => r.id)).toContain(first.recipeId)

		// completar a ficha = salvar a edição, que cria a versão seguinte sem a marca
		await saveRecipeEdit(db, nutritionist, {
			baseRecipeId: first.recipeId,
			context: { scope: "kitchen", kitchenId },
			name,
			portionYield: 50,
		})
		const done = await fetchExecutionReviewStatus(db, nutritionist, { kitchenId })
		expect(done.provisionalRecipes.map((r) => r.id)).not.toContain(first.recipeId)
	}, 60_000)

	test("o turno registra o substituto: o que faltou e o que ENTROU, no formato do agendamento", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId } = await setupKitchen()
		const ingredientId = await seeder.seedIngredient()
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 10 })
		const added = await addExecutionMenuItem(db, shiftCtx(kitchenId), {
			kitchenId,
			serviceDate: brasiliaToday(),
			mealTypeId,
			recipeId,
			reason: "[TEST] inclusão",
		})

		await recordProductionSubstitution(db, shiftCtx(kitchenId), {
			menuItemId: added.menuItemId,
			ingredientId,
			substituteDescription: "[TEST] polpa de acerola",
			rationale: "[TEST] laranja em falta",
		})
		const board = await fetchProductionBoard(db, shiftCtx(kitchenId), { kitchenId, date: brasiliaToday() })
		const subs = board.find((i) => i.menuItem.id === added.menuItemId)?.menuItem.substitutions as Record<string, Record<string, unknown>>
		expect(subs[ingredientId]).toMatchObject({ type: "production", substitute_description: "[TEST] polpa de acerola", rationale: "[TEST] laranja em falta" })
	}, 60_000)

	test("a tarefa do dia nasce sem o quadro aberto (a sugestão de saída depende dela)", async () => {
		if (!reachable || !seeder || !db) return
		const { kitchenId, mealTypeId } = await setupKitchen()
		const date = "2099-09-10"
		const recipeId = await seeder.seedRecipe({ kitchenId, portionYield: 10 })
		const { id: dailyMenuId } = await seeder.seedDailyMenu({ kitchenId, mealTypeId, serviceDate: date })
		await seeder.seedMenuItem({ dailyMenuId, recipeId, plannedPortionQuantity: 40 })

		expect((await createMissingProductionTasks(db, { kitchenId, date })).created).toBe(1)
		expect((await createMissingProductionTasks(db, { kitchenId, date })).created).toBe(0)
	}, 60_000)
})

// ── SQL: estoque e congelada provisória ────────────────────────────────────

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("execução do dia no estoque (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	/** Dia civil de Brasília menos `days`. Nunca `current_date`: é UTC e erra entre 21h e 00h. */
	const brDay = (tx: postgres.TransactionSql, days: number) => tx`((now() at time zone 'America/Sao_Paulo')::date - ${days}::int)`

	async function kitchenWithRice(tx: postgres.TransactionSql, tag: string) {
		const [unit] = await tx`insert into core.units (code, display_name) values (${`ZZTEST-ENB-${tag}`}, 'unit teste execução') returning id`
		const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha execução') returning id`
		const [arroz] = await tx`insert into kitchen.ingredient (description, measure_unit) values (${`ARROZ TESTE ENB ${tag}`}, 'KG') returning id`
		const [lot] = await tx`
			insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, received_at)
			values (${kitchenRow.id}, ${arroz.id}, ${`L-ENB-${tag}`}, now() - interval '20 days') returning id`
		await tx`
			insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
			values (${kitchenRow.id}, ${arroz.id}, ${lot.id}, 'receipt', 100, 10)`
		const [user] = await tx`select id from auth.users limit 1`
		return { kitchenId: Number(kitchenRow.id), ingredientId: String(arroz.id), lotId: String(lot.id), userId: String(user.id) }
	}

	test("o dia esquecido aberto fecha sozinho: closed_unexplained só com desvio acima das duas tolerâncias", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const { kitchenId, ingredientId, userId } = await kitchenWithRice(tx, "CLOSE")
					// sugeriu 10 KG, nada saiu: 100 % e R$ 100 — pede motivo
					const [semMotivo] = await tx`
							insert into inventory.stock_issue_request (kitchen_id, issue_date, origin, created_by)
							values (${kitchenId}, ${brDay(tx, 2)}, 'production', ${userId}) returning id`
					await tx`insert into inventory.stock_issue_request_item (request_id, ingredient_id, suggested_qty) values (${semMotivo.id}, ${ingredientId}, 10)`
					// sem sugestão: nada a justificar
					const [semSugestao] = await tx`
							insert into inventory.stock_issue_request (kitchen_id, issue_date, origin, created_by)
							values (${kitchenId}, ${brDay(tx, 3)}, 'production', ${userId}) returning id`
					// hoje: continua aberto
					const [hoje] = await tx`
							insert into inventory.stock_issue_request (kitchen_id, issue_date, origin, created_by)
							values (${kitchenId}, ${brDay(tx, 0)}, 'production', ${userId}) returning id`

					const [closed] = await tx`select inventory.close_stale_issue_requests(${kitchenId}) as n`
					expect(Number(closed.n)).toBe(2)
					const rows = await tx`select id, status, auto_closed_at from inventory.stock_issue_request where kitchen_id = ${kitchenId}`
					const byId = new Map(rows.map((r) => [r.id, r]))
					expect(byId.get(semMotivo.id)?.status).toBe("closed_unexplained")
					expect(byId.get(semMotivo.id)?.auto_closed_at).not.toBeNull()
					expect(byId.get(semSugestao.id)?.status).toBe("closed")
					expect(byId.get(hoje.id)?.status).toBe("open")
					// idempotente: a segunda rodada não fecha nada
					const [again] = await tx`select inventory.close_stale_issue_requests(${kitchenId}) as n`
					expect(Number(again.n)).toBe(0)
					// e o job está agendado na migration
					const [job] = await tx`select count(*)::int as n from cron.job where jobname = 'inventory-close-stale-issue-days'`
					expect(job.n).toBe(1)
					throw new Rollback()
				})
				.catch((e) => {
					if (!(e instanceof Rollback)) throw e
				})
		).resolves.toBeUndefined()
	}, 60_000)

	test("saída tardia: data real e motivo no movimento; recusa sem motivo, competência fechada e dupla baixa", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const { kitchenId, ingredientId, lotId, userId } = await kitchenWithRice(tx, "LATE")
					const [dayRequest] = await tx`
							insert into inventory.stock_issue_request (kitchen_id, issue_date, origin, status, closed_at, created_by)
							values (${kitchenId}, ${brDay(tx, 2)}, 'production', 'closed', now(), ${userId}) returning id`

					const [late] = await tx`
							select * from inventory.register_late_issue(${kitchenId}, ${ingredientId}, 5, ${brDay(tx, 2)}, '[TEST] saiu sem requisição', ${userId}, 'enb-late-0001')`
					expect(Number(late.movements)).toBe(1)
					expect(late.request_id).toBe(dayRequest.id) // ligada ao DIA, mesmo fechado
					const [move] = await tx`
							select (occurred_at at time zone 'America/Sao_Paulo')::date = ${brDay(tx, 2)} as same_day, justification, lot_id
							from inventory.stock_movement where emission_id = 'enb-late-0001'`
					expect(move.same_day).toBe(true)
					expect(move.justification).toMatch(/Lançamento tardio.*saiu sem requisição/)
					expect(move.lot_id).toBe(lotId)
					// retry da mesma emissão não saca de novo
					await tx`select * from inventory.register_late_issue(${kitchenId}, ${ingredientId}, 5, ${brDay(tx, 2)}, '[TEST] saiu sem requisição', ${userId}, 'enb-late-0001')`
					const [count] = await tx`select count(*)::int as n from inventory.stock_movement where emission_id = 'enb-late-0001'`
					expect(count.n).toBe(1)

					// sem motivo
					await expect(
						tx.savepoint(
							(sp) => sp`select * from inventory.register_late_issue(${kitchenId}, ${ingredientId}, 1, ${brDay(tx, 2)}, '   ', ${userId}, 'enb-late-0002')`
						)
					).rejects.toThrow(/exige o motivo/)

					// competência fechada é imprescindível
					await tx`
							insert into inventory.monthly_closing (kitchen_id, competencia, balance_snapshot, closed_by)
							values (${kitchenId}, date_trunc('month', ${brDay(tx, 70)})::date, '[]'::jsonb, ${userId})`
					await expect(
						tx.savepoint(
							(sp) =>
								sp`select * from inventory.register_late_issue(${kitchenId}, ${ingredientId}, 1, ${brDay(tx, 70)}, '[TEST] mês fechado', ${userId}, 'enb-late-0003')`
						)
					).rejects.toThrow(/competência .* já foi fechada/)

					// contagem aprovada que viu o insumo DEPOIS da data: baixaria duas vezes
					const [countRow] = await tx`
							insert into inventory.inventory_count (kitchen_id, status, created_by) values (${kitchenId}, 'counting', ${userId}) returning id`
					await tx`
							insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
							values (${countRow.id}, ${lotId}, 95, 'enb-count-1', ${userId}, now() - interval '1 minute')`
					await tx`update inventory.inventory_count set status = 'approved', approved_at = now() where id = ${countRow.id}`
					await expect(
						tx.savepoint(
							(sp) =>
								sp`select * from inventory.register_late_issue(${kitchenId}, ${ingredientId}, 1, ${brDay(tx, 3)}, '[TEST] antes da contagem', ${userId}, 'enb-late-0004')`
						)
					).rejects.toThrow(/baixaria duas vezes/)

					// o retroativo continua recusado fora da saída tardia
					await expect(
						tx.savepoint(
							(sp) => sp`
									insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, occurred_at, justification)
									values (${kitchenId}, ${ingredientId}, ${lotId}, 'production_issue', 1, now() - interval '3 days', 'retroativo solto')`
						)
					).rejects.toThrow(/retroativo só dentro do mesmo dia/)
					throw new Rollback()
				})
				.catch((e) => {
					if (!(e instanceof Rollback)) throw e
				})
		).resolves.toBeUndefined()
	}, 60_000)

	test("contagem: tarefa já baixada pela produção não trava; sem baixa, aprova com ressalva registrada", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const { kitchenId, ingredientId } = await kitchenWithRice(tx, "CNT")
					const users = await tx`select id from auth.users limit 2`
					expect(users.length).toBe(2)
					const [autor, outro] = users as unknown as Array<{ id: string }>

					const [prato] = await tx`insert into kitchen.menu_items default values returning id`
					const [task] = await tx`
							insert into kitchen.production_task (kitchen_id, menu_item_id, production_date, status)
							values (${kitchenId}, ${prato.id}, ${brDay(tx, 0)}, 'DONE') returning id`
					const [contagem] = await tx`
							insert into inventory.inventory_count (kitchen_id, status, created_by) values (${kitchenId}, 'review', ${autor?.id}) returning id`

					// sem saída nenhuma: recusa dizendo as saídas
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${contagem.id}, ${outro?.id}, null)`)).rejects.toThrow(
						/aprove com ressalva registrada/
					)
					// com ressalva: aprova e grava
					await tx
						.savepoint(async (sp) => {
							await sp`select * from inventory.approve_inventory_count_with_waiver(${contagem.id}, ${outro?.id}, null, '[TEST] dia sem requisição, conferido')`
							const [row] = await sp`select status, pending_production_waiver from inventory.inventory_count where id = ${contagem.id}`
							expect(row.status).toBe("approved")
							expect(row.pending_production_waiver).toMatch(/sem saída lançada: \[TEST\] dia sem requisição/)
							throw new Error("desfaz a aprovação")
						})
						.catch(() => undefined)

					// baixada pela "Baixa por Produção": não trava mais
					await tx`
							insert into inventory.stock_movement (kitchen_id, ingredient_id, type, quantity, production_task_id)
							values (${kitchenId}, ${ingredientId}, 'production_issue', 1, ${task.id})`
					await tx`select * from inventory.approve_inventory_count(${contagem.id}, ${outro?.id}, null)`
					const [approved] = await tx`select status, pending_production_waiver from inventory.inventory_count where id = ${contagem.id}`
					expect(approved.status).toBe("approved")
					expect(approved.pending_production_waiver).toBeNull()
					throw new Rollback()
				})
				.catch((e) => {
					if (!(e instanceof Rollback)) throw e
				})
		).resolves.toBeUndefined()
	}, 60_000)

	test("sobra sem congelada cadastrada: provisória da cozinha, reaproveitada pelo nome; provisória não entra em cardápio-modelo", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const { kitchenId, userId } = await kitchenWithRice(tx, "LEFT")
					const [prato] = await tx`insert into kitchen.menu_items default values returning id`
					const [task] = await tx`
							insert into kitchen.production_task (kitchen_id, menu_item_id, production_date, status)
							values (${kitchenId}, ${prato.id}, ${brDay(tx, 0)}, 'DONE') returning id`
					const name = `[TEST] Estrogonofe ${Date.now()}`

					const [first] = await tx`
							select * from inventory.register_leftover_provisional(${kitchenId}, ${name}, 'KG', 3, 'SOBRA-T', ${brDay(tx, 0)}, 4, ${task.id}, false, null, ${userId})`
					const [prep] = await tx`
							select provisional_kitchen_id, provisional_since, provisional_reviewed_at, shelf_life_days
							from kitchen.frozen_preparation where id = ${first.frozen_preparation_id}`
					expect(Number(prep.provisional_kitchen_id)).toBe(kitchenId)
					expect(prep.provisional_since).not.toBeNull()
					expect(prep.provisional_reviewed_at).toBeNull()
					const [lot] = await tx`select expiry_date = ${brDay(tx, 0)} + 3 as expiry_ok from inventory.stock_lot where id = ${first.lot_id}`
					expect(lot.expiry_ok).toBe(true)

					// a mesma sobra (outra tarefa) com o mesmo nome vai para a MESMA congelada
					const [prato2] = await tx`insert into kitchen.menu_items default values returning id`
					const [task2] = await tx`
							insert into kitchen.production_task (kitchen_id, menu_item_id, production_date, status)
							values (${kitchenId}, ${prato2.id}, ${brDay(tx, 0)}, 'DONE') returning id`
					const [second] = await tx`
							select * from inventory.register_leftover_provisional(${kitchenId}, ${name.toLowerCase()}, 'KG', 3, 'SOBRA-T2', ${brDay(tx, 0)}, 2, ${task2.id}, false, null, ${userId})`
					expect(second.frozen_preparation_id).toBe(first.frozen_preparation_id)

					// preparação provisória recusada no cardápio-modelo pelo gatilho
					const [recipe] = await tx`
							insert into kitchen.recipes (name, kitchen_id, version, provisional_since) values ('[TEST] provisória', ${kitchenId}, 1, now()) returning id`
					const [template] = await tx`insert into kitchen.menu_template (name, kitchen_id) values ('[TEST] modelo', ${kitchenId}) returning id`
					const [meal] = await tx`select id from kitchen.meal_type where kitchen_id is null and deleted_at is null and system_key is null limit 1`
					await expect(
						tx.savepoint(
							(sp) => sp`
									insert into kitchen.menu_template_items (menu_template_id, recipe_id, meal_type_id, day_of_week)
									values (${template.id}, ${recipe.id}, ${meal?.id ?? null}, 1)`
						)
					).rejects.toThrow(/provisória/)
					throw new Rollback()
				})
				.catch((e) => {
					if (!(e instanceof Rollback)) throw e
				})
		).resolves.toBeUndefined()
	}, 60_000)
})
