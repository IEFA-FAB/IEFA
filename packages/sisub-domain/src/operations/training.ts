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
	equipmentModelInKitchen,
	equipmentUnitInKitchen,
	kitchenAtaDraftInProcurement,
	kitchenAtaDraftSelectionInProcurement,
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
	procurementListSelectionInProcurement,
	productionTaskInKitchen,
	recipeEquipmentRequirementInKitchen,
	recipeIngredientAlternativesInKitchen,
	recipeIngredientsInKitchen,
	recipeStepInKitchen,
	recipeStepInputInKitchen,
	recipeStepOutputInKitchen,
	recipeStepUtensilInKitchen,
	recipesInKitchen,
	type SisubDb,
	stepTemplateInKitchen,
	stepTemplateUtensilInKitchen,
	trainingResetLogInCore,
	unitsInCore,
	utensilInKitchen,
} from "@iefa/database/drizzle/sisub"
import { desc, eq, inArray, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { requirePermission } from "../guards/require-permission.ts"
import type { ListTrainingResets } from "../schemas/training.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { describeDriverError, insertOneOrFail, runQuery } from "../utils/index.ts"

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
	/**
	 * Id da linha de auditoria DESTA execução (`core.training_reset_log`).
	 *
	 * Sem ele, quem chamou só consegue achar o próprio registro assumindo que é o mais
	 * recente do histórico — e não é: o INSERT do log acontece ANTES do advisory lock,
	 * então um segundo reset que chega enquanto o primeiro trabalha já tem linha gravada,
	 * com `started_at` posterior e status `running`. É essa suposição que fazia a suíte de
	 * integração acusar `expected 'running' to be 'succeeded'` sempre que dois runs
	 * dividiam o banco.
	 */
	reset_id: string
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
	recipeIds: string[]
	recipeStepIds: string[]
	recipeIngredientIds: string[]
	stepTemplateIds: string[]
	ataDraftIds: string[]
}

/**
 * `DELETE ... WHERE <coluna> IN (ids)`, devolvendo a contagem. Para os filhos que não
 * carregam escopo próprio e só são alcançáveis pelo pai.
 */
async function deleteByParent(tx: TrainingTx, table: Parameters<TrainingTx["delete"]>[0], column: PgColumn, ids: string[]): Promise<number> {
	if (ids.length === 0) return 0
	const result = await tx.delete(table).where(inArray(column, ids)).returning({ ok: sql<number>`1` })
	return result.length
}

/**
 * `DELETE` por SQL cru, devolvendo a contagem. Para as tabelas de execução
 * orçamentária, que ainda não têm definição Drizzle — o reset não pode ficar
 * esperando o regen dos tipos para limpar o que o aluno gera.
 */
async function deleteRaw(tx: TrainingTx, statement: SQL): Promise<number> {
	const result = (await tx.execute(statement)) as unknown
	return Array.isArray(result) ? result.length : 0
}

/** `DELETE` devolvendo a contagem de linhas afetadas. */
async function deleteCounting(tx: TrainingTx, table: Parameters<TrainingTx["delete"]>[0], where: ReturnType<typeof eq>): Promise<number> {
	const result = await tx.delete(table).where(where).returning({ ok: sql<number>`1` })
	return result.length
}

const RESET_STEPS: ResetStep[] = [
	// ── Exigência de equipamento das receitas locais ──
	// Antes das etapas e das receitas: a linha referencia as duas, e os FKs são NO ACTION.
	{
		table: "kitchen.recipe_equipment_requirement",
		run: (tx, _s, ids) => deleteByParent(tx, recipeEquipmentRequirementInKitchen, recipeEquipmentRequirementInKitchen.recipeId, ids.recipeIds),
	},

	// ── Fluxo de produção das receitas locais ──
	// A maioria dos FKs do schema é NO ACTION, não CASCADE: apagar a receita antes destes
	// filhos faz o Postgres recusar e a transação inteira volta atrás, deixando o ambiente
	// intocado. A ordem aqui é topológica de verdade, filho a filho.
	{
		table: "kitchen.recipe_step_utensil",
		run: (tx, _s, ids) => deleteByParent(tx, recipeStepUtensilInKitchen, recipeStepUtensilInKitchen.recipeStepId, ids.recipeStepIds),
	},
	{
		table: "kitchen.recipe_step_input",
		run: (tx, _s, ids) => deleteByParent(tx, recipeStepInputInKitchen, recipeStepInputInKitchen.recipeStepId, ids.recipeStepIds),
	},
	{
		table: "kitchen.recipe_step_output",
		run: (tx, _s, ids) => deleteByParent(tx, recipeStepOutputInKitchen, recipeStepOutputInKitchen.recipeId, ids.recipeIds),
	},
	{ table: "kitchen.recipe_step", run: (tx, _s, ids) => deleteByParent(tx, recipeStepInKitchen, recipeStepInKitchen.recipeId, ids.recipeIds) },
	{
		table: "kitchen.recipe_ingredient_alternatives",
		run: (tx, _s, ids) =>
			deleteByParent(tx, recipeIngredientAlternativesInKitchen, recipeIngredientAlternativesInKitchen.recipeIngredientId, ids.recipeIngredientIds),
	},
	{
		table: "kitchen.recipe_ingredients",
		run: (tx, _s, ids) => deleteByParent(tx, recipeIngredientsInKitchen, recipeIngredientsInKitchen.recipeId, ids.recipeIds),
	},

	// ── Cardápio diário ──
	{ table: "kitchen.menu_items", run: (tx, _s, ids) => deleteByParent(tx, menuItemsInKitchen, menuItemsInKitchen.dailyMenuId, ids.dailyMenuIds) },
	{ table: "kitchen.daily_menu", run: (tx, scope) => deleteCounting(tx, dailyMenuInKitchen, eq(dailyMenuInKitchen.kitchenId, scope.kitchen_id)) },

	// ── Compras ──
	// As seleções apontam para o rascunho E para o template; ambas precisam sair antes.
	{
		table: "procurement.kitchen_ata_draft_selection",
		run: (tx, _s, ids) => deleteByParent(tx, kitchenAtaDraftSelectionInProcurement, kitchenAtaDraftSelectionInProcurement.draftId, ids.ataDraftIds),
	},
	{
		table: "procurement.kitchen_ata_draft",
		run: (tx, scope) => deleteCounting(tx, kitchenAtaDraftInProcurement, eq(kitchenAtaDraftInProcurement.kitchenId, scope.kitchen_id)),
	},
	{
		table: "procurement.procurement_list_selection",
		run: (tx, _s, ids) => deleteByParent(tx, procurementListSelectionInProcurement, procurementListSelectionInProcurement.templateId, ids.templateIds),
	},
	{
		table: "procurement.procurement_list_kitchen",
		run: (tx, scope) => deleteCounting(tx, procurementListKitchenInProcurement, eq(procurementListKitchenInProcurement.kitchenId, scope.kitchen_id)),
	},

	// ── Templates de cardápio ──
	{
		table: "kitchen.menu_template_items",
		run: (tx, _s, ids) => deleteByParent(tx, menuTemplateItemsInKitchen, menuTemplateItemsInKitchen.menuTemplateId, ids.templateIds),
	},
	{
		table: "kitchen.menu_template_meal",
		run: (tx, _s, ids) => deleteByParent(tx, menuTemplateMealInKitchen, menuTemplateMealInKitchen.menuTemplateId, ids.templateIds),
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

	// ── Catálogo local da cozinha de treino ──
	// Inclui os FORKS locais de receitas globais criados durante o treinamento. As receitas
	// globais (kitchen_id null) não são tocadas — o filtro é por kitchen_id.
	{ table: "kitchen.recipes", run: (tx, scope) => deleteCounting(tx, recipesInKitchen, eq(recipesInKitchen.kitchenId, scope.kitchen_id)) },
	{
		table: "kitchen.step_template_utensil",
		run: (tx, _s, ids) => deleteByParent(tx, stepTemplateUtensilInKitchen, stepTemplateUtensilInKitchen.stepTemplateId, ids.stepTemplateIds),
	},
	{ table: "kitchen.step_template", run: (tx, scope) => deleteCounting(tx, stepTemplateInKitchen, eq(stepTemplateInKitchen.kitchenId, scope.kitchen_id)) },
	{ table: "kitchen.utensil", run: (tx, scope) => deleteCounting(tx, utensilInKitchen, eq(utensilInKitchen.kitchenId, scope.kitchen_id)) },

	// ── Equipamento da cozinha de treino ──
	// O parque instalado é dado do aluno: sem isto, a turma seguinte herda os fornos que a
	// anterior cadastrou. O CATÁLOGO GLOBAL de papéis e modelos (kitchen_id null) não é tocado —
	// como as receitas globais, ele é do sistema, não do treino. `equipment_role` fica de fora
	// pelo mesmo motivo: é taxonomia global, não existe papel de cozinha.
	{
		table: "kitchen.equipment_unit_role",
		run: (tx, scope) =>
			deleteRaw(
				tx,
				sql`delete from kitchen.equipment_unit_role where unit_id in (select id from kitchen.equipment_unit where kitchen_id = ${scope.kitchen_id}) returning 1`
			),
	},
	{ table: "kitchen.equipment_unit", run: (tx, scope) => deleteCounting(tx, equipmentUnitInKitchen, eq(equipmentUnitInKitchen.kitchenId, scope.kitchen_id)) },
	{
		table: "kitchen.equipment_model_role",
		run: (tx, scope) =>
			deleteRaw(
				tx,
				sql`delete from kitchen.equipment_model_role where model_id in (select id from kitchen.equipment_model where kitchen_id = ${scope.kitchen_id}) returning 1`
			),
	},
	{
		table: "kitchen.equipment_model",
		run: (tx, scope) => deleteCounting(tx, equipmentModelInKitchen, eq(equipmentModelInKitchen.kitchenId, scope.kitchen_id)),
	},
	{ table: "kitchen.meal_type", run: (tx, scope) => deleteCounting(tx, mealTypeInKitchen, eq(mealTypeInKitchen.kitchenId, scope.kitchen_id)) },

	// ── Execução orçamentária ──
	// O Conjunto Treino concede `unit` nível 2 na unidade sentinela, e é
	// exatamente o nível que as telas de crédito, empenho, liquidação, pagamento
	// e conciliação exigem: o aluno GERA esses registros. Logo eles saem no
	// reset como qualquer outro dado sintético — sem isso, a turma seguinte
	// herda empenho e pagamento fictícios da anterior.
	// Ordem: filho antes do pai (pagamento → liquidação → evento → empenho) e
	// crédito antes do lote de importação que o originou.
	{ table: "finance.pagamento", run: (tx, scope) => deleteRaw(tx, sql`delete from finance.pagamento where unit_id = ${scope.unit_id} returning 1`) },
	{ table: "finance.liquidacao", run: (tx, scope) => deleteRaw(tx, sql`delete from finance.liquidacao where unit_id = ${scope.unit_id} returning 1`) },
	{
		table: "finance.reconciliation_decision",
		run: (tx, scope) => deleteRaw(tx, sql`delete from finance.reconciliation_decision where unit_id = ${scope.unit_id} returning 1`),
	},
	{
		table: "finance.empenho_event",
		run: (tx, scope) =>
			deleteRaw(tx, sql`delete from finance.empenho_event where empenho_id in (select id from finance.empenho where unit_id = ${scope.unit_id}) returning 1`),
	},
	{ table: "finance.empenho", run: (tx, scope) => deleteRaw(tx, sql`delete from finance.empenho where unit_id = ${scope.unit_id} returning 1`) },
	{ table: "finance.budget_credit", run: (tx, scope) => deleteRaw(tx, sql`delete from finance.budget_credit where unit_id = ${scope.unit_id} returning 1`) },
	{
		table: "siafi_integration.import_row",
		run: (tx, scope) =>
			deleteRaw(
				tx,
				sql`delete from siafi_integration.import_row where batch_id in (select id from siafi_integration.import_batch where unit_id = ${scope.unit_id}) returning 1`
			),
	},
	{
		table: "siafi_integration.import_batch",
		run: (tx, scope) => deleteRaw(tx, sql`delete from siafi_integration.import_batch where unit_id = ${scope.unit_id} returning 1`),
	},
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
 * O autor é `ctx.userId` — o mesmo principal que a autorização checou. Um agendador chama
 * esta operação montando o próprio contexto, então não há perda de capacidade.
 *
 * @throws {DomainError} escopo ausente/inseguro, ou falha em qualquer etapa (com rollback).
 */
export async function resetTrainingScope(db: SisubDb, ctx: UserContext): Promise<TrainingResetResult> {
	requirePermission(ctx, "admin", 2)

	// O autor sai do MESMO contexto que foi autorizado. Aceitá-lo por parâmetro permitia
	// autorizar com um principal e registrar outro no log — uma ação destrutiva atribuída
	// permanentemente a quem não a executou. Um agendador monta o próprio ctx, então nada
	// se perde em capacidade.
	const actorId = ctx.userId

	const scope = await resolveTrainingScope(db)
	const startedAt = new Date()

	// Registro ANTES da transação de dados: uma falha no meio precisa deixar rastro apesar do
	// rollback. Um reset que quebrou e não registrou nada é o pior dos mundos.
	//
	// E falha AQUI aborta: sem a linha de log, os dois UPDATEs seguintes casariam com
	// `id = undefined` e o reset correria sem rastro nenhum — o cenário que este registro
	// antecipado existe para impedir.
	const logRow = await insertOneOrFail("INSERT_FAILED", "no row returned inserting the training reset log", () =>
		db.insert(trainingResetLogInCore).values({ actorId, startedAt: startedAt.toISOString(), status: "running" }).returning({ id: trainingResetLogInCore.id })
	)

	try {
		const deletedCounts = await db.transaction(async (tx) => {
			// Serializa execuções concorrentes — sem isto, dois resets simultâneos deixariam o
			// ambiente parcialmente limpo. Liberado no commit/rollback da transação.
			await tx.execute(sql`select pg_advisory_xact_lock(${RESET_LOCK_KEY})`)

			// Ids dos pais, coletados antes de apagar: os filhos não carregam kitchen_id e só
			// são alcançáveis por eles.
			const [dailyMenus, templates, recipes, stepTemplates, ataDrafts] = await Promise.all([
				tx.select({ id: dailyMenuInKitchen.id }).from(dailyMenuInKitchen).where(eq(dailyMenuInKitchen.kitchenId, scope.kitchen_id)),
				tx.select({ id: menuTemplateInKitchen.id }).from(menuTemplateInKitchen).where(eq(menuTemplateInKitchen.kitchenId, scope.kitchen_id)),
				tx.select({ id: recipesInKitchen.id }).from(recipesInKitchen).where(eq(recipesInKitchen.kitchenId, scope.kitchen_id)),
				tx.select({ id: stepTemplateInKitchen.id }).from(stepTemplateInKitchen).where(eq(stepTemplateInKitchen.kitchenId, scope.kitchen_id)),
				tx
					.select({ id: kitchenAtaDraftInProcurement.id })
					.from(kitchenAtaDraftInProcurement)
					.where(eq(kitchenAtaDraftInProcurement.kitchenId, scope.kitchen_id)),
			])
			const recipeIds = recipes.map((r) => r.id)

			// Netos: passos e linhas de ficha técnica das receitas locais. Só alcançáveis
			// depois de saber quais receitas são da cozinha de treino.
			const [recipeSteps, recipeIngredients] = await Promise.all([
				recipeIds.length === 0
					? []
					: tx.select({ id: recipeStepInKitchen.id }).from(recipeStepInKitchen).where(inArray(recipeStepInKitchen.recipeId, recipeIds)),
				recipeIds.length === 0
					? []
					: tx.select({ id: recipeIngredientsInKitchen.id }).from(recipeIngredientsInKitchen).where(inArray(recipeIngredientsInKitchen.recipeId, recipeIds)),
			])

			const ids: ResetIds = {
				dailyMenuIds: dailyMenus.map((r) => r.id),
				templateIds: templates.map((r) => r.id),
				recipeIds,
				recipeStepIds: recipeSteps.map((r) => r.id),
				recipeIngredientIds: recipeIngredients.map((r) => r.id),
				stepTemplateIds: stepTemplates.map((r) => r.id),
				ataDraftIds: ataDrafts.map((r) => r.id),
			}

			const counts: Record<string, number> = {}
			for (const step of RESET_STEPS) {
				try {
					counts[step.table] = await step.run(tx, scope, ids)
				} catch (e) {
					throw new DomainError("RESET_FAILED", `Falha ao limpar ${step.table}: ${describeDriverError(e)}`)
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
				.where(eq(trainingResetLogInCore.id, logRow.id))
				.then(() => undefined)
		)

		return { reset_id: logRow.id, deleted_counts: deletedCounts, duration_ms: durationMs }
	} catch (error) {
		// Fora da transação revertida — este UPDATE persiste.
		//
		// E ele não pode sequestrar a falha original: a causa mais provável de o reset ter
		// quebrado (conexão caída, banco fora) é a mesma que derruba este UPDATE, e uma
		// exceção aqui subiria NO LUGAR do `RESET_FAILED`, entregando um dump de SQL a quem
		// só queria saber qual etapa falhou. Registrar é melhor-esforço; propagar o motivo
		// real é obrigação.
		try {
			await db
				.update(trainingResetLogInCore)
				.set({
					finishedAt: new Date().toISOString(),
					durationMs: Date.now() - startedAt.getTime(),
					status: "failed",
					errorMessage: describeDriverError(error),
				})
				.where(eq(trainingResetLogInCore.id, logRow.id))
		} catch {
			// Linha fica em `running` — é o que de fato se sabe: a execução parou e o banco
			// não aceitou o desfecho. Inventar `failed` sem gravá-lo seria pior.
		}
		throw error
	}
}

/** Estado do ambiente de treino para o painel da SDAB. */
export async function fetchTrainingScope(db: SisubDb, ctx: UserContext): Promise<TrainingScopeInfo> {
	requirePermission(ctx, "admin", 1)

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
	requirePermission(ctx, "admin", 1)

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
