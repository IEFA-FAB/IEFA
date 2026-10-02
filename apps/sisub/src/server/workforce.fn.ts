/**
 * @module workforce.fn
 * Server fns da matriz de efetivo por refeitório (roster, competência, quantitativos, observações).
 * Wrappers finos sobre as operations de @iefa/sisub-domain, com auth via requireAuthThenRun().
 * @domain core
 */

import {
	AddWorkforceNoteSchema,
	addWorkforceNote,
	CloseWorkforceSurveySchema,
	CreateMessHallWorkforceSchema,
	CreateWorkforceSurveySchema,
	closeWorkforceSurvey,
	createMessHallWorkforce,
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
	UpdateMessHallWorkforceSchema,
	updateMessHallWorkforce,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

// ── Leitura ───────────────────────────────────────────────────────────────

export const listWorkforceSurveysFn = createServerFn({ method: "GET" }).validator(ListWorkforceSurveysSchema).handler(requireAuthThenRun(listWorkforceSurveys))

export const fetchWorkforceMatrixFn = createServerFn({ method: "GET" }).validator(FetchWorkforceMatrixSchema).handler(requireAuthThenRun(fetchWorkforceMatrix))

export const fetchWorkforceNetworkFn = createServerFn({ method: "GET" })
	.validator(FetchWorkforceNetworkSchema)
	.handler(requireAuthThenRun(fetchWorkforceNetwork))

// ── Preenchimento ─────────────────────────────────────────────────────────

export const saveWorkforceSubmissionFn = createServerFn({ method: "POST" })
	.validator(SaveWorkforceSubmissionSchema)
	.handler(requireAuthThenRun(saveWorkforceSubmission))

export const addWorkforceNoteFn = createServerFn({ method: "POST" }).validator(AddWorkforceNoteSchema).handler(requireAuthThenRun(addWorkforceNote))

export const deleteWorkforceNoteFn = createServerFn({ method: "POST" }).validator(DeleteWorkforceNoteSchema).handler(requireAuthThenRun(deleteWorkforceNote))

// ── Governança ────────────────────────────────────────────────────────────

export const createWorkforceSurveyFn = createServerFn({ method: "POST" })
	.validator(CreateWorkforceSurveySchema)
	.handler(requireAuthThenRun(createWorkforceSurvey))

export const closeWorkforceSurveyFn = createServerFn({ method: "POST" }).validator(CloseWorkforceSurveySchema).handler(requireAuthThenRun(closeWorkforceSurvey))

export const createMessHallWorkforceFn = createServerFn({ method: "POST" })
	.validator(CreateMessHallWorkforceSchema)
	.handler(requireAuthThenRun(createMessHallWorkforce))

export const updateMessHallWorkforceFn = createServerFn({ method: "POST" })
	.validator(UpdateMessHallWorkforceSchema)
	.handler(requireAuthThenRun(updateMessHallWorkforce))
