/**
 * Execução do dia: o que o turno faz sem esperar o planejamento, e a pendência que isso deixa.
 *
 * "O rancho é rápido e dinâmico": o planejamento (cardápio de datas futuras, cardápio-modelo,
 * ficha técnica, anexo) segue exclusivo de `kitchen:2`. No DIA, o turno joga uma preparação no
 * cardápio de hoje — até uma que não existe no catálogo — e isso não trava nada: fica
 * registrado quem incluiu, quando e por quê, e aparece para a nutricionista revisar no fluxo
 * "Revisar a execução" da Gestão Cozinha.
 *
 * Permissão: `requireKitchenExecution` (`kitchen-production:1` OU `kitchen:2`), e SÓ para a
 * data de serviço de hoje no fuso de Brasília. Outro dia é planejamento, não execução.
 *
 * Leitura e escrita de uma tabela só vão pelo schema Drizzle. Fica em SQL cru o que o query
 * builder não diz melhor:
 *  • as leituras da revisão (`fetchExecutionReviewStatus`, `listPendingProvisionalFrozenPreparations`):
 *    joins com `core.user_data`, o JSON do snapshot e contagens correlacionadas. As duas de tabela
 *    única dali (dias sem justificativa, congeladas provisórias) seguem no mesmo lote cru, com o
 *    mesmo formato de linha das vizinhas;
 *  • o advisory lock e a busca da provisória pendente sob ele (a subconsulta da versão mais nova);
 *  • o predicado do índice parcial no `on conflict` do cardápio do dia.
 */

import {
	dailyMenuInKitchen,
	frozenPreparationInKitchen,
	mealTypeInKitchen,
	menuItemsInKitchen,
	productionTaskInKitchen,
	recipesInKitchen,
	type SisubDb,
} from "@iefa/database/drizzle/sisub"
import { hasPermission } from "@iefa/pbac"
import { and, asc, eq, isNotNull, isNull, max, or, sql } from "drizzle-orm"
import { requireKitchen, requireKitchenExecution, requirePermission } from "../guards/require-permission.ts"
import { resolveKitchenFromMenuItem } from "../guards/validate-scope.ts"
import type {
	AddExecutionMenuItem,
	FetchExecutionOptions,
	FetchExecutionReviewStatus,
	ReviewExecutionMenuItem,
	ReviewProvisionalFrozenPreparation,
} from "../schemas/execution.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError, PermissionDeniedError } from "../types/errors.ts"
import { runQuery, toWire } from "../utils/index.ts"
import { findSnapshotGaps, type SnapshotForGaps, type SnapshotGap } from "./production-issue.ts"
import { buildLineageWinnerFilter } from "./recipes.ts"
import { brasiliaToday } from "./stock-math.ts"

type Row = Record<string, unknown>

const str = (value: unknown): string | null => (value == null ? null : String(value))
const num = (value: unknown): number => (value == null ? 0 : Number(value))

// ── Regras puras ────────────────────────────────────────────────────────────

/** "2026-09-26" → "26/09/2026". */
function formatBrDate(isoDate: string): string {
	const [year, month, day] = isoDate.split("-")
	return `${day}/${month}/${year}`
}

/** A execução é do dia de HOJE (Brasília). Outra data é planejamento. */
export function isExecutionDate(serviceDate: string, today: string = brasiliaToday()): boolean {
	return serviceDate === today
}

/** Recusa com instrução: diz qual é o dia de hoje e onde se inclui em outro dia. */
export function assertExecutionDate(serviceDate: string, today: string = brasiliaToday()): void {
	if (isExecutionDate(serviceDate, today)) return
	throw new DomainError(
		"EXECUTION_DATE_NOT_TODAY",
		`O turno inclui preparação só no cardápio de hoje (${formatBrDate(today)}). Para ${formatBrDate(serviceDate)}, a inclusão é pelo planejamento, no Agendamento da Produção.`
	)
}

/** Recusa de cardápio-modelo com preparação provisória, com o que fazer. `null` = nenhuma. */
export function describeProvisionalTemplateRefusal(provisionalNames: readonly string[]): string | null {
	if (provisionalNames.length === 0) return null
	const list = provisionalNames.map((name) => `"${name}"`).join(", ")
	const one = provisionalNames.length === 1
	return `${list} ${one ? "é preparação provisória" : "são preparações provisórias"}, criada${one ? "" : "s"} no turno sem ficha técnica. Complete a ficha em Preparações antes de usá-la${one ? "" : "s"} num cardápio-modelo: o anexo quantitativo e a compra dependem dela${one ? "" : "s"}.`
}

// ── Opções da tela do turno ─────────────────────────────────────────────────

export interface ExecutionRecipeOption {
	id: string
	name: string
	portion_yield: number | null
	/** Provisória ainda sem ficha: funciona no dia, a tela avisa. */
	provisional: boolean
}

export interface ExecutionOptions {
	today: string
	mealTypes: Array<{ id: string; name: string }>
	recipes: ExecutionRecipeOption[]
}

/**
 * O que o turno escolhe ao incluir: as refeições (sem as de sistema, como a do lanche, que só
 * recebe item pelo pedido) e as preparações do catálogo (global + da cozinha), uma por linhagem.
 * O turno em geral não tem `kitchen:1`, então a leitura é própria e não a do planejamento.
 */
export async function fetchExecutionOptions(db: SisubDb, ctx: UserContext, input: FetchExecutionOptions): Promise<ExecutionOptions> {
	requireKitchenExecution(ctx, input.kitchenId)

	const [mealRows, recipeRows] = await Promise.all([
		runQuery(
			"FETCH_FAILED",
			() =>
				db
					.select({ id: mealTypeInKitchen.id, name: mealTypeInKitchen.name })
					.from(mealTypeInKitchen)
					.where(
						and(
							isNull(mealTypeInKitchen.deletedAt),
							isNull(mealTypeInKitchen.systemKey),
							or(isNull(mealTypeInKitchen.kitchenId), eq(mealTypeInKitchen.kitchenId, input.kitchenId))
						)
					)
					// `asc` já põe o nulo por último no Postgres (o `nulls last` do SQL anterior).
					.orderBy(asc(mealTypeInKitchen.sortOrder), asc(mealTypeInKitchen.name)),
			{ prefix: "Erro ao ler as refeições" }
		),
		// Uma por linhagem, escolhida pelo Postgres com a MESMA regra das listagens
		// (`buildLineageWinnerFilter`, #465): local antes de global, maior versão, `id` no empate.
		runQuery(
			"FETCH_FAILED",
			() =>
				db
					.select({
						id: recipesInKitchen.id,
						name: recipesInKitchen.name,
						portionYield: recipesInKitchen.portionYield,
						provisional: sql<boolean>`(${recipesInKitchen.provisionalSince} is not null)`,
					})
					.from(recipesInKitchen)
					.where(buildLineageWinnerFilter(db, { kitchenId: input.kitchenId })),
			{ prefix: "Erro ao ler as preparações" }
		),
	])

	return {
		today: brasiliaToday(),
		// `meal_type.name` é anulável: sem nome, a tela mostra o marcador, nunca a string "null".
		mealTypes: mealRows.map((row) => ({ id: row.id, name: row.name ?? "(sem nome)" })),
		recipes: recipeRows
			.map((row) => ({
				id: row.id,
				name: row.name,
				portion_yield: row.portionYield == null ? null : Number(row.portionYield),
				provisional: Boolean(row.provisional),
			}))
			.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
	}
}

// ── Incluir no dia ──────────────────────────────────────────────────────────

export interface AddExecutionMenuItemResult {
	menuItemId: string
	dailyMenuId: string
	taskId: string
	recipeId: string
	/** A preparação foi criada agora como provisória (ou reaproveitada uma provisória pendente). */
	provisional: boolean
}

/**
 * Inclui uma preparação no cardápio de HOJE pelo turno.
 *
 * Num gesto: cria o cardápio da refeição se ainda não existe, cria a preparação provisória se
 * ela não está no catálogo, grava o item com o snapshot da ficha e quem/quando/por quê, e já
 * gera a tarefa de produção (o quadro mostra na hora). Tudo numa transação — sem cardápio
 * vazio nem item sem tarefa no meio.
 */
export async function addExecutionMenuItem(
	db: SisubDb,
	ctx: UserContext,
	input: AddExecutionMenuItem,
	now: Date = new Date()
): Promise<AddExecutionMenuItemResult> {
	requireKitchenExecution(ctx, input.kitchenId)
	assertExecutionDate(input.serviceDate, brasiliaToday(now))

	const [mealType] = await runQuery(
		"FETCH_FAILED",
		() =>
			db
				.select({ id: mealTypeInKitchen.id })
				.from(mealTypeInKitchen)
				.where(
					and(
						eq(mealTypeInKitchen.id, input.mealTypeId),
						isNull(mealTypeInKitchen.deletedAt),
						isNull(mealTypeInKitchen.systemKey),
						or(isNull(mealTypeInKitchen.kitchenId), eq(mealTypeInKitchen.kitchenId, input.kitchenId))
					)
				),
		{ prefix: "Erro ao conferir a refeição" }
	)
	if (!mealType) throw new NotFoundError("meal_type", input.mealTypeId)

	// Dentro de `runQuery`: constraint, FK ou deadlock no meio da transação vira
	// `QueryFailedError` com o prefixo de negócio, e não o erro cru do driver com o SQL.
	// O `DomainError` lançado lá dentro passa intacto.
	return runQuery("INSERT_FAILED", () => addExecutionMenuItemTx(db, ctx, input), { prefix: "Erro ao incluir a preparação no dia" })
}

async function addExecutionMenuItemTx(db: SisubDb, ctx: UserContext, input: AddExecutionMenuItem): Promise<AddExecutionMenuItemResult> {
	return db.transaction(async (tx) => {
		// ── a preparação ──────────────────────────────────────────────────────
		let recipeId: string
		let provisional = false
		if (input.provisionalRecipeName) {
			const name = input.provisionalRecipeName.trim()
			// A mesma provisória ainda pendente é reaproveitada: "farofa" incluída na segunda e na
			// quarta é UMA ficha para a nutricionista completar, não duas.
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`provisional-recipe:${input.kitchenId}:${name.toLowerCase()}`}))`)
			const [existing] = (await tx.execute(sql`
				select r.id from kitchen.recipes r
				where r.kitchen_id = ${input.kitchenId} and r.deleted_at is null and r.provisional_since is not null
					and lower(btrim(r.name)) = lower(${name})
					and not exists (select 1 from kitchen.recipes v where v.base_recipe_id = coalesce(r.base_recipe_id, r.id) and v.created_at > r.created_at and v.deleted_at is null)
				order by r.created_at
				limit 1
			`)) as unknown as Row[]
			if (existing) {
				recipeId = String(existing.id)
			} else {
				// Sem rendimento: rendimento é da ficha. As porções do dia vão no ITEM; gravadas
				// aqui, dividiriam a quantidade quando a ficha fosse completada por receita.
				const [created] = await tx
					.insert(recipesInKitchen)
					.values({ name, kitchenId: input.kitchenId, version: 1, portionYield: null, provisionalSince: sql`now()`, provisionalBy: ctx.userId })
					.returning({ id: recipesInKitchen.id })
				if (!created) throw new DomainError("INSERT_FAILED", "Não foi possível criar a preparação provisória")
				recipeId = String(created.id)
			}
			provisional = true
		} else {
			recipeId = input.recipeId as string
		}

		const recipe = await tx.query.recipesInKitchen.findFirst({
			where: and(eq(recipesInKitchen.id, recipeId), isNull(recipesInKitchen.deletedAt)),
			with: { recipeIngredientsInKitchens: { with: { ingredientInKitchen: true } } },
		})
		// Mesmo erro para "não existe" e "é de outra cozinha": sondar id não distingue os dois.
		if (!recipe || (recipe.kitchenId !== null && recipe.kitchenId !== input.kitchenId)) throw new NotFoundError("recipe", recipeId)

		const provisionalSince = recipe.provisionalSince
		if (provisionalSince) provisional = true
		const snapshot = {
			...toWire<Record<string, unknown>>(recipe, { recipeIngredientsInKitchens: "ingredients", ingredientInKitchen: "ingredient" }),
			// A sugestão de saída e o aviso de ficha incompleta leem o snapshot, não a receita viva.
			provisional_since: provisionalSince,
		}

		// ── o cardápio da refeição de hoje ────────────────────────────────────
		// Insere sem conflito e, se o cardápio já existe (ou outro turno o criou no mesmo instante),
		// lê o existente: `do nothing` não devolve a linha. O alvo repete o predicado do índice único
		// PARCIAL (`daily_menu_active_unique ... where deleted_at is null`); sem ele o Postgres não
		// infere o índice e a inserção falha com 42P10.
		const menuColumns = { id: dailyMenuInKitchen.id, forecastedHeadcount: dailyMenuInKitchen.forecastedHeadcount }
		const [menuRow] = await tx
			.insert(dailyMenuInKitchen)
			.values({ kitchenId: input.kitchenId, serviceDate: input.serviceDate, mealTypeId: input.mealTypeId, status: "PLANNED" })
			.onConflictDoNothing({
				target: [dailyMenuInKitchen.serviceDate, dailyMenuInKitchen.mealTypeId, dailyMenuInKitchen.kitchenId],
				where: sql`deleted_at is null`,
			})
			.returning(menuColumns)
		const dailyMenu =
			menuRow ??
			(
				await tx
					.select(menuColumns)
					.from(dailyMenuInKitchen)
					.where(
						and(
							eq(dailyMenuInKitchen.kitchenId, input.kitchenId),
							eq(dailyMenuInKitchen.serviceDate, input.serviceDate),
							eq(dailyMenuInKitchen.mealTypeId, input.mealTypeId),
							isNull(dailyMenuInKitchen.deletedAt)
						)
					)
			)[0]
		if (!dailyMenu) throw new DomainError("UPSERT_FAILED", "Não foi possível abrir o cardápio de hoje")
		const dailyMenuId = dailyMenu.id

		const [sortRow] = await tx
			.select({ last: max(menuItemsInKitchen.sortOrder) })
			.from(menuItemsInKitchen)
			.where(and(eq(menuItemsInKitchen.dailyMenuId, dailyMenuId), isNull(menuItemsInKitchen.itemGroup), isNull(menuItemsInKitchen.deletedAt)))

		// Porções: as informadas; senão o efetivo da refeição, quando há. Sem nenhum dos dois o
		// item entra sem porções — a tarefa mostra "ficha incompleta" em vez de inventar número.
		const headcount = dailyMenu.forecastedHeadcount
		const plannedPortions = input.plannedPortionQuantity ?? headcount ?? null

		const [item] = await tx
			.insert(menuItemsInKitchen)
			.values({
				dailyMenuId,
				recipeOriginId: recipeId,
				recipe: snapshot,
				...(plannedPortions != null && { plannedPortionQuantity: plannedPortions }),
				itemGroup: null,
				sortOrder: sortRow?.last == null ? 0 : Number(sortRow.last) + 1,
				recommendedProportion: null,
			})
			.returning({ id: menuItemsInKitchen.id })
		if (!item) throw new DomainError("INSERT_FAILED", "Não foi possível incluir a preparação")

		await tx
			.update(menuItemsInKitchen)
			.set({ addedInExecutionAt: sql`now()`, addedInExecutionBy: ctx.userId, executionReason: input.reason.trim() })
			.where(eq(menuItemsInKitchen.id, item.id))

		// ── a tarefa do quadro ────────────────────────────────────────────────
		const [task] = await tx
			.insert(productionTaskInKitchen)
			.values({ kitchenId: input.kitchenId, menuItemId: item.id, productionDate: input.serviceDate, status: "PENDING" })
			.onConflictDoNothing({ target: productionTaskInKitchen.menuItemId })
			.returning({ id: productionTaskInKitchen.id })
		if (!task) throw new DomainError("INSERT_FAILED", "Não foi possível criar a tarefa de produção")

		return { menuItemId: item.id, dailyMenuId, taskId: task.id, recipeId, provisional }
	})
}

// ── Revisão pela nutricionista ──────────────────────────────────────────────

/** Marca como revisada a inclusão feita pelo turno. Idempotente: revisar de novo não muda a primeira revisão. */
export async function reviewExecutionMenuItem(db: SisubDb, ctx: UserContext, input: ReviewExecutionMenuItem): Promise<{ reviewed: boolean }> {
	const kitchenId = await resolveKitchenFromMenuItem(db, input.menuItemId)
	requireKitchen(ctx, 2, kitchenId)

	const [row] = await runQuery(
		"UPDATE_FAILED",
		() =>
			db
				.select({ addedInExecutionAt: menuItemsInKitchen.addedInExecutionAt, executionReviewedAt: menuItemsInKitchen.executionReviewedAt })
				.from(menuItemsInKitchen)
				.where(eq(menuItemsInKitchen.id, input.menuItemId)),
		{ prefix: "Erro ao ler a inclusão" }
	)
	if (!row) throw new NotFoundError("menu_item", input.menuItemId)
	if (row.addedInExecutionAt == null)
		throw new DomainError("NOT_EXECUTION_ITEM", "Esta preparação veio do planejamento, não do turno: não há inclusão a revisar.")
	if (row.executionReviewedAt != null) return { reviewed: true }

	await runQuery(
		"UPDATE_FAILED",
		() =>
			db
				.update(menuItemsInKitchen)
				.set({ executionReviewedAt: sql`now()`, executionReviewedBy: ctx.userId })
				.where(and(eq(menuItemsInKitchen.id, input.menuItemId), isNull(menuItemsInKitchen.executionReviewedAt))),
		{ prefix: "Erro ao registrar a revisão" }
	)
	return { reviewed: true }
}

// ── Pendências da execução (fluxo "Revisar a execução") ─────────────────────

export interface ExecutionAddedItem {
	menuItemId: string
	serviceDate: string
	mealTypeName: string | null
	recipeId: string | null
	recipeName: string
	provisional: boolean
	reason: string
	addedAt: string
	addedBy: string | null
}

export interface ProvisionalRecipePending {
	id: string
	name: string
	since: string
	createdBy: string | null
	/** Em quantos itens do calendário ela já entrou. */
	uses: number
}

export interface IncompleteSnapshotItem {
	menuItemId: string
	serviceDate: string
	recipeName: string
	gaps: SnapshotGap[]
}

export interface ExecutionReviewStatus {
	kitchenId: number
	today: string
	addedItems: ExecutionAddedItem[]
	provisionalRecipes: ProvisionalRecipePending[]
	incompleteItems: IncompleteSnapshotItem[]
	/** Dias de saída que fecharam sozinhos com desvio sem motivo. Quem resolve é o Estoque. */
	unexplainedIssueDays: Array<{ requestId: string; issueDate: string }>
	/** Congeladas provisórias criadas para sobra. Quem resolve é a SDAB (catálogo global). */
	provisionalFrozenPreparations: Array<{ id: string; description: string; since: string }>
}

/** Janela das fichas incompletas: o que está para ser produzido e o que acabou de ser. */
const INCOMPLETE_WINDOW_PAST_DAYS = 14
const INCOMPLETE_WINDOW_NEXT_DAYS = 7

export async function fetchExecutionReviewStatus(db: SisubDb, ctx: UserContext, input: FetchExecutionReviewStatus): Promise<ExecutionReviewStatus> {
	requireKitchen(ctx, 1, input.kitchenId)
	const kitchenId = input.kitchenId
	const today = brasiliaToday()

	const [added, provisional, recent, unexplained, frozen] = (await Promise.all([
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select mi.id, dm.service_date, mt.name as meal_type_name, mi.recipe_origin_id, mi.recipe ->> 'name' as recipe_name,
						(mi.recipe ->> 'provisional_since') is not null as provisional,
						mi.execution_reason, mi.added_in_execution_at, u.email as added_by
					from kitchen.menu_items mi
					join kitchen.daily_menu dm on dm.id = mi.daily_menu_id
					left join kitchen.meal_type mt on mt.id = dm.meal_type_id
					left join core.user_data u on u.id = mi.added_in_execution_by
					where dm.kitchen_id = ${kitchenId} and mi.deleted_at is null and dm.deleted_at is null
						and mi.added_in_execution_at is not null and mi.execution_reviewed_at is null
					order by mi.added_in_execution_at desc
					limit 200
				`),
			{ prefix: "Erro ao ler as inclusões do turno" }
		),
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select r.id, r.name, r.provisional_since, u.email as created_by,
						(select count(*) from kitchen.menu_items mi where mi.recipe_origin_id = r.id and mi.deleted_at is null) as uses
					from kitchen.recipes r
					left join core.user_data u on u.id = r.provisional_by
					where r.kitchen_id = ${kitchenId} and r.deleted_at is null and r.provisional_since is not null
						and not exists (
							select 1 from kitchen.recipes v
							where v.base_recipe_id = coalesce(r.base_recipe_id, r.id) and v.created_at > r.created_at and v.deleted_at is null
						)
					order by r.provisional_since
				`),
			{ prefix: "Erro ao ler as preparações provisórias" }
		),
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select mi.id, dm.service_date, mi.recipe, mi.planned_portion_quantity
					from kitchen.menu_items mi
					join kitchen.daily_menu dm on dm.id = mi.daily_menu_id
					where dm.kitchen_id = ${kitchenId} and mi.deleted_at is null and dm.deleted_at is null
						and dm.service_date between (${today}::date - ${INCOMPLETE_WINDOW_PAST_DAYS}::int) and (${today}::date + ${INCOMPLETE_WINDOW_NEXT_DAYS}::int)
					order by dm.service_date
				`),
			{ prefix: "Erro ao ler as fichas do calendário" }
		),
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select r.id, r.issue_date from inventory.stock_issue_request r
					where r.kitchen_id = ${kitchenId} and r.status = 'closed_unexplained' and r.explained_at is null
					order by r.issue_date desc
					limit 60
				`),
			{ prefix: "Erro ao ler os dias de saída sem justificativa" }
		),
		runQuery(
			"FETCH_FAILED",
			() =>
				db.execute(sql`
					select fp.id, fp.description, fp.provisional_since from kitchen.frozen_preparation fp
					where fp.provisional_kitchen_id = ${kitchenId} and fp.provisional_reviewed_at is null and fp.deleted_at is null
					order by fp.provisional_since
				`),
			{ prefix: "Erro ao ler as congeladas provisórias" }
		),
	])) as unknown as Row[][]

	const incompleteItems: IncompleteSnapshotItem[] = []
	for (const row of recent) {
		const snapshot = (typeof row.recipe === "string" ? JSON.parse(row.recipe) : row.recipe) as (SnapshotForGaps & { name?: string }) | null
		// Provisória tem pendência própria (a ficha a completar); aqui entra a ficha que existe e está incompleta.
		const gaps = findSnapshotGaps(snapshot, row.planned_portion_quantity as number | null).filter((gap) => gap !== "provisional")
		if (snapshot?.provisional_since || gaps.length === 0) continue
		incompleteItems.push({ menuItemId: String(row.id), serviceDate: String(row.service_date), recipeName: snapshot?.name ?? "(sem nome)", gaps })
	}

	return {
		kitchenId,
		today,
		addedItems: added.map((row) => ({
			menuItemId: String(row.id),
			serviceDate: String(row.service_date),
			mealTypeName: str(row.meal_type_name),
			recipeId: str(row.recipe_origin_id),
			recipeName: str(row.recipe_name) ?? "(sem nome)",
			provisional: Boolean(row.provisional),
			reason: String(row.execution_reason ?? ""),
			addedAt: String(row.added_in_execution_at),
			addedBy: str(row.added_by),
		})),
		provisionalRecipes: provisional.map((row) => ({
			id: String(row.id),
			name: String(row.name),
			since: String(row.provisional_since),
			createdBy: str(row.created_by),
			uses: num(row.uses),
		})),
		incompleteItems,
		unexplainedIssueDays: unexplained.map((row) => ({ requestId: String(row.id), issueDate: String(row.issue_date) })),
		provisionalFrozenPreparations: frozen.map((row) => ({ id: String(row.id), description: String(row.description), since: String(row.provisional_since) })),
	}
}

// ── Congelada provisória (sobra): revisão da SDAB ───────────────────────────

export interface ProvisionalFrozenPreparation {
	id: string
	description: string
	measure_unit: string | null
	shelf_life_days: number | null
	kitchen_id: number
	kitchen_name: string
	since: string
	created_by: string | null
	lots: number
}

/** Congeladas criadas pelas cozinhas para registrar sobra, esperando a SDAB. */
export async function listPendingProvisionalFrozenPreparations(db: SisubDb, ctx: UserContext): Promise<ProvisionalFrozenPreparation[]> {
	requirePermission(ctx, "global", 1)
	const rows = (await runQuery(
		"FETCH_FAILED",
		() =>
			db.execute(sql`
				select fp.id, fp.description, fp.measure_unit, fp.shelf_life_days, fp.provisional_kitchen_id, fp.provisional_since,
					coalesce(k.display_name, 'Cozinha ' || k.id) as kitchen_name, u.email as created_by,
					(select count(*) from inventory.stock_lot l where l.frozen_preparation_id = fp.id) as lots
				from kitchen.frozen_preparation fp
				join kitchen.kitchen k on k.id = fp.provisional_kitchen_id
				left join core.user_data u on u.id = fp.provisional_by
				where fp.provisional_since is not null and fp.provisional_reviewed_at is null and fp.deleted_at is null
				order by fp.provisional_since
			`),
		{ prefix: "Erro ao ler as congeladas provisórias" }
	)) as unknown as Row[]
	return rows.map((row) => ({
		id: String(row.id),
		description: String(row.description),
		measure_unit: str(row.measure_unit),
		shelf_life_days: row.shelf_life_days == null ? null : Number(row.shelf_life_days),
		kitchen_id: Number(row.provisional_kitchen_id),
		kitchen_name: String(row.kitchen_name),
		since: String(row.provisional_since),
		created_by: str(row.created_by),
		lots: num(row.lots),
	}))
}

/**
 * A SDAB aceita a congelada provisória no catálogo: ela passa a valer para todas as cozinhas.
 * Corrigir nome, validade ou unidade é a edição comum do catálogo, antes ou depois.
 */
export async function reviewProvisionalFrozenPreparation(
	db: SisubDb,
	ctx: UserContext,
	input: ReviewProvisionalFrozenPreparation
): Promise<{ reviewed: boolean }> {
	requirePermission(ctx, "global", 2)
	const rows = await runQuery(
		"UPDATE_FAILED",
		() =>
			db
				.update(frozenPreparationInKitchen)
				.set({
					provisionalReviewedAt: sql`coalesce(${frozenPreparationInKitchen.provisionalReviewedAt}, now())`,
					provisionalReviewedBy: sql`coalesce(${frozenPreparationInKitchen.provisionalReviewedBy}, ${ctx.userId})`,
				})
				.where(
					and(eq(frozenPreparationInKitchen.id, input.id), isNotNull(frozenPreparationInKitchen.provisionalSince), isNull(frozenPreparationInKitchen.deletedAt))
				)
				.returning({ id: frozenPreparationInKitchen.id }),
		{ prefix: "Erro ao registrar a revisão" }
	)
	if (rows.length === 0) throw new NotFoundError("frozen_preparation", input.id)
	return { reviewed: true }
}

// ── Tarefas de produção do dia sem o quadro aberto ──────────────────────────

/**
 * Cria as tarefas PENDENTES que faltam para os itens do dia.
 *
 * A sugestão de saída lê `production_task`, que só nascia quando alguém abria o quadro da
 * produção: a cozinha que abre o estoque antes ficava com a sugestão vazia. Autoriza por
 * dentro, como toda operation exportada: quem opera o quadro (`kitchen-production:1`) ou quem
 * abre a requisição do dia (`storage:2`), sempre na cozinha do input.
 */
export async function ensureIssueDayProductionTasks(db: SisubDb, ctx: UserContext, input: { kitchenId: number; date: string }): Promise<{ created: number }> {
	const scope = { type: "kitchen", id: input.kitchenId } as const
	if (!hasPermission(ctx.permissions, "kitchen-production", 1, scope) && !hasPermission(ctx.permissions, "storage", 2, scope)) {
		throw new PermissionDeniedError("kitchen-production:1 | storage:2", 1, scope)
	}
	return createMissingProductionTasks(db, input)
}

/** SEM guarda — só para as operations deste pacote que já autorizaram (`ensureProductionTasks`). Fora do índice. */
export async function createMissingProductionTasks(db: SisubDb, input: { kitchenId: number; date: string }): Promise<{ created: number }> {
	const dailyMenus = await runQuery("FETCH_FAILED", () =>
		db.query.dailyMenuInKitchen.findMany({
			columns: { id: true },
			with: { menuItemsInKitchens: { where: isNull(menuItemsInKitchen.deletedAt), columns: { id: true } } },
			where: and(eq(dailyMenuInKitchen.kitchenId, input.kitchenId), eq(dailyMenuInKitchen.serviceDate, input.date), isNull(dailyMenuInKitchen.deletedAt)),
		})
	)
	const menuItemIds = dailyMenus.flatMap((menu) => (menu.menuItemsInKitchens ?? []).map((item) => item.id))
	if (menuItemIds.length === 0) return { created: 0 }

	const inserted = await runQuery("INSERT_FAILED", () =>
		db
			.insert(productionTaskInKitchen)
			.values(menuItemIds.map((menuItemId) => ({ kitchenId: input.kitchenId, menuItemId, productionDate: input.date, status: "PENDING" as const })))
			.onConflictDoNothing({ target: productionTaskInKitchen.menuItemId })
			.returning({ id: productionTaskInKitchen.id })
	)
	return { created: inserted.length }
}
