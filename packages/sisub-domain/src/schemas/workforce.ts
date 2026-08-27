/**
 * Schemas da matriz de efetivo dos ranchos.
 *
 * O grão é o RANCHO (`core.rancho`), não a cozinha nem o refeitório: a matriz de gestores
 * lista 66 ranchos onde o SISUB tem 30 cozinhas e 68 refeitórios, e os três não coincidem
 * (a EEAR declara três ranchos servidos pela mesma cozinha; o GAP-CO declara dois).
 *
 * Uma competência é uma linha nova de `workforce_survey`. Preencher a competência corrente
 * é `saveWorkforceSubmission`; a anterior nunca é tocada.
 *
 * Opcional é `.nullish()`, nunca `.optional()` puro — mesmo motivo do resto do domínio
 * (ver CLAUDE.md): quem chama manda `null`, não omite o campo.
 */

import { z } from "zod"
import { DateSchema, UuidSchema } from "./common.ts"

export const WORKFORCE_NOTE_KINDS = ["outsourced", "leave", "reassigned", "shared", "scope", "change", "counting", "other"] as const
export const WorkforceNoteKindSchema = z.enum(WORKFORCE_NOTE_KINDS)
export type WorkforceNoteKind = z.infer<typeof WorkforceNoteKindSchema>

export const WORKFORCE_SURVEY_STATUSES = ["draft", "open", "closed"] as const
export const WorkforceSurveyStatusSchema = z.enum(WORKFORCE_SURVEY_STATUSES)
export type WorkforceSurveyStatus = z.infer<typeof WorkforceSurveyStatusSchema>

const RanchoIdSchema = z.number().int().positive()
const UnitIdSchema = z.number().int().positive()

// ── Leitura ───────────────────────────────────────────────────────────────

export const ListWorkforceSurveysSchema = z.object({
	limit: z.number().int().min(1).max(200).default(24),
})
export type ListWorkforceSurveys = z.infer<typeof ListWorkforceSurveysSchema>

/**
 * Matriz de uma unidade numa competência. `surveyId` nulo = competência mais recente.
 * Devolve TODOS os ranchos da unidade, inclusive os que não responderam — a lacuna é
 * metade da informação que o gestor precisa ver.
 */
export const FetchWorkforceMatrixSchema = z.object({
	unitId: UnitIdSchema,
	surveyId: UuidSchema.nullish(),
})
export type FetchWorkforceMatrix = z.infer<typeof FetchWorkforceMatrixSchema>

/** Visão de rede (SDAB): todos os ranchos de todos os ELOs numa competência. */
export const FetchWorkforceNetworkSchema = z.object({
	surveyId: UuidSchema.nullish(),
})
export type FetchWorkforceNetwork = z.infer<typeof FetchWorkforceNetworkSchema>

// ── Escrita ───────────────────────────────────────────────────────────────

export const WorkforceEntrySchema = z.object({
	categoryCode: z.string().min(1).max(60),
	/** null = campo em branco (apaga a linha). 0 = o gestor afirmou que não há militar do quadro. */
	headcount: z.number().int().min(0).max(10_000).nullable(),
})
export type WorkforceEntry = z.infer<typeof WorkforceEntrySchema>

export const SaveWorkforceSubmissionSchema = z.object({
	surveyId: UuidSchema,
	ranchoId: RanchoIdSchema,
	entries: z.array(WorkforceEntrySchema).max(50),
	/** Total escrito pelo gestor. Preservado ainda que divirja da soma — a tela aponta a divergência. */
	declaredTotal: z.number().int().min(0).max(100_000).nullish(),
})
export type SaveWorkforceSubmission = z.infer<typeof SaveWorkforceSubmissionSchema>

export const AddWorkforceNoteSchema = z.object({
	surveyId: UuidSchema,
	ranchoId: RanchoIdSchema,
	kind: WorkforceNoteKindSchema,
	quantity: z.number().int().min(0).max(10_000).nullish(),
	detail: z.string().min(1).max(2000),
})
export type AddWorkforceNote = z.infer<typeof AddWorkforceNoteSchema>

export const DeleteWorkforceNoteSchema = z.object({
	noteId: UuidSchema,
})
export type DeleteWorkforceNote = z.infer<typeof DeleteWorkforceNoteSchema>

export const CreateWorkforceSurveySchema = z.object({
	referenceDate: DateSchema,
	title: z.string().min(1).max(200),
	source: z.string().max(500).nullish(),
})
export type CreateWorkforceSurvey = z.infer<typeof CreateWorkforceSurveySchema>

export const CloseWorkforceSurveySchema = z.object({
	surveyId: UuidSchema,
})
export type CloseWorkforceSurvey = z.infer<typeof CloseWorkforceSurveySchema>

// ── Roster ────────────────────────────────────────────────────────────────

export const CreateRanchoSchema = z.object({
	unitId: UnitIdSchema,
	eloCode: z.string().min(1).max(60),
	code: z
		.string()
		.min(2)
		.max(80)
		.regex(/^[a-z][a-z0-9-]*$/, "code deve ser um slug minúsculo (letras, números e -)"),
	displayName: z.string().min(1).max(200),
	messHallId: z.number().int().positive().nullish(),
	kitchenId: z.number().int().positive().nullish(),
	producesOwnMeals: z.boolean().default(true),
	notes: z.string().max(2000).nullish(),
})
export type CreateRancho = z.infer<typeof CreateRanchoSchema>

export const UpdateRanchoSchema = z.object({
	ranchoId: RanchoIdSchema,
	displayName: z.string().min(1).max(200).nullish(),
	messHallId: z.number().int().positive().nullish(),
	kitchenId: z.number().int().positive().nullish(),
	producesOwnMeals: z.boolean().nullish(),
	active: z.boolean().nullish(),
	notes: z.string().max(2000).nullish(),
})
export type UpdateRancho = z.infer<typeof UpdateRanchoSchema>
