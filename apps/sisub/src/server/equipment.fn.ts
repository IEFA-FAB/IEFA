/**
 * @module equipment.fn
 * Server fns dos equipamentos de cozinha (papel × modelo × parque × exigência da preparação).
 * Wrappers finos sobre as operations de @iefa/sisub-domain, com auth via requireAuth().
 * @domain core
 */

import {
	CreateEquipmentModelSchema,
	CreateEquipmentRoleSchema,
	CreateEquipmentUnitSchema,
	CreateMaintenancePlanSchema,
	createEquipmentModel,
	createEquipmentRole,
	createEquipmentUnit,
	createMaintenancePlan,
	DeleteEquipmentModelSchema,
	DeleteEquipmentRoleSchema,
	DeleteEquipmentUnitSchema,
	DeleteMaintenancePlanSchema,
	deleteEquipmentModel,
	deleteEquipmentRole,
	deleteEquipmentUnit,
	deleteMaintenancePlan,
	EvaluateMenuEquipmentFitnessSchema,
	EvaluateRecipeEquipmentFitnessSchema,
	evaluateMenuEquipmentFitness,
	evaluateRecipeEquipmentFitness,
	FetchRecipeEquipmentSchema,
	FleetEquipmentReportSchema,
	fetchRecipeEquipment,
	getFleetEquipmentReport,
	getKitchenEquipmentCondition,
	getKitchenMaintenanceMatrix,
	KitchenEquipmentConditionSchema,
	KitchenMaintenanceMatrixSchema,
	ListApplicablePlansSchema,
	ListEquipmentIssuesSchema,
	ListEquipmentModelsSchema,
	ListEquipmentRolesSchema,
	ListKitchenEquipmentSchema,
	ListMaintenanceLogsSchema,
	ListMaintenancePlansSchema,
	LogMaintenanceSchema,
	listApplicablePlans,
	listEquipmentIssues,
	listEquipmentModels,
	listEquipmentRoles,
	listKitchenEquipment,
	listMaintenanceLogs,
	listMaintenancePlans,
	logMaintenance,
	ReportEquipmentIssueSchema,
	reportEquipmentIssue,
	SaveRecipeEquipmentSchema,
	SetUtensilRoleSchema,
	SuggestRecipeEquipmentSchema,
	saveRecipeEquipment,
	setUtensilRole,
	suggestRecipeEquipmentFromFlow,
	UpdateEquipmentIssueSchema,
	UpdateEquipmentModelSchema,
	UpdateEquipmentRoleSchema,
	UpdateEquipmentUnitSchema,
	UpdateMaintenancePlanSchema,
	updateEquipmentIssue,
	updateEquipmentModel,
	updateEquipmentRole,
	updateEquipmentUnit,
	updateMaintenancePlan,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

// ── Catálogo: papéis ──────────────────────────────────────────────────────

export const listEquipmentRolesFn = createServerFn({ method: "GET" })
	.validator(ListEquipmentRolesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listEquipmentRoles(getDb(), ctx, data).catch(handleDomainError)
	})

export const createEquipmentRoleFn = createServerFn({ method: "POST" })
	.validator(CreateEquipmentRoleSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createEquipmentRole(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateEquipmentRoleFn = createServerFn({ method: "POST" })
	.validator(UpdateEquipmentRoleSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateEquipmentRole(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteEquipmentRoleFn = createServerFn({ method: "POST" })
	.validator(DeleteEquipmentRoleSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteEquipmentRole(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Catálogo: modelos ─────────────────────────────────────────────────────

export const listEquipmentModelsFn = createServerFn({ method: "GET" })
	.validator(ListEquipmentModelsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listEquipmentModels(getDb(), ctx, data).catch(handleDomainError)
	})

export const createEquipmentModelFn = createServerFn({ method: "POST" })
	.validator(CreateEquipmentModelSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createEquipmentModel(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateEquipmentModelFn = createServerFn({ method: "POST" })
	.validator(UpdateEquipmentModelSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateEquipmentModel(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteEquipmentModelFn = createServerFn({ method: "POST" })
	.validator(DeleteEquipmentModelSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteEquipmentModel(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Parque instalado ──────────────────────────────────────────────────────

export const listKitchenEquipmentFn = createServerFn({ method: "GET" })
	.validator(ListKitchenEquipmentSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listKitchenEquipment(getDb(), ctx, data).catch(handleDomainError)
	})

export const createEquipmentUnitFn = createServerFn({ method: "POST" })
	.validator(CreateEquipmentUnitSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createEquipmentUnit(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateEquipmentUnitFn = createServerFn({ method: "POST" })
	.validator(UpdateEquipmentUnitSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateEquipmentUnit(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteEquipmentUnitFn = createServerFn({ method: "POST" })
	.validator(DeleteEquipmentUnitSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteEquipmentUnit(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Exigência da preparação ───────────────────────────────────────────────

export const fetchRecipeEquipmentFn = createServerFn({ method: "GET" })
	.validator(FetchRecipeEquipmentSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchRecipeEquipment(getDb(), ctx, data).catch(handleDomainError)
	})

export const saveRecipeEquipmentFn = createServerFn({ method: "POST" })
	.validator(SaveRecipeEquipmentSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return saveRecipeEquipment(getDb(), ctx, data).catch(handleDomainError)
	})

export const evaluateRecipeEquipmentFitnessFn = createServerFn({ method: "GET" })
	.validator(EvaluateRecipeEquipmentFitnessSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return evaluateRecipeEquipmentFitness(getDb(), ctx, data).catch(handleDomainError)
	})

export const suggestRecipeEquipmentFromFlowFn = createServerFn({ method: "GET" })
	.validator(SuggestRecipeEquipmentSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return suggestRecipeEquipmentFromFlow(getDb(), ctx, data).catch(handleDomainError)
	})

export const setUtensilRoleFn = createServerFn({ method: "POST" })
	.validator(SetUtensilRoleSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return setUtensilRole(getDb(), ctx, data).catch(handleDomainError)
	})

export const evaluateMenuEquipmentFitnessFn = createServerFn({ method: "GET" })
	.validator(EvaluateMenuEquipmentFitnessSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return evaluateMenuEquipmentFitness(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Panes ─────────────────────────────────────────────────────────────────

export const listEquipmentIssuesFn = createServerFn({ method: "GET" })
	.validator(ListEquipmentIssuesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listEquipmentIssues(getDb(), ctx, data).catch(handleDomainError)
	})

export const reportEquipmentIssueFn = createServerFn({ method: "POST" })
	.validator(ReportEquipmentIssueSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return reportEquipmentIssue(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateEquipmentIssueFn = createServerFn({ method: "POST" })
	.validator(UpdateEquipmentIssueSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateEquipmentIssue(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Rotinas de manutenção ─────────────────────────────────────────────────

export const listMaintenancePlansFn = createServerFn({ method: "GET" })
	.validator(ListMaintenancePlansSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listMaintenancePlans(getDb(), ctx, data).catch(handleDomainError)
	})

export const listApplicablePlansFn = createServerFn({ method: "GET" })
	.validator(ListApplicablePlansSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listApplicablePlans(getDb(), ctx, data).catch(handleDomainError)
	})

export const createMaintenancePlanFn = createServerFn({ method: "POST" })
	.validator(CreateMaintenancePlanSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createMaintenancePlan(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateMaintenancePlanFn = createServerFn({ method: "POST" })
	.validator(UpdateMaintenancePlanSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateMaintenancePlan(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteMaintenancePlanFn = createServerFn({ method: "POST" })
	.validator(DeleteMaintenancePlanSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteMaintenancePlan(getDb(), ctx, data).catch(handleDomainError)
	})

export const logMaintenanceFn = createServerFn({ method: "POST" })
	.validator(LogMaintenanceSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return logMaintenance(getDb(), ctx, data).catch(handleDomainError)
	})

export const listMaintenanceLogsFn = createServerFn({ method: "GET" })
	.validator(ListMaintenanceLogsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listMaintenanceLogs(getDb(), ctx, data).catch(handleDomainError)
	})

// ── Relatórios ────────────────────────────────────────────────────────────

export const getKitchenEquipmentConditionFn = createServerFn({ method: "GET" })
	.validator(KitchenEquipmentConditionSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getKitchenEquipmentCondition(getDb(), ctx, data).catch(handleDomainError)
	})

export const getKitchenMaintenanceMatrixFn = createServerFn({ method: "GET" })
	.validator(KitchenMaintenanceMatrixSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getKitchenMaintenanceMatrix(getDb(), ctx, data).catch(handleDomainError)
	})

export const getFleetEquipmentReportFn = createServerFn({ method: "GET" })
	.validator(FleetEquipmentReportSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getFleetEquipmentReport(getDb(), ctx, data).catch(handleDomainError)
	})
