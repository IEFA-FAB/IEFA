/**
 * @module workforce.fn
 * Server fns da matriz de efetivo dos ranchos (roster, competência, quantitativos, observações).
 * Wrappers finos sobre as operations de @iefa/sisub-domain, com auth via requireAuth().
 * @domain core
 */

import {
	AddWorkforceNoteSchema,
	addWorkforceNote,
	CloseWorkforceSurveySchema,
	CreateRanchoSchema,
	CreateWorkforceSurveySchema,
	closeWorkforceSurvey,
	createRancho,
	createWorkforceSurvey,
	DeleteWorkforceNoteSchema,
	deleteWorkforceNote,
	FetchWorkforceMatrixSchema,
	FetchWorkforceNetworkSchema,
	fetchWorkforceMatrix,
	fetchWorkforceNetwork,
	ListWorkforceSurveysSchema,
	listWorkforceSurveys,
	SaveWorkforceSubmissionSchema,
	saveWorkforceSubmission,
	UpdateRanchoSchema,
	updateRancho,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// ── Leitura ───────────────────────────────────────────────────────────────

export const listWorkforceSurveysFn = createServerFn({ method: "GET" })
	.validator(ListWorkforceSurveysSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listWorkforceSurveys(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchWorkforceMatrixFn = createServerFn({ method: "GET" })
	.validator(FetchWorkforceMatrixSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchWorkforceMatrix(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchWorkforceNetworkFn = createServerFn({ method: "GET" })
	.validator(FetchWorkforceNetworkSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchWorkforceNetwork(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Preenchimento ─────────────────────────────────────────────────────────

export const saveWorkforceSubmissionFn = createServerFn({ method: "POST" })
	.validator(SaveWorkforceSubmissionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return saveWorkforceSubmission(getDb(), ctx, data).catch(handleDomainError)
	})

export const addWorkforceNoteFn = createServerFn({ method: "POST" })
	.validator(AddWorkforceNoteSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return addWorkforceNote(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteWorkforceNoteFn = createServerFn({ method: "POST" })
	.validator(DeleteWorkforceNoteSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteWorkforceNote(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Governança ────────────────────────────────────────────────────────────

export const createWorkforceSurveyFn = createServerFn({ method: "POST" })
	.validator(CreateWorkforceSurveySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createWorkforceSurvey(getDb(), ctx, data).catch(handleDomainError)
	})

export const closeWorkforceSurveyFn = createServerFn({ method: "POST" })
	.validator(CloseWorkforceSurveySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return closeWorkforceSurvey(getDb(), ctx, data).catch(handleDomainError)
	})

export const createRanchoFn = createServerFn({ method: "POST" })
	.validator(CreateRanchoSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createRancho(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateRanchoFn = createServerFn({ method: "POST" })
	.validator(UpdateRanchoSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateRancho(getDb(), ctx, data).catch(handleDomainError)
	})
