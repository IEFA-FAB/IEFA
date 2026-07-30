/**
 * Ambiente de treino — leitura das sentinelas e reset.
 *
 * O reset apaga, em transação única, todo o dado operacional pendurado nos escopos de treino
 * e devolve o ambiente ao baseline de demonstração. É irreversível.
 *
 * Operação de domínio pura, sem dependência de sessão HTTP: o autor vem por parâmetro. Um
 * agendador futuro chama isto direto, sem precisar simular uma requisição.
 *
 * ## Por que a ordem de exclusão é explícita
 *
 * Os FKs do schema têm `onDelete` heterogêneo — parte `cascade`, parte `restrict`, parte sem
 * cláusula. Confiar no cascade produziria falha nos `restrict` ou, pior, deixaria órfãos onde
 * não há cascade. A lista explícita também é o que permite contar linhas por tabela para a
 * auditoria.
 */

import {
	dailyMenuInKitchen,
	kitchenAtaDraftInProcurement,
	kitchenInCore,
	mealForecastsInKitchen,
	mealPresencesInKitchen,
	mealTypeInKitchen,
	menuItemsInKitchen,
	menuTemplateInKitchen,
	menuTemplateItemsInKitchen,
	menuTemplateMealInKitchen,
	messHallsInCore,
	otherPresencesInKitchen,
	procurementListKitchenInProcurement,
	productionTaskInKitchen,
	recipesInKitchen,
	type SisubDb,
	stepTemplateInKitchen,
	trainingResetLogInCore,
	unitsInCore,
	utensilInKitchen,
} from "@iefa/database/drizzle/sisub"
import { desc, eq, inArray, sql } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { ListTrainingResets, ResetTrainingScope } from "../schemas/training.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

/** Código exigido nas sentinelas — segunda âncora, além de `is_training`. */
const TRAINING_CODE = "TREINO"

/**
 * Chave de advisory lock do reset. Constante arbitrária, só precisa ser única no banco:
 * serializa execuções concorrentes para o ambiente nunca ficar parcialmente limpo.
 */
const RESET_LOCK_KEY = 8_147_201

export type TrainingScope = {
	unit_id: number
	kitchen_id: number
	mess_hall_id: number
}

export type TrainingScopeInfo = TrainingScope & {
	unit_name: string | null
	kitchen_name: string | null
	mess_hall_name: string | null
	/** Linhas operacionais atualmente penduradas no escopo, por tabela. */
	pending_counts: Record<string, number>
}

export type TrainingResetLogRow = {
	id: string
	actor_id: string
	started_at: string
	finished_at: string | null
	duration_ms: number | null
	deleted_counts: Record<string, number>
	status: string
	error_message: string | null
}

export type TrainingResetResult = {
	deleted_counts: Record<string, number>
	duration_ms: number
}

/**
 * Resolve as três sentinelas.
 *
 * Verifica `code = 'TREINO'` ALÉM de `is_training`. O índice único parcial já impede duas
 * linhas marcadas, mas o reset é destrutivo o bastante para merecer a segunda âncora: uma
 * unidade real marcada por engano teria código diferente e a operação recusa.
 *
 * @throws {DomainError} quando alguma sentinela falta ou não confere.
 */
export async function resolveTrainingScope(db: SisubDb): Promise<TrainingScope> {
	const [units, kitchens, messHalls] = await Promise.all([
		runQuery("FETCH_FAILED", () => db.select({ id: unitsInCore.id, code: unitsInCore.code }).from(unitsInCore).where(eq(unitsInCore.isTraining, true))),
		runQuery("FETCH_FAILED", () => db.select({ id: kitchenInCore.id }).from(kitchenInCore).where(eq(kitchenInCore.isTraining, true))),
		runQuery("FETCH_FAILED", () =>
			db.select({ id: messHallsInCore.id, code: messHallsInCore.code }).from(messHallsInCore).where(eq(messHallsInCore.isTraining, true))
		),
	])

	const unit = units[0]
	const kitchen = kitchens[0]
	const messHall = messHalls[0]

	if (!unit || !kitchen || !messHall) {
		throw new DomainError("TRAINING_SCOPE_MISSING", "Ambiente de treino não encontrado — aplique as migrations de seed do escopo de treino")
	}
	if (unit.code !== TRAINING_CODE || messHall.code !== TRAINING_CODE) {
		throw new DomainError(
			"TRAINING_SCOPE_UNSAFE",
			`Entidade marcada como treino não tem código "${TRAINING_CODE}" (unidade: ${unit.code}, refeitório: ${messHall.code}). O reset foi abortado.`
		)
	}

	return { unit_id: Number(unit.id), kitchen_id: Number(kitchen.id), mess_hall_id: Number(messHall.id) }
}

/**
 * Alvos do reset, em ordem topológica: filhos antes de pais.
 *
 * `menu_items` e os itens/refeições de template são resolvidos pelo pai (não carregam
 * `kitchen_id`), então dependem dos ids coletados na etapa anterior.
 */
type ResetStep = {
	table: string
	run: (tx: TrainingTx, scope: TrainingScope, ids: ResetIds) => Promise<number>
}

type TrainingTx = Parameters<Parameters<SisubDb["transaction"]>[0]>[0]

type ResetIds = {
	dailyMenuIds: string[]
	templateIds: string[]
}

/** `DELETE` devolvendo a contagem de linhas afetadas. */
async function deleteCounting(tx: TrainingTx, table: Parameters<TrainingTx["delete"]>[0], where: ReturnType<typeof eq>): Promise<number> {
	const result = await tx.delete(table).where(where).returning({ ok: sql<number>`1` })
	return result.length
}

const RESET_STEPS: ResetStep[] = [
	// ── Cardápio diário ──
	{
		table: "kitchen.menu_items",
		run: (tx, _scope, ids) =>
			ids.dailyMenuIds.length === 0
				? Promise.resolve(0)
				: tx
						.delete(menuItemsInKitchen)
						.where(inArray(menuItemsInKitchen.dailyMenuId, ids.dailyMenuIds))
						.returning({ ok: sql<number>`1` })
						.then((r) => r.length),
	},
	{ table: "kitchen.daily_menu", run: (tx, scope) => deleteCounting(tx, dailyMenuInKitchen, eq(dailyMenuInKitchen.kitchenId, scope.kitchen_id)) },

	// ── Templates de cardápio ──
	{
		table: "kitchen.menu_template_items",
		run: (tx, _scope, ids) =>
			ids.templateIds.length === 0
				? Promise.resolve(0)
				: tx
						.delete(menuTemplateItemsInKitchen)
						.where(inArray(menuTemplateItemsInKitchen.menuTemplateId, ids.templateIds))
						.returning({ ok: sql<number>`1` })
						.then((r) => r.length),
	},
	{
		table: "kitchen.menu_template_meal",
		run: (tx, _scope, ids) =>
			ids.templateIds.length === 0
				? Promise.resolve(0)
				: tx
						.delete(menuTemplateMealInKitchen)
						.where(inArray(menuTemplateMealInKitchen.menuTemplateId, ids.templateIds))
						.returning({ ok: sql<number>`1` })
						.then((r) => r.length),
	},
	{ table: "kitchen.menu_template", run: (tx, scope) => deleteCounting(tx, menuTemplateInKitchen, eq(menuTemplateInKitchen.kitchenId, scope.kitchen_id)) },

	// ── Produção e demanda ──
	{
		table: "kitchen.production_task",
		run: (tx, scope) => deleteCounting(tx, productionTaskInKitchen, eq(productionTaskInKitchen.kitchenId, scope.kitchen_id)),
	},
	{
		table: "kitchen.meal_forecasts",
		run: (tx, scope) => deleteCounting(tx, mealForecastsInKitchen, eq(mealForecastsInKitchen.messHallId, scope.mess_hall_id)),
	},
	{
		table: "kitchen.meal_presences",
		run: (tx, scope) => deleteCounting(tx, mealPresencesInKitchen, eq(mealPresencesInKitchen.messHallId, scope.mess_hall_id)),
	},
	{
		table: "kitchen.other_presences",
		run: (tx, scope) => deleteCounting(tx, otherPresencesInKitchen, eq(otherPresencesInKitchen.messHallId, scope.mess_hall_id)),
	},

	// ── Compras ──
	{
		table: "procurement.kitchen_ata_draft",
		run: (tx, scope) => deleteCounting(tx, kitchenAtaDraftInProcurement, eq(kitchenAtaDraftInProcurement.kitchenId, scope.kitchen_id)),
	},
	{
		table: "procurement.procurement_list_kitchen",
		run: (tx, scope) => deleteCounting(tx, procurementListKitchenInProcurement, eq(procurementListKitchenInProcurement.kitchenId, scope.kitchen_id)),
	},

	// ── Catálogo local da cozinha de treino ──
	// Inclui os FORKS locais de receitas globais criados durante o treinamento. As receitas
	// globais (kitchen_id null) não são tocadas — o filtro é por kitchen_id.
	{ table: "kitchen.recipes", run: (tx, scope) => deleteCounting(tx, recipesInKitchen, eq(recipesInKitchen.kitchenId, scope.kitchen_id)) },
	{ table: "kitchen.step_template", run: (tx, scope) => deleteCounting(tx, stepTemplateInKitchen, eq(stepTemplateInKitchen.kitchenId, scope.kitchen_id)) },
	{ table: "kitchen.utensil", run: (tx, scope) => deleteCounting(tx, utensilInKitchen, eq(utensilInKitchen.kitchenId, scope.kitchen_id)) },
	{ table: "kitchen.meal_type", run: (tx, scope) => deleteCounting(tx, mealTypeInKitchen, eq(mealTypeInKitchen.kitchenId, scope.kitchen_id)) },
]

/** Tabelas que o reset alcança — consumido pelo teste de completude. */
export const RESET_TARGET_TABLES: readonly string[] = RESET_STEPS.map((s) => s.table)

/**
 * Baseline de demonstração semeado após a limpeza: o mínimo para exercitar o fluxo sem
 * cadastro manual prévio.
 *
 * Determinístico e sem dependência de dado externo. As RECEITAS não são semeadas: o treino
 * usa o catálogo global, e editá-las a partir da cozinha de treino gera um fork local — que
 * o próximo reset apaga junto com o resto.
 */
async function seedTrainingBaseline(tx: TrainingTx, scope: TrainingScope): Promise<void> {
	const mealTypes = [
		{ name: "Café da manhã", sortOrder: 1 },
		{ name: "Almoço", sortOrder: 2 },
		{ name: "Jantar", sortOrder: 3 },
	]

	const inserted = await tx
		.insert(mealTypeInKitchen)
		.values(mealTypes.map((m) => ({ name: m.name, sortOrder: m.sortOrder, kitchenId: scope.kitchen_id })))
		.returning({ id: mealTypeInKitchen.id })

	const [template] = await tx
		.insert(menuTemplateInKitchen)
		.values({
			name: "Cardápio Semanal de Treinamento",
			description: "Modelo inicial do ambiente de treino. Recriado a cada reset.",
			kitchenId: scope.kitchen_id,
			templateType: "weekly",
		})
		.returning({ id: menuTemplateInKitchen.id })

	if (!template) throw new DomainError("SEED_FAILED", "no row returned seeding the training template")

	// Efetivo base por (dia, refeição) — sem ele a demanda da produção e da ATA fica zerada
	// e o treinando não tem o que exercitar.
	const meals = [1, 2, 3, 4, 5].flatMap((dayOfWeek) =>
		inserted.map((mealType) => ({ menuTemplateId: template.id, dayOfWeek, mealTypeId: mealType.id, baseHeadcount: 100 }))
	)
	if (meals.length > 0) await tx.insert(menuTemplateMealInKitchen).values(meals)
}

/**
 * Limpa e re-semeia o ambiente de treino.
 *
 * @param actorId - autor da execução. Parâmetro explícito, não lido de sessão, para que um
 *   agendador possa chamar a operação fora de um request.
 * @throws {DomainError} escopo ausente/inseguro, ou falha em qualquer etapa (com rollback).
 */
export async function resetTrainingScope(db: SisubDb, ctx: UserContext, input: ResetTrainingScope): Promise<TrainingResetResult> {
	requirePermission(ctx, "global", 2)

	const scope = await resolveTrainingScope(db)
	const startedAt = new Date()

	// Registro ANTES da transação de dados: uma falha no meio precisa deixar rastro apesar do
	// rollback. Um reset que quebrou e não registrou nada é o pior dos mundos.
	const [logRow] = await runQuery("INSERT_FAILED", () =>
		db
			.insert(trainingResetLogInCore)
			.values({ actorId: input.actorId, startedAt: startedAt.toISOString(), status: "running" })
			.returning({ id: trainingResetLogInCore.id })
	)

	try {
		const deletedCounts = await db.transaction(async (tx) => {
			// Serializa execuções concorrentes — sem isto, dois resets simultâneos deixariam o
			// ambiente parcialmente limpo. Liberado no commit/rollback da transação.
			await tx.execute(sql`select pg_advisory_xact_lock(${RESET_LOCK_KEY})`)

			// Ids dos pais, coletados antes de apagar: os filhos não carregam kitchen_id.
			const [dailyMenus, templates] = await Promise.all([
				tx.select({ id: dailyMenuInKitchen.id }).from(dailyMenuInKitchen).where(eq(dailyMenuInKitchen.kitchenId, scope.kitchen_id)),
				tx.select({ id: menuTemplateInKitchen.id }).from(menuTemplateInKitchen).where(eq(menuTemplateInKitchen.kitchenId, scope.kitchen_id)),
			])
			const ids: ResetIds = { dailyMenuIds: dailyMenus.map((r) => r.id), templateIds: templates.map((r) => r.id) }

			const counts: Record<string, number> = {}
			for (const step of RESET_STEPS) {
				try {
					counts[step.table] = await step.run(tx, scope, ids)
				} catch (e) {
					throw new DomainError("RESET_FAILED", `Falha ao limpar ${step.table}: ${e instanceof Error ? e.message : String(e)}`)
				}
			}

			await seedTrainingBaseline(tx, scope)
			return counts
		})

		const durationMs = Date.now() - startedAt.getTime()
		await runQuery("UPDATE_FAILED", () =>
			db
				.update(trainingResetLogInCore)
				.set({ finishedAt: new Date().toISOString(), durationMs, deletedCounts, status: "succeeded" })
				.where(eq(trainingResetLogInCore.id, logRow?.id as string))
				.then(() => undefined)
		)

		return { deleted_counts: deletedCounts, duration_ms: durationMs }
	} catch (error) {
		// Fora da transação revertida — este UPDATE persiste.
		await db
			.update(trainingResetLogInCore)
			.set({
				finishedAt: new Date().toISOString(),
				durationMs: Date.now() - startedAt.getTime(),
				status: "failed",
				errorMessage: error instanceof Error ? error.message : String(error),
			})
			.where(eq(trainingResetLogInCore.id, logRow?.id as string))
		throw error
	}
}

/** Estado do ambiente de treino para o painel da SDAB. */
export async function fetchTrainingScope(db: SisubDb, ctx: UserContext): Promise<TrainingScopeInfo> {
	requirePermission(ctx, "global", 1)

	const scope = await resolveTrainingScope(db)

	const [unit, kitchen, messHall, dailyMenus, templates, tasks] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({ name: unitsInCore.displayName })
				.from(unitsInCore)
				.where(eq(unitsInCore.id, BigInt(scope.unit_id)))
		),
		runQuery("FETCH_FAILED", () => db.select({ name: kitchenInCore.displayName }).from(kitchenInCore).where(eq(kitchenInCore.id, scope.kitchen_id))),
		runQuery("FETCH_FAILED", () =>
			db
				.select({ name: messHallsInCore.displayName })
				.from(messHallsInCore)
				.where(eq(messHallsInCore.id, BigInt(scope.mess_hall_id)))
		),
		runQuery("FETCH_FAILED", () => db.select({ id: dailyMenuInKitchen.id }).from(dailyMenuInKitchen).where(eq(dailyMenuInKitchen.kitchenId, scope.kitchen_id))),
		runQuery("FETCH_FAILED", () =>
			db.select({ id: menuTemplateInKitchen.id }).from(menuTemplateInKitchen).where(eq(menuTemplateInKitchen.kitchenId, scope.kitchen_id))
		),
		runQuery("FETCH_FAILED", () =>
			db.select({ id: productionTaskInKitchen.id }).from(productionTaskInKitchen).where(eq(productionTaskInKitchen.kitchenId, scope.kitchen_id))
		),
	])

	return {
		...scope,
		unit_name: unit[0]?.name ?? null,
		kitchen_name: kitchen[0]?.name ?? null,
		mess_hall_name: messHall[0]?.name ?? null,
		pending_counts: {
			"kitchen.daily_menu": dailyMenus.length,
			"kitchen.menu_template": templates.length,
			"kitchen.production_task": tasks.length,
		},
	}
}

/** Histórico de resets, mais recente primeiro. */
export async function listTrainingResets(db: SisubDb, ctx: UserContext, input: ListTrainingResets): Promise<TrainingResetLogRow[]> {
	requirePermission(ctx, "global", 1)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: trainingResetLogInCore.id,
				actor_id: trainingResetLogInCore.actorId,
				started_at: trainingResetLogInCore.startedAt,
				finished_at: trainingResetLogInCore.finishedAt,
				duration_ms: trainingResetLogInCore.durationMs,
				deleted_counts: trainingResetLogInCore.deletedCounts,
				status: trainingResetLogInCore.status,
				error_message: trainingResetLogInCore.errorMessage,
			})
			.from(trainingResetLogInCore)
			.orderBy(desc(trainingResetLogInCore.startedAt))
			.limit(input.limit ?? 20)
	)
	return rows as TrainingResetLogRow[]
}
