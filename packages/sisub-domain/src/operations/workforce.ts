/**
 * Operations da matriz de efetivo por refeitório — camada Drizzle.
 *
 * Autorização, resumida:
 *   - matriz de UMA unidade: leitura com `local-analytics` OU `unit` nível 1 naquela unidade;
 *     escrita com nível 2. O gestor do ELO preenche o próprio ELO e mais nada.
 *   - visão de REDE: `analytics` nível 2, o mesmo gate de `/analytics/global`.
 *   - abrir/fechar competência e mexer no roster de refeitórios: `admin` nível 2 — é governança
 *     de plataforma, rara e de alto risco, não gestão diária de conteúdo.
 *
 * O escopo da escrita é lido da LINHA (`mess_hall_workforce.unit_id`), nunca do input: aceitar o
 * `unitId` que veio na requisição deixaria qualquer gestor gravar efetivo no refeitório de outro ELO
 * declarando a própria unidade. Mesma lição do fallback de `kitchen:2` em ativo global.
 *
 * As relações vêm por QUERY SEPARADA, não por `with` aninhado — o join
 * mess_hall_workforce → submission → headcount → category gera alias acima de 63 chars (NAMEDATALEN),
 * que o Postgres trunca e o Drizzle não casa de volta, devolvendo relation vazia em silêncio.
 */

import {
	mealPresencesInKitchen,
	messHallsInKitchen,
	messHallWorkforceInKitchen,
	otherPresencesInKitchen,
	type SisubDb,
	workforceCategoryInKitchen,
	workforceHeadcountInKitchen,
	workforceNoteInKitchen,
	workforceSubmissionInKitchen,
	workforceSurveyInKitchen,
} from "@iefa/database/drizzle/sisub"
import type { MessHallWorkforce, WorkforceCategory, WorkforceNote, WorkforceSurvey } from "@iefa/database/sisub"
import { and, asc, count, countDistinct, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireAnyPermission, requirePermission } from "../guards/require-permission.ts"
import type {
	AddWorkforceNote,
	CloseWorkforceSurvey,
	CreateMessHallWorkforce,
	CreateWorkforceSurvey,
	DeleteWorkforceNote,
	FetchWorkforceMatrix,
	FetchWorkforceNetwork,
	ListWorkforceSurveys,
	SaveWorkforceSubmission,
	UpdateMessHallWorkforce,
} from "../schemas/workforce.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toWire } from "../utils/index.ts"
import {
	computeMessHallWorkforceMetrics,
	coverageGaps,
	groupWorkforceBy,
	type MealLoadInput,
	type MessHallWorkforceInput,
	type MessHallWorkforceMetrics,
	mealsPerWorker,
	summarizeWorkforce,
	type WorkforceGroupSummary,
} from "../utils/workforce-metrics.ts"

// ── Contrato de retorno ───────────────────────────────────────────────────

export type MessHallWorkforceWire = MessHallWorkforceMetrics & {
	mess_hall_name: string | null
	produces_own_meals: boolean
	/** Por código de categoria; categoria ausente = campo em branco, distinto de 0. */
	headcounts: Record<string, number>
	notes: WorkforceNote[]
	/** Comensais/dia por militar disponível. null quando falta refeitório, presença ou efetivo. */
	meals_per_worker: number | null
}

export type WorkforceMatrixWire = {
	survey: WorkforceSurvey | null
	categories: WorkforceCategory[]
	/** Uma linha por refeitório do levantamento (`kitchen.mess_hall_workforce`), não por refeitório cadastrado. */
	mess_hall_workforce: MessHallWorkforceWire[]
	summary: WorkforceGroupSummary
}

export type WorkforceNetworkWire = WorkforceMatrixWire & {
	by_elo: WorkforceGroupSummary[]
	/** Refeitórios que responderam e não têm nutricionista nem TND, do maior efetivo ao menor. */
	coverage_gaps: MessHallWorkforceWire[]
}

// ── Projeções ─────────────────────────────────────────────────────────────

const CATEGORY_COLS = {
	id: workforceCategoryInKitchen.id,
	code: workforceCategoryInKitchen.code,
	name: workforceCategoryInKitchen.name,
	description: workforceCategoryInKitchen.description,
	sort_order: workforceCategoryInKitchen.sortOrder,
	is_career: workforceCategoryInKitchen.isCareer,
	is_technical: workforceCategoryInKitchen.isTechnical,
	created_at: workforceCategoryInKitchen.createdAt,
	deleted_at: workforceCategoryInKitchen.deletedAt,
} as const

const SURVEY_COLS = {
	id: workforceSurveyInKitchen.id,
	reference_date: workforceSurveyInKitchen.referenceDate,
	title: workforceSurveyInKitchen.title,
	status: workforceSurveyInKitchen.status,
	source: workforceSurveyInKitchen.source,
	opened_at: workforceSurveyInKitchen.openedAt,
	closed_at: workforceSurveyInKitchen.closedAt,
	created_by: workforceSurveyInKitchen.createdBy,
	created_at: workforceSurveyInKitchen.createdAt,
} as const

const MESS_HALL_WORKFORCE_COLS = {
	id: messHallWorkforceInKitchen.id,
	unit_id: messHallWorkforceInKitchen.unitId,
	elo_code: messHallWorkforceInKitchen.eloCode,
	code: messHallWorkforceInKitchen.code,
	display_name: messHallWorkforceInKitchen.displayName,
	mess_hall_id: messHallWorkforceInKitchen.messHallId,
	kitchen_id: messHallWorkforceInKitchen.kitchenId,
	produces_own_meals: messHallWorkforceInKitchen.producesOwnMeals,
	active: messHallWorkforceInKitchen.active,
	notes: messHallWorkforceInKitchen.notes,
	created_at: messHallWorkforceInKitchen.createdAt,
	updated_at: messHallWorkforceInKitchen.updatedAt,
} as const

const NOTE_COLS = {
	id: workforceNoteInKitchen.id,
	submission_id: workforceNoteInKitchen.submissionId,
	kind: workforceNoteInKitchen.kind,
	quantity: workforceNoteInKitchen.quantity,
	detail: workforceNoteInKitchen.detail,
	created_at: workforceNoteInKitchen.createdAt,
} as const

// ── Leitura ───────────────────────────────────────────────────────────────

export async function listWorkforceSurveys(db: SisubDb, ctx: UserContext, input: ListWorkforceSurveys): Promise<WorkforceSurvey[]> {
	requireAnyPermission(ctx, ["analytics", "local-analytics", "unit"], 1)
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select(SURVEY_COLS).from(workforceSurveyInKitchen).orderBy(desc(workforceSurveyInKitchen.referenceDate)).limit(input.limit)
	)
	return toWire<WorkforceSurvey[]>(rows)
}

async function resolveSurvey(db: SisubDb, surveyId: string | null | undefined): Promise<WorkforceSurvey | null> {
	const rows = await runQuery("FETCH_FAILED", () => {
		const q = db.select(SURVEY_COLS).from(workforceSurveyInKitchen)
		return surveyId ? q.where(eq(workforceSurveyInKitchen.id, surveyId)).limit(1) : q.orderBy(desc(workforceSurveyInKitchen.referenceDate)).limit(1)
	})
	const row = rows[0]
	if (!row && surveyId) throw new NotFoundError("workforce_survey", surveyId)
	return row ? toWire<WorkforceSurvey>(row) : null
}

/**
 * Carga de comensais por refeitório no período coberto pela competência.
 *
 * Conta presenças de militares e de "outros" (visitante, convidado) no mesmo balde: as duas
 * disputam a mesma guarnição. A janela é o mês da competência — comparar efetivo de agosto
 * com presença do ano inteiro daria uma média sem sentido.
 */
async function fetchMealLoad(db: SisubDb, messHallIds: number[], referenceDate: string): Promise<Map<number, MealLoadInput>> {
	const load = new Map<number, MealLoadInput>()
	if (messHallIds.length === 0) return load

	const monthStart = sql`date_trunc('month', ${referenceDate}::date)::date`
	const monthEnd = sql`(date_trunc('month', ${referenceDate}::date) + interval '1 month')::date`

	const [meal, other] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					messHallId: mealPresencesInKitchen.messHallId,
					presences: count(),
					activeDays: countDistinct(mealPresencesInKitchen.date),
				})
				.from(mealPresencesInKitchen)
				.where(
					and(
						inArray(mealPresencesInKitchen.messHallId, messHallIds),
						sql`${mealPresencesInKitchen.date} >= ${monthStart}`,
						sql`${mealPresencesInKitchen.date} < ${monthEnd}`
					)
				)
				.groupBy(mealPresencesInKitchen.messHallId)
		),
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					messHallId: otherPresencesInKitchen.messHallId,
					presences: count(),
					activeDays: countDistinct(otherPresencesInKitchen.date),
				})
				.from(otherPresencesInKitchen)
				.where(
					and(
						inArray(otherPresencesInKitchen.messHallId, messHallIds),
						sql`${otherPresencesInKitchen.date} >= ${monthStart}`,
						sql`${otherPresencesInKitchen.date} < ${monthEnd}`
					)
				)
				.groupBy(otherPresencesInKitchen.messHallId)
		),
	])

	for (const row of [...meal, ...other]) {
		const id = Number(row.messHallId)
		const prev = load.get(id)
		load.set(id, {
			presences: (prev?.presences ?? 0) + Number(row.presences),
			// Dias ativos NÃO somam entre as duas tabelas: são o mesmo calendário visto duas
			// vezes. Somar dobraria o denominador e cortaria a carga pela metade.
			activeDays: Math.max(prev?.activeDays ?? 0, Number(row.activeDays)),
		})
	}
	return load
}

/** Monta a matriz a partir de um conjunto de refeitórios do levantamento já filtrado e autorizado. */
async function buildMatrix(db: SisubDb, roster: MessHallWorkforce[], survey: WorkforceSurvey | null, summaryKey: string): Promise<WorkforceMatrixWire> {
	const categories = toWire<WorkforceCategory[]>(
		await runQuery("FETCH_FAILED", () =>
			db
				.select(CATEGORY_COLS)
				.from(workforceCategoryInKitchen)
				.where(isNull(workforceCategoryInKitchen.deletedAt))
				.orderBy(asc(workforceCategoryInKitchen.sortOrder))
		)
	)

	const messHallWorkforceIds = roster.map((r) => Number(r.id))
	const messHallIds = [...new Set(roster.map((r) => r.mess_hall_id).filter((id): id is number => id != null))]

	const submissions =
		survey && messHallWorkforceIds.length > 0
			? await runQuery("FETCH_FAILED", () =>
					db
						.select({
							id: workforceSubmissionInKitchen.id,
							messHallWorkforceId: workforceSubmissionInKitchen.messHallWorkforceId,
							declaredTotal: workforceSubmissionInKitchen.declaredTotal,
						})
						.from(workforceSubmissionInKitchen)
						.where(and(eq(workforceSubmissionInKitchen.surveyId, survey.id), inArray(workforceSubmissionInKitchen.messHallWorkforceId, messHallWorkforceIds)))
				)
			: []

	const submissionIds = submissions.map((s) => s.id)
	const [headcounts, notes, load] = await Promise.all([
		submissionIds.length > 0
			? runQuery("FETCH_FAILED", () =>
					db
						.select({
							submissionId: workforceHeadcountInKitchen.submissionId,
							code: workforceCategoryInKitchen.code,
							headcount: workforceHeadcountInKitchen.headcount,
						})
						.from(workforceHeadcountInKitchen)
						.innerJoin(workforceCategoryInKitchen, eq(workforceCategoryInKitchen.id, workforceHeadcountInKitchen.categoryId))
						.where(inArray(workforceHeadcountInKitchen.submissionId, submissionIds))
				)
			: Promise.resolve([]),
		submissionIds.length > 0
			? runQuery("FETCH_FAILED", () =>
					db
						.select(NOTE_COLS)
						.from(workforceNoteInKitchen)
						.where(inArray(workforceNoteInKitchen.submissionId, submissionIds))
						.orderBy(asc(workforceNoteInKitchen.createdAt))
				)
			: Promise.resolve([]),
		survey ? fetchMealLoad(db, messHallIds, survey.reference_date) : Promise.resolve(new Map<number, MealLoadInput>()),
	])

	const submissionByMessHallWorkforce = new Map(submissions.map((s) => [Number(s.messHallWorkforceId), s]))
	const headcountsBySubmission = new Map<string, Record<string, number>>()
	for (const h of headcounts) {
		const bucket = headcountsBySubmission.get(h.submissionId) ?? {}
		bucket[h.code] = h.headcount
		headcountsBySubmission.set(h.submissionId, bucket)
	}
	const notesBySubmission = new Map<string, WorkforceNote[]>()
	for (const n of toWire<WorkforceNote[]>(notes)) {
		const bucket = notesBySubmission.get(n.submission_id) ?? []
		bucket.push(n)
		notesBySubmission.set(n.submission_id, bucket)
	}

	const messHallNames =
		messHallIds.length > 0
			? new Map(
					(
						await runQuery("FETCH_FAILED", () =>
							db
								.select({ id: messHallsInKitchen.id, code: messHallsInKitchen.code, displayName: messHallsInKitchen.displayName })
								.from(messHallsInKitchen)
								// `mess_halls.id` é bigserial lido como number (patch-drizzle-pull.ts, passo 10).
								.where(inArray(messHallsInKitchen.id, messHallIds))
						)
					).map((m) => [Number(m.id), m.displayName ?? m.code])
				)
			: new Map<number, string>()

	const rows: MessHallWorkforceWire[] = roster.map((r) => {
		const messHallWorkforceId = Number(r.id)
		const submission = submissionByMessHallWorkforce.get(messHallWorkforceId)
		const headcountMap = submission ? (headcountsBySubmission.get(submission.id) ?? {}) : {}
		const rowNotes = submission ? (notesBySubmission.get(submission.id) ?? []) : []

		const input: MessHallWorkforceInput = {
			messHallWorkforceId,
			code: r.code,
			displayName: r.display_name,
			eloCode: r.elo_code,
			unitId: Number(r.unit_id),
			messHallId: r.mess_hall_id == null ? null : Number(r.mess_hall_id),
			headcounts: headcountMap,
			declaredTotal: submission?.declaredTotal ?? null,
			notes: rowNotes,
			answered: submission !== undefined,
		}
		const metrics = computeMessHallWorkforceMetrics(input, categories)
		return {
			...metrics,
			mess_hall_name: input.messHallId === null ? null : (messHallNames.get(input.messHallId) ?? null),
			produces_own_meals: r.produces_own_meals,
			headcounts: headcountMap,
			notes: rowNotes,
			meals_per_worker: mealsPerWorker(metrics, input.messHallId === null ? null : (load.get(input.messHallId) ?? null)),
		}
	})

	return { survey, categories, mess_hall_workforce: rows, summary: summarizeWorkforce(rows, summaryKey) }
}

export async function fetchWorkforceMatrix(db: SisubDb, ctx: UserContext, input: FetchWorkforceMatrix): Promise<WorkforceMatrixWire> {
	requireAnyPermission(ctx, ["local-analytics", "unit"], 1, { type: "unit", id: input.unitId })

	const survey = await resolveSurvey(db, input.surveyId)
	const roster = toWire<MessHallWorkforce[]>(
		await runQuery("FETCH_FAILED", () =>
			db
				.select(MESS_HALL_WORKFORCE_COLS)
				.from(messHallWorkforceInKitchen)
				.where(and(eq(messHallWorkforceInKitchen.unitId, input.unitId), eq(messHallWorkforceInKitchen.active, true)))
				.orderBy(asc(messHallWorkforceInKitchen.displayName))
		)
	)
	return buildMatrix(db, roster, survey, `unit:${input.unitId}`)
}

export async function fetchWorkforceNetwork(db: SisubDb, ctx: UserContext, input: FetchWorkforceNetwork): Promise<WorkforceNetworkWire> {
	requirePermission(ctx, "analytics", 2)

	const survey = await resolveSurvey(db, input.surveyId)
	const roster = toWire<MessHallWorkforce[]>(
		await runQuery("FETCH_FAILED", () =>
			db
				.select(MESS_HALL_WORKFORCE_COLS)
				.from(messHallWorkforceInKitchen)
				.where(eq(messHallWorkforceInKitchen.active, true))
				.orderBy(asc(messHallWorkforceInKitchen.eloCode), asc(messHallWorkforceInKitchen.displayName))
		)
	)
	const matrix = await buildMatrix(db, roster, survey, "rede")
	const byId = new Map(matrix.mess_hall_workforce.map((r) => [r.messHallWorkforceId, r]))
	return {
		...matrix,
		by_elo: groupWorkforceBy(matrix.mess_hall_workforce, (m) => m.eloCode),
		coverage_gaps: coverageGaps(matrix.mess_hall_workforce).map((m) => byId.get(m.messHallWorkforceId) as MessHallWorkforceWire),
	}
}

// ── Escrita ───────────────────────────────────────────────────────────────

/**
 * Autoriza a escrita pela unidade DONA do refeitório do levantamento, lida do banco. O `unitId` do input
 * nunca participa: o chamador não decide sobre qual ELO está escrevendo.
 */
async function requireMessHallWorkforceWrite(db: SisubDb, ctx: UserContext, messHallWorkforceId: number): Promise<{ unitId: number }> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ unitId: messHallWorkforceInKitchen.unitId, active: messHallWorkforceInKitchen.active })
			.from(messHallWorkforceInKitchen)
			.where(eq(messHallWorkforceInKitchen.id, messHallWorkforceId))
			.limit(1)
	)
	const row = rows[0]
	if (!row) throw new NotFoundError("mess_hall_workforce", messHallWorkforceId)
	if (!row.active) throw new DomainError("MESS_HALL_WORKFORCE_INACTIVE", "Refeitório inativo no levantamento não aceita preenchimento de efetivo")
	const unitId = Number(row.unitId)
	requireAnyPermission(ctx, ["local-analytics", "unit"], 2, { type: "unit", id: unitId })
	return { unitId }
}

async function requireOpenSurvey(db: SisubDb, surveyId: string): Promise<void> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ status: workforceSurveyInKitchen.status }).from(workforceSurveyInKitchen).where(eq(workforceSurveyInKitchen.id, surveyId)).limit(1)
	)
	const survey = rows[0]
	if (!survey) throw new NotFoundError("workforce_survey", surveyId)
	// Competência fechada é registro histórico: reabrir é ato de administração, não de
	// preenchimento. Sem isso, editar a coleta do mês passado apagaria a base de comparação
	// que a coleta deste mês usa para dizer "o que mudou".
	if (survey.status === "closed") throw new DomainError("SURVEY_CLOSED", "Competência já encerrada — abra uma nova para registrar alterações")
}

/**
 * Apaga a resposta do refeitório na competência, devolvendo-o ao estado "sem resposta".
 * O cascade leva quantitativos E observações: uma observação sem efetivo declarado não
 * descreve nada, e `addWorkforceNote` já exige a submission para existir.
 */
async function clearWorkforceSubmission(db: SisubDb, input: SaveWorkforceSubmission): Promise<MessHallWorkforceWire> {
	await runQuery("SAVE_FAILED", () =>
		db
			.delete(workforceSubmissionInKitchen)
			.where(and(eq(workforceSubmissionInKitchen.surveyId, input.surveyId), eq(workforceSubmissionInKitchen.messHallWorkforceId, input.messHallWorkforceId)))
	)
	return describeMessHallWorkforce(db, input.surveyId, input.messHallWorkforceId)
}

/** Recarrega um único refeitório do levantamento já com as métricas — retorno comum das escritas. */
async function describeMessHallWorkforce(db: SisubDb, surveyId: string, messHallWorkforceId: number): Promise<MessHallWorkforceWire> {
	const survey = await resolveSurvey(db, surveyId)
	const roster = toWire<MessHallWorkforce[]>(
		await runQuery("FETCH_FAILED", () =>
			db.select(MESS_HALL_WORKFORCE_COLS).from(messHallWorkforceInKitchen).where(eq(messHallWorkforceInKitchen.id, messHallWorkforceId)).limit(1)
		)
	)
	const matrix = await buildMatrix(db, roster, survey, `mess_hall_workforce:${messHallWorkforceId}`)
	const row = matrix.mess_hall_workforce[0]
	if (!row) throw new NotFoundError("mess_hall_workforce", messHallWorkforceId)
	return row
}

export async function saveWorkforceSubmission(db: SisubDb, ctx: UserContext, input: SaveWorkforceSubmission): Promise<MessHallWorkforceWire> {
	await requireMessHallWorkforceWrite(db, ctx, input.messHallWorkforceId)
	await requireOpenSurvey(db, input.surveyId)

	// Salvar com TUDO em branco significa "este refeitório não respondeu", e é como o gestor
	// desfaz um preenchimento equivocado. Criar a submission mesmo assim marcaria o refeitório
	// como respondido com total 0 — ele entraria na taxa de resposta, puxaria o total da
	// rede para baixo e apareceria na fila de lacunas de cobertura, sem nenhum caminho de
	// volta. É exatamente a invariante "ausência ≠ zero" que esta tabela existe para manter.
	const isBlank = input.declaredTotal == null && input.entries.every((e) => e.headcount === null)
	if (isBlank) return clearWorkforceSubmission(db, input)

	const categories = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: workforceCategoryInKitchen.id, code: workforceCategoryInKitchen.code })
			.from(workforceCategoryInKitchen)
			.where(isNull(workforceCategoryInKitchen.deletedAt))
	)
	const categoryByCode = new Map(categories.map((c) => [c.code, c.id]))
	const unknown = input.entries.map((e) => e.categoryCode).filter((code) => !categoryByCode.has(code))
	if (unknown.length > 0) throw new DomainError("UNKNOWN_CATEGORY", `Quadro desconhecido: ${unknown.join(", ")}`)

	const submission = await insertOneOrFail("SAVE_FAILED", "Falha ao registrar a resposta do refeitório", () =>
		db
			.insert(workforceSubmissionInKitchen)
			.values({
				surveyId: input.surveyId,
				messHallWorkforceId: input.messHallWorkforceId,
				declaredTotal: input.declaredTotal ?? null,
				submittedAt: sql`now()`,
				submittedBy: ctx.userId,
			})
			.onConflictDoUpdate({
				target: [workforceSubmissionInKitchen.surveyId, workforceSubmissionInKitchen.messHallWorkforceId],
				set: {
					declaredTotal: input.declaredTotal ?? null,
					submittedAt: sql`now()`,
					submittedBy: ctx.userId,
					updatedAt: sql`now()`,
				},
			})
			.returning({ id: workforceSubmissionInKitchen.id })
	)

	// null = o gestor apagou o campo. Apagar a linha é o que preserva a distinção entre
	// "em branco" e "declarou zero", que é a informação que a matriz pede explicitamente.
	const cleared = input.entries.filter((e) => e.headcount === null).map((e) => categoryByCode.get(e.categoryCode) as string)
	const filled = input.entries.filter((e) => e.headcount !== null)

	if (cleared.length > 0) {
		await runQuery("SAVE_FAILED", () =>
			db
				.delete(workforceHeadcountInKitchen)
				.where(and(eq(workforceHeadcountInKitchen.submissionId, submission.id), inArray(workforceHeadcountInKitchen.categoryId, cleared)))
		)
	}
	if (filled.length > 0) {
		await runQuery("SAVE_FAILED", () =>
			db
				.insert(workforceHeadcountInKitchen)
				.values(
					filled.map((e) => ({
						submissionId: submission.id,
						categoryId: categoryByCode.get(e.categoryCode) as string,
						headcount: e.headcount as number,
					}))
				)
				.onConflictDoUpdate({
					target: [workforceHeadcountInKitchen.submissionId, workforceHeadcountInKitchen.categoryId],
					set: { headcount: sql`excluded.headcount`, updatedAt: sql`now()` },
				})
		)
	}

	return describeMessHallWorkforce(db, input.surveyId, input.messHallWorkforceId)
}

export async function addWorkforceNote(db: SisubDb, ctx: UserContext, input: AddWorkforceNote): Promise<WorkforceNote> {
	await requireMessHallWorkforceWrite(db, ctx, input.messHallWorkforceId)
	await requireOpenSurvey(db, input.surveyId)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: workforceSubmissionInKitchen.id })
			.from(workforceSubmissionInKitchen)
			.where(and(eq(workforceSubmissionInKitchen.surveyId, input.surveyId), eq(workforceSubmissionInKitchen.messHallWorkforceId, input.messHallWorkforceId)))
			.limit(1)
	)
	const submission = rows[0]
	if (!submission) throw new DomainError("NO_SUBMISSION", "Preencha o efetivo do refeitório antes de registrar observações")

	const note = await insertOneOrFail("SAVE_FAILED", "Falha ao registrar a observação", () =>
		db
			.insert(workforceNoteInKitchen)
			.values({ submissionId: submission.id, kind: input.kind, quantity: input.quantity ?? null, detail: input.detail })
			.returning(NOTE_COLS)
	)
	return toWire<WorkforceNote>(note)
}

export async function deleteWorkforceNote(db: SisubDb, ctx: UserContext, input: DeleteWorkforceNote): Promise<{ id: string }> {
	// O dono vem do JOIN até o refeitório do levantamento — o input só traz o id da nota, então não há como
	// o chamador declarar um escopo mais permissivo do que o da linha.
	const owner = await runQuery("FETCH_FAILED", () =>
		db
			.select({ messHallWorkforceId: workforceSubmissionInKitchen.messHallWorkforceId, surveyId: workforceSubmissionInKitchen.surveyId })
			.from(workforceNoteInKitchen)
			.innerJoin(workforceSubmissionInKitchen, eq(workforceSubmissionInKitchen.id, workforceNoteInKitchen.submissionId))
			.where(eq(workforceNoteInKitchen.id, input.noteId))
			.limit(1)
	)
	const row = owner[0]
	if (!row) throw new NotFoundError("workforce_note", input.noteId)
	await requireMessHallWorkforceWrite(db, ctx, Number(row.messHallWorkforceId))
	// Competência encerrada é registro histórico. Sem este guard, apagar uma observação de
	// uma coleta antiga mudaria para sempre o `unavailable`/`outsourced` daquele mês — e
	// `addWorkforceNote` recusaria recriá-la, porque ela também exige competência aberta.
	await requireOpenSurvey(db, row.surveyId)

	const deleted = await mutateOrFail("DELETE_FAILED", "Observação não encontrada", () =>
		db.delete(workforceNoteInKitchen).where(eq(workforceNoteInKitchen.id, input.noteId)).returning({ id: workforceNoteInKitchen.id })
	)
	return { id: deleted[0]?.id as string }
}

// ── Governança da competência e do roster ─────────────────────────────────

export async function createWorkforceSurvey(db: SisubDb, ctx: UserContext, input: CreateWorkforceSurvey): Promise<WorkforceSurvey> {
	requirePermission(ctx, "admin", 2)
	const row = await insertOneOrFail("SAVE_FAILED", "Já existe competência para esta data de referência", () =>
		db
			.insert(workforceSurveyInKitchen)
			.values({ referenceDate: input.referenceDate, title: input.title, source: input.source ?? null, createdBy: ctx.userId })
			.onConflictDoNothing({ target: workforceSurveyInKitchen.referenceDate })
			.returning(SURVEY_COLS)
	)
	return toWire<WorkforceSurvey>(row)
}

export async function closeWorkforceSurvey(db: SisubDb, ctx: UserContext, input: CloseWorkforceSurvey): Promise<WorkforceSurvey> {
	requirePermission(ctx, "admin", 2)
	const rows = await mutateOrFail("SAVE_FAILED", "Competência não encontrada ou já encerrada", () =>
		db
			.update(workforceSurveyInKitchen)
			.set({ status: "closed", closedAt: sql`now()` })
			.where(and(eq(workforceSurveyInKitchen.id, input.surveyId), eq(workforceSurveyInKitchen.status, "open")))
			.returning(SURVEY_COLS)
	)
	return toWire<WorkforceSurvey>(rows[0])
}

export async function createMessHallWorkforce(db: SisubDb, ctx: UserContext, input: CreateMessHallWorkforce): Promise<MessHallWorkforce> {
	requirePermission(ctx, "admin", 2)
	const row = await insertOneOrFail("SAVE_FAILED", `Já existe refeitório no levantamento com o code "${input.code}"`, () =>
		db
			.insert(messHallWorkforceInKitchen)
			.values({
				unitId: input.unitId,
				eloCode: input.eloCode,
				code: input.code,
				displayName: input.displayName,
				messHallId: input.messHallId ?? null,
				kitchenId: input.kitchenId ?? null,
				producesOwnMeals: input.producesOwnMeals,
				notes: input.notes ?? null,
			})
			.onConflictDoNothing({ target: messHallWorkforceInKitchen.code })
			.returning(MESS_HALL_WORKFORCE_COLS)
	)
	return toWire<MessHallWorkforce>(row)
}

export async function updateMessHallWorkforce(db: SisubDb, ctx: UserContext, input: UpdateMessHallWorkforce): Promise<MessHallWorkforce> {
	requirePermission(ctx, "admin", 2)
	const patch: Record<string, unknown> = { updatedAt: sql`now()` }
	if (input.displayName != null) patch.displayName = input.displayName
	if (input.messHallId !== undefined) patch.messHallId = input.messHallId ?? null
	if (input.kitchenId !== undefined) patch.kitchenId = input.kitchenId ?? null
	if (input.producesOwnMeals != null) patch.producesOwnMeals = input.producesOwnMeals
	if (input.active != null) patch.active = input.active
	if (input.notes !== undefined) patch.notes = input.notes ?? null

	const rows = await mutateOrFail("SAVE_FAILED", "Refeitório do levantamento não encontrado", () =>
		db.update(messHallWorkforceInKitchen).set(patch).where(eq(messHallWorkforceInKitchen.id, input.messHallWorkforceId)).returning(MESS_HALL_WORKFORCE_COLS)
	)
	return toWire<MessHallWorkforce>(rows[0])
}
