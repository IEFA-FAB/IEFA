/**
 * Operations da matriz de efetivo dos ranchos — camada Drizzle.
 *
 * Autorização, resumida:
 *   - matriz de UMA unidade: leitura com `local-analytics` OU `unit` nível 1 naquela unidade;
 *     escrita com nível 2. O gestor do ELO preenche o próprio ELO e mais nada.
 *   - visão de REDE: `analytics` nível 2, o mesmo gate de `/analytics/global`.
 *   - abrir/fechar competência e mexer no roster de ranchos: `admin` nível 2 — é governança
 *     de plataforma, rara e de alto risco, não gestão diária de conteúdo.
 *
 * O escopo da escrita é lido da LINHA (`rancho.unit_id`), nunca do input: aceitar o `unitId`
 * que veio na requisição deixaria qualquer gestor gravar efetivo no rancho de outro ELO
 * declarando a própria unidade. Mesma lição do fallback de `kitchen:2` em ativo global.
 *
 * As relações vêm por QUERY SEPARADA, não por `with` aninhado — o join
 * rancho → submission → headcount → category gera alias acima de 63 chars (NAMEDATALEN),
 * que o Postgres trunca e o Drizzle não casa de volta, devolvendo relation vazia em silêncio.
 */

import {
	mealPresencesInKitchen,
	messHallsInCore,
	otherPresencesInKitchen,
	ranchoInCore,
	type SisubDb,
	workforceCategoryInCore,
	workforceHeadcountInCore,
	workforceNoteInCore,
	workforceSubmissionInCore,
	workforceSurveyInCore,
} from "@iefa/database/drizzle/sisub"
import type { Rancho, WorkforceCategory, WorkforceNote, WorkforceSurvey } from "@iefa/database/sisub"
import { and, asc, count, countDistinct, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { requireAnyPermission, requirePermission } from "../guards/require-permission.ts"
import type {
	AddWorkforceNote,
	CloseWorkforceSurvey,
	CreateRancho,
	CreateWorkforceSurvey,
	DeleteWorkforceNote,
	FetchWorkforceMatrix,
	FetchWorkforceNetwork,
	ListWorkforceSurveys,
	SaveWorkforceSubmission,
	UpdateRancho,
} from "../schemas/workforce.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toWire } from "../utils/index.ts"
import {
	computeRanchoMetrics,
	coverageGaps,
	groupWorkforceBy,
	type MealLoadInput,
	mealsPerWorker,
	type RanchoWorkforceInput,
	type RanchoWorkforceMetrics,
	summarizeWorkforce,
	type WorkforceGroupSummary,
} from "../utils/workforce-metrics.ts"

// ── Contrato de retorno ───────────────────────────────────────────────────

export type WorkforceRanchoWire = RanchoWorkforceMetrics & {
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
	ranchos: WorkforceRanchoWire[]
	summary: WorkforceGroupSummary
}

export type WorkforceNetworkWire = WorkforceMatrixWire & {
	by_elo: WorkforceGroupSummary[]
	/** Ranchos que responderam e não têm nutricionista nem TND, do maior efetivo ao menor. */
	coverage_gaps: WorkforceRanchoWire[]
}

// ── Projeções ─────────────────────────────────────────────────────────────

const CATEGORY_COLS = {
	id: workforceCategoryInCore.id,
	code: workforceCategoryInCore.code,
	name: workforceCategoryInCore.name,
	description: workforceCategoryInCore.description,
	sort_order: workforceCategoryInCore.sortOrder,
	is_career: workforceCategoryInCore.isCareer,
	is_technical: workforceCategoryInCore.isTechnical,
	created_at: workforceCategoryInCore.createdAt,
	deleted_at: workforceCategoryInCore.deletedAt,
} as const

const SURVEY_COLS = {
	id: workforceSurveyInCore.id,
	reference_date: workforceSurveyInCore.referenceDate,
	title: workforceSurveyInCore.title,
	status: workforceSurveyInCore.status,
	source: workforceSurveyInCore.source,
	opened_at: workforceSurveyInCore.openedAt,
	closed_at: workforceSurveyInCore.closedAt,
	created_by: workforceSurveyInCore.createdBy,
	created_at: workforceSurveyInCore.createdAt,
} as const

const RANCHO_COLS = {
	id: ranchoInCore.id,
	unit_id: ranchoInCore.unitId,
	elo_code: ranchoInCore.eloCode,
	code: ranchoInCore.code,
	display_name: ranchoInCore.displayName,
	mess_hall_id: ranchoInCore.messHallId,
	kitchen_id: ranchoInCore.kitchenId,
	produces_own_meals: ranchoInCore.producesOwnMeals,
	active: ranchoInCore.active,
	notes: ranchoInCore.notes,
	created_at: ranchoInCore.createdAt,
	updated_at: ranchoInCore.updatedAt,
} as const

const NOTE_COLS = {
	id: workforceNoteInCore.id,
	submission_id: workforceNoteInCore.submissionId,
	kind: workforceNoteInCore.kind,
	quantity: workforceNoteInCore.quantity,
	detail: workforceNoteInCore.detail,
	created_at: workforceNoteInCore.createdAt,
} as const

// ── Leitura ───────────────────────────────────────────────────────────────

export async function listWorkforceSurveys(db: SisubDb, ctx: UserContext, input: ListWorkforceSurveys): Promise<WorkforceSurvey[]> {
	requireAnyPermission(ctx, ["analytics", "local-analytics", "unit"], 1)
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select(SURVEY_COLS).from(workforceSurveyInCore).orderBy(desc(workforceSurveyInCore.referenceDate)).limit(input.limit)
	)
	return toWire<WorkforceSurvey[]>(rows)
}

async function resolveSurvey(db: SisubDb, surveyId: string | null | undefined): Promise<WorkforceSurvey | null> {
	const rows = await runQuery("FETCH_FAILED", () => {
		const q = db.select(SURVEY_COLS).from(workforceSurveyInCore)
		return surveyId ? q.where(eq(workforceSurveyInCore.id, surveyId)).limit(1) : q.orderBy(desc(workforceSurveyInCore.referenceDate)).limit(1)
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

/** Monta a matriz a partir de um conjunto de ranchos já filtrado e autorizado. */
async function buildMatrix(db: SisubDb, ranchos: Rancho[], survey: WorkforceSurvey | null, summaryKey: string): Promise<WorkforceMatrixWire> {
	const categories = toWire<WorkforceCategory[]>(
		await runQuery("FETCH_FAILED", () =>
			db.select(CATEGORY_COLS).from(workforceCategoryInCore).where(isNull(workforceCategoryInCore.deletedAt)).orderBy(asc(workforceCategoryInCore.sortOrder))
		)
	)

	const ranchoIds = ranchos.map((r) => Number(r.id))
	const messHallIds = [
		...new Set(
			ranchos
				.map((r) => r.mess_hall_id)
				.filter((id): id is number => id != null)
				.map(Number)
		),
	]

	const submissions =
		survey && ranchoIds.length > 0
			? await runQuery("FETCH_FAILED", () =>
					db
						.select({
							id: workforceSubmissionInCore.id,
							ranchoId: workforceSubmissionInCore.ranchoId,
							declaredTotal: workforceSubmissionInCore.declaredTotal,
						})
						.from(workforceSubmissionInCore)
						.where(and(eq(workforceSubmissionInCore.surveyId, survey.id), inArray(workforceSubmissionInCore.ranchoId, ranchoIds)))
				)
			: []

	const submissionIds = submissions.map((s) => s.id)
	const [headcounts, notes, load] = await Promise.all([
		submissionIds.length > 0
			? runQuery("FETCH_FAILED", () =>
					db
						.select({
							submissionId: workforceHeadcountInCore.submissionId,
							code: workforceCategoryInCore.code,
							headcount: workforceHeadcountInCore.headcount,
						})
						.from(workforceHeadcountInCore)
						.innerJoin(workforceCategoryInCore, eq(workforceCategoryInCore.id, workforceHeadcountInCore.categoryId))
						.where(inArray(workforceHeadcountInCore.submissionId, submissionIds))
				)
			: Promise.resolve([]),
		submissionIds.length > 0
			? runQuery("FETCH_FAILED", () =>
					db
						.select(NOTE_COLS)
						.from(workforceNoteInCore)
						.where(inArray(workforceNoteInCore.submissionId, submissionIds))
						.orderBy(asc(workforceNoteInCore.createdAt))
				)
			: Promise.resolve([]),
		survey ? fetchMealLoad(db, messHallIds, survey.reference_date) : Promise.resolve(new Map<number, MealLoadInput>()),
	])

	const submissionByRancho = new Map(submissions.map((s) => [Number(s.ranchoId), s]))
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
								.select({ id: messHallsInCore.id, code: messHallsInCore.code, displayName: messHallsInCore.displayName })
								.from(messHallsInCore)
								// `mess_halls.id` é bigserial mode "bigint" no schema Drizzle: o inArray exige BigInt.
								.where(inArray(messHallsInCore.id, messHallIds.map(BigInt)))
						)
					).map((m) => [Number(m.id), m.displayName ?? m.code])
				)
			: new Map<number, string>()

	const rows: WorkforceRanchoWire[] = ranchos.map((r) => {
		const ranchoId = Number(r.id)
		const submission = submissionByRancho.get(ranchoId)
		const headcountMap = submission ? (headcountsBySubmission.get(submission.id) ?? {}) : {}
		const ranchoNotes = submission ? (notesBySubmission.get(submission.id) ?? []) : []

		const input: RanchoWorkforceInput = {
			ranchoId,
			code: r.code,
			displayName: r.display_name,
			eloCode: r.elo_code,
			unitId: Number(r.unit_id),
			messHallId: r.mess_hall_id == null ? null : Number(r.mess_hall_id),
			headcounts: headcountMap,
			declaredTotal: submission?.declaredTotal ?? null,
			notes: ranchoNotes,
			answered: submission !== undefined,
		}
		const metrics = computeRanchoMetrics(input, categories)
		return {
			...metrics,
			mess_hall_name: input.messHallId === null ? null : (messHallNames.get(input.messHallId) ?? null),
			produces_own_meals: r.produces_own_meals,
			headcounts: headcountMap,
			notes: ranchoNotes,
			meals_per_worker: mealsPerWorker(metrics, input.messHallId === null ? null : (load.get(input.messHallId) ?? null)),
		}
	})

	return { survey, categories, ranchos: rows, summary: summarizeWorkforce(rows, summaryKey) }
}

export async function fetchWorkforceMatrix(db: SisubDb, ctx: UserContext, input: FetchWorkforceMatrix): Promise<WorkforceMatrixWire> {
	requireAnyPermission(ctx, ["local-analytics", "unit"], 1, { type: "unit", id: input.unitId })

	const survey = await resolveSurvey(db, input.surveyId)
	const ranchos = toWire<Rancho[]>(
		await runQuery("FETCH_FAILED", () =>
			db
				.select(RANCHO_COLS)
				.from(ranchoInCore)
				.where(and(eq(ranchoInCore.unitId, input.unitId), eq(ranchoInCore.active, true)))
				.orderBy(asc(ranchoInCore.displayName))
		)
	)
	return buildMatrix(db, ranchos, survey, `unit:${input.unitId}`)
}

export async function fetchWorkforceNetwork(db: SisubDb, ctx: UserContext, input: FetchWorkforceNetwork): Promise<WorkforceNetworkWire> {
	requirePermission(ctx, "analytics", 2)

	const survey = await resolveSurvey(db, input.surveyId)
	const ranchos = toWire<Rancho[]>(
		await runQuery("FETCH_FAILED", () =>
			db.select(RANCHO_COLS).from(ranchoInCore).where(eq(ranchoInCore.active, true)).orderBy(asc(ranchoInCore.eloCode), asc(ranchoInCore.displayName))
		)
	)
	const matrix = await buildMatrix(db, ranchos, survey, "rede")
	const byId = new Map(matrix.ranchos.map((r) => [r.ranchoId, r]))
	return {
		...matrix,
		by_elo: groupWorkforceBy(matrix.ranchos, (m) => m.eloCode),
		coverage_gaps: coverageGaps(matrix.ranchos).map((m) => byId.get(m.ranchoId) as WorkforceRanchoWire),
	}
}

// ── Escrita ───────────────────────────────────────────────────────────────

/**
 * Autoriza a escrita pela unidade DONA do rancho, lida do banco. O `unitId` do input
 * nunca participa: o chamador não decide sobre qual ELO está escrevendo.
 */
async function requireRanchoWrite(db: SisubDb, ctx: UserContext, ranchoId: number): Promise<{ unitId: number }> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ unitId: ranchoInCore.unitId, active: ranchoInCore.active }).from(ranchoInCore).where(eq(ranchoInCore.id, ranchoId)).limit(1)
	)
	const rancho = rows[0]
	if (!rancho) throw new NotFoundError("rancho", ranchoId)
	if (!rancho.active) throw new DomainError("RANCHO_INACTIVE", "Rancho inativo não aceita preenchimento de efetivo")
	const unitId = Number(rancho.unitId)
	requireAnyPermission(ctx, ["local-analytics", "unit"], 2, { type: "unit", id: unitId })
	return { unitId }
}

async function requireOpenSurvey(db: SisubDb, surveyId: string): Promise<void> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ status: workforceSurveyInCore.status }).from(workforceSurveyInCore).where(eq(workforceSurveyInCore.id, surveyId)).limit(1)
	)
	const survey = rows[0]
	if (!survey) throw new NotFoundError("workforce_survey", surveyId)
	// Competência fechada é registro histórico: reabrir é ato de administração, não de
	// preenchimento. Sem isso, editar a coleta do mês passado apagaria a base de comparação
	// que a coleta deste mês usa para dizer "o que mudou".
	if (survey.status === "closed") throw new DomainError("SURVEY_CLOSED", "Competência já encerrada — abra uma nova para registrar alterações")
}

/**
 * Apaga a resposta do rancho na competência, devolvendo-o ao estado "sem resposta".
 * O cascade leva quantitativos E observações: uma observação sem efetivo declarado não
 * descreve nada, e `addWorkforceNote` já exige a submission para existir.
 */
async function clearWorkforceSubmission(db: SisubDb, input: SaveWorkforceSubmission): Promise<WorkforceRanchoWire> {
	await runQuery("SAVE_FAILED", () =>
		db
			.delete(workforceSubmissionInCore)
			.where(and(eq(workforceSubmissionInCore.surveyId, input.surveyId), eq(workforceSubmissionInCore.ranchoId, input.ranchoId)))
	)
	return describeRancho(db, input.surveyId, input.ranchoId)
}

/** Recarrega um único rancho já com as métricas — retorno comum das escritas. */
async function describeRancho(db: SisubDb, surveyId: string, ranchoId: number): Promise<WorkforceRanchoWire> {
	const survey = await resolveSurvey(db, surveyId)
	const ranchos = toWire<Rancho[]>(
		await runQuery("FETCH_FAILED", () => db.select(RANCHO_COLS).from(ranchoInCore).where(eq(ranchoInCore.id, ranchoId)).limit(1))
	)
	const matrix = await buildMatrix(db, ranchos, survey, `rancho:${ranchoId}`)
	const row = matrix.ranchos[0]
	if (!row) throw new NotFoundError("rancho", ranchoId)
	return row
}

export async function saveWorkforceSubmission(db: SisubDb, ctx: UserContext, input: SaveWorkforceSubmission): Promise<WorkforceRanchoWire> {
	await requireRanchoWrite(db, ctx, input.ranchoId)
	await requireOpenSurvey(db, input.surveyId)

	// Salvar com TUDO em branco significa "este rancho não respondeu", e é como o gestor
	// desfaz um preenchimento equivocado. Criar a submission mesmo assim marcaria o rancho
	// como respondido com total 0 — ele entraria na taxa de resposta, puxaria o total da
	// rede para baixo e apareceria na fila de lacunas de cobertura, sem nenhum caminho de
	// volta. É exatamente a invariante "ausência ≠ zero" que esta tabela existe para manter.
	const isBlank = input.declaredTotal == null && input.entries.every((e) => e.headcount === null)
	if (isBlank) return clearWorkforceSubmission(db, input)

	const categories = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: workforceCategoryInCore.id, code: workforceCategoryInCore.code })
			.from(workforceCategoryInCore)
			.where(isNull(workforceCategoryInCore.deletedAt))
	)
	const categoryByCode = new Map(categories.map((c) => [c.code, c.id]))
	const unknown = input.entries.map((e) => e.categoryCode).filter((code) => !categoryByCode.has(code))
	if (unknown.length > 0) throw new DomainError("UNKNOWN_CATEGORY", `Quadro desconhecido: ${unknown.join(", ")}`)

	const submission = await insertOneOrFail("SAVE_FAILED", "Falha ao registrar a resposta do rancho", () =>
		db
			.insert(workforceSubmissionInCore)
			.values({
				surveyId: input.surveyId,
				ranchoId: input.ranchoId,
				declaredTotal: input.declaredTotal ?? null,
				submittedAt: sql`now()`,
				submittedBy: ctx.userId,
			})
			.onConflictDoUpdate({
				target: [workforceSubmissionInCore.surveyId, workforceSubmissionInCore.ranchoId],
				set: {
					declaredTotal: input.declaredTotal ?? null,
					submittedAt: sql`now()`,
					submittedBy: ctx.userId,
					updatedAt: sql`now()`,
				},
			})
			.returning({ id: workforceSubmissionInCore.id })
	)

	// null = o gestor apagou o campo. Apagar a linha é o que preserva a distinção entre
	// "em branco" e "declarou zero", que é a informação que a matriz pede explicitamente.
	const cleared = input.entries.filter((e) => e.headcount === null).map((e) => categoryByCode.get(e.categoryCode) as string)
	const filled = input.entries.filter((e) => e.headcount !== null)

	if (cleared.length > 0) {
		await runQuery("SAVE_FAILED", () =>
			db
				.delete(workforceHeadcountInCore)
				.where(and(eq(workforceHeadcountInCore.submissionId, submission.id), inArray(workforceHeadcountInCore.categoryId, cleared)))
		)
	}
	if (filled.length > 0) {
		await runQuery("SAVE_FAILED", () =>
			db
				.insert(workforceHeadcountInCore)
				.values(
					filled.map((e) => ({
						submissionId: submission.id,
						categoryId: categoryByCode.get(e.categoryCode) as string,
						headcount: e.headcount as number,
					}))
				)
				.onConflictDoUpdate({
					target: [workforceHeadcountInCore.submissionId, workforceHeadcountInCore.categoryId],
					set: { headcount: sql`excluded.headcount`, updatedAt: sql`now()` },
				})
		)
	}

	return describeRancho(db, input.surveyId, input.ranchoId)
}

export async function addWorkforceNote(db: SisubDb, ctx: UserContext, input: AddWorkforceNote): Promise<WorkforceNote> {
	await requireRanchoWrite(db, ctx, input.ranchoId)
	await requireOpenSurvey(db, input.surveyId)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: workforceSubmissionInCore.id })
			.from(workforceSubmissionInCore)
			.where(and(eq(workforceSubmissionInCore.surveyId, input.surveyId), eq(workforceSubmissionInCore.ranchoId, input.ranchoId)))
			.limit(1)
	)
	const submission = rows[0]
	if (!submission) throw new DomainError("NO_SUBMISSION", "Preencha o efetivo do rancho antes de registrar observações")

	const note = await insertOneOrFail("SAVE_FAILED", "Falha ao registrar a observação", () =>
		db
			.insert(workforceNoteInCore)
			.values({ submissionId: submission.id, kind: input.kind, quantity: input.quantity ?? null, detail: input.detail })
			.returning(NOTE_COLS)
	)
	return toWire<WorkforceNote>(note)
}

export async function deleteWorkforceNote(db: SisubDb, ctx: UserContext, input: DeleteWorkforceNote): Promise<{ id: string }> {
	// O dono vem do JOIN até o rancho — o input só traz o id da nota, então não há como
	// o chamador declarar um escopo mais permissivo do que o da linha.
	const owner = await runQuery("FETCH_FAILED", () =>
		db
			.select({ ranchoId: workforceSubmissionInCore.ranchoId, surveyId: workforceSubmissionInCore.surveyId })
			.from(workforceNoteInCore)
			.innerJoin(workforceSubmissionInCore, eq(workforceSubmissionInCore.id, workforceNoteInCore.submissionId))
			.where(eq(workforceNoteInCore.id, input.noteId))
			.limit(1)
	)
	const row = owner[0]
	if (!row) throw new NotFoundError("workforce_note", input.noteId)
	await requireRanchoWrite(db, ctx, Number(row.ranchoId))
	// Competência encerrada é registro histórico. Sem este guard, apagar uma observação de
	// uma coleta antiga mudaria para sempre o `unavailable`/`outsourced` daquele mês — e
	// `addWorkforceNote` recusaria recriá-la, porque ela também exige competência aberta.
	await requireOpenSurvey(db, row.surveyId)

	const deleted = await mutateOrFail("DELETE_FAILED", "Observação não encontrada", () =>
		db.delete(workforceNoteInCore).where(eq(workforceNoteInCore.id, input.noteId)).returning({ id: workforceNoteInCore.id })
	)
	return { id: deleted[0]?.id as string }
}

// ── Governança da competência e do roster ─────────────────────────────────

export async function createWorkforceSurvey(db: SisubDb, ctx: UserContext, input: CreateWorkforceSurvey): Promise<WorkforceSurvey> {
	requirePermission(ctx, "admin", 2)
	const row = await insertOneOrFail("SAVE_FAILED", "Já existe competência para esta data de referência", () =>
		db
			.insert(workforceSurveyInCore)
			.values({ referenceDate: input.referenceDate, title: input.title, source: input.source ?? null, createdBy: ctx.userId })
			.onConflictDoNothing({ target: workforceSurveyInCore.referenceDate })
			.returning(SURVEY_COLS)
	)
	return toWire<WorkforceSurvey>(row)
}

export async function closeWorkforceSurvey(db: SisubDb, ctx: UserContext, input: CloseWorkforceSurvey): Promise<WorkforceSurvey> {
	requirePermission(ctx, "admin", 2)
	const rows = await mutateOrFail("SAVE_FAILED", "Competência não encontrada ou já encerrada", () =>
		db
			.update(workforceSurveyInCore)
			.set({ status: "closed", closedAt: sql`now()` })
			.where(and(eq(workforceSurveyInCore.id, input.surveyId), eq(workforceSurveyInCore.status, "open")))
			.returning(SURVEY_COLS)
	)
	return toWire<WorkforceSurvey>(rows[0])
}

export async function createRancho(db: SisubDb, ctx: UserContext, input: CreateRancho): Promise<Rancho> {
	requirePermission(ctx, "admin", 2)
	const row = await insertOneOrFail("SAVE_FAILED", `Já existe rancho com o code "${input.code}"`, () =>
		db
			.insert(ranchoInCore)
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
			.onConflictDoNothing({ target: ranchoInCore.code })
			.returning(RANCHO_COLS)
	)
	return toWire<Rancho>(row)
}

export async function updateRancho(db: SisubDb, ctx: UserContext, input: UpdateRancho): Promise<Rancho> {
	requirePermission(ctx, "admin", 2)
	const patch: Record<string, unknown> = { updatedAt: sql`now()` }
	if (input.displayName != null) patch.displayName = input.displayName
	if (input.messHallId !== undefined) patch.messHallId = input.messHallId ?? null
	if (input.kitchenId !== undefined) patch.kitchenId = input.kitchenId ?? null
	if (input.producesOwnMeals != null) patch.producesOwnMeals = input.producesOwnMeals
	if (input.active != null) patch.active = input.active
	if (input.notes !== undefined) patch.notes = input.notes ?? null

	const rows = await mutateOrFail("SAVE_FAILED", "Rancho não encontrado", () =>
		db.update(ranchoInCore).set(patch).where(eq(ranchoInCore.id, input.ranchoId)).returning(RANCHO_COLS)
	)
	return toWire<Rancho>(rows[0])
}
