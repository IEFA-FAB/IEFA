/**
 * @module equipment.fn
 * Server fns dos equipamentos de cozinha (papel × modelo × parque × exigência da preparação).
 * Wrappers finos sobre as operations de @iefa/sisub-domain, com auth via requireAuthThenRun().
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
import { requireAuthThenRun } from "@/lib/domain-handler.server"

// ── Catálogo: papéis ──────────────────────────────────────────────────────

export const listEquipmentRolesFn = createServerFn({ method: "GET" }).validator(ListEquipmentRolesSchema).handler(requireAuthThenRun(listEquipmentRoles))

export const createEquipmentRoleFn = createServerFn({ method: "POST" }).validator(CreateEquipmentRoleSchema).handler(requireAuthThenRun(createEquipmentRole))

export const updateEquipmentRoleFn = createServerFn({ method: "POST" }).validator(UpdateEquipmentRoleSchema).handler(requireAuthThenRun(updateEquipmentRole))

export const deleteEquipmentRoleFn = createServerFn({ method: "POST" }).validator(DeleteEquipmentRoleSchema).handler(requireAuthThenRun(deleteEquipmentRole))

// ── Catálogo: modelos ─────────────────────────────────────────────────────

export const listEquipmentModelsFn = createServerFn({ method: "GET" }).validator(ListEquipmentModelsSchema).handler(requireAuthThenRun(listEquipmentModels))

export const createEquipmentModelFn = createServerFn({ method: "POST" }).validator(CreateEquipmentModelSchema).handler(requireAuthThenRun(createEquipmentModel))

export const updateEquipmentModelFn = createServerFn({ method: "POST" }).validator(UpdateEquipmentModelSchema).handler(requireAuthThenRun(updateEquipmentModel))

export const deleteEquipmentModelFn = createServerFn({ method: "POST" }).validator(DeleteEquipmentModelSchema).handler(requireAuthThenRun(deleteEquipmentModel))

// ── Parque instalado ──────────────────────────────────────────────────────

export const listKitchenEquipmentFn = createServerFn({ method: "GET" }).validator(ListKitchenEquipmentSchema).handler(requireAuthThenRun(listKitchenEquipment))

export const createEquipmentUnitFn = createServerFn({ method: "POST" }).validator(CreateEquipmentUnitSchema).handler(requireAuthThenRun(createEquipmentUnit))

export const updateEquipmentUnitFn = createServerFn({ method: "POST" }).validator(UpdateEquipmentUnitSchema).handler(requireAuthThenRun(updateEquipmentUnit))

export const deleteEquipmentUnitFn = createServerFn({ method: "POST" }).validator(DeleteEquipmentUnitSchema).handler(requireAuthThenRun(deleteEquipmentUnit))

// ── Exigência da preparação ───────────────────────────────────────────────

export const fetchRecipeEquipmentFn = createServerFn({ method: "GET" }).validator(FetchRecipeEquipmentSchema).handler(requireAuthThenRun(fetchRecipeEquipment))

export const saveRecipeEquipmentFn = createServerFn({ method: "POST" }).validator(SaveRecipeEquipmentSchema).handler(requireAuthThenRun(saveRecipeEquipment))

export const evaluateRecipeEquipmentFitnessFn = createServerFn({ method: "GET" })
	.validator(EvaluateRecipeEquipmentFitnessSchema)
	.handler(requireAuthThenRun(evaluateRecipeEquipmentFitness))

export const suggestRecipeEquipmentFromFlowFn = createServerFn({ method: "GET" })
	.validator(SuggestRecipeEquipmentSchema)
	.handler(requireAuthThenRun(suggestRecipeEquipmentFromFlow))

export const setUtensilRoleFn = createServerFn({ method: "POST" }).validator(SetUtensilRoleSchema).handler(requireAuthThenRun(setUtensilRole))

export const evaluateMenuEquipmentFitnessFn = createServerFn({ method: "GET" })
	.validator(EvaluateMenuEquipmentFitnessSchema)
	.handler(requireAuthThenRun(evaluateMenuEquipmentFitness))

// ── Panes ─────────────────────────────────────────────────────────────────

export const listEquipmentIssuesFn = createServerFn({ method: "GET" }).validator(ListEquipmentIssuesSchema).handler(requireAuthThenRun(listEquipmentIssues))

export const reportEquipmentIssueFn = createServerFn({ method: "POST" }).validator(ReportEquipmentIssueSchema).handler(requireAuthThenRun(reportEquipmentIssue))

export const updateEquipmentIssueFn = createServerFn({ method: "POST" }).validator(UpdateEquipmentIssueSchema).handler(requireAuthThenRun(updateEquipmentIssue))

// ── Rotinas de manutenção ─────────────────────────────────────────────────

export const listMaintenancePlansFn = createServerFn({ method: "GET" }).validator(ListMaintenancePlansSchema).handler(requireAuthThenRun(listMaintenancePlans))

export const listApplicablePlansFn = createServerFn({ method: "GET" }).validator(ListApplicablePlansSchema).handler(requireAuthThenRun(listApplicablePlans))

export const createMaintenancePlanFn = createServerFn({ method: "POST" })
	.validator(CreateMaintenancePlanSchema)
	.handler(requireAuthThenRun(createMaintenancePlan))

export const updateMaintenancePlanFn = createServerFn({ method: "POST" })
	.validator(UpdateMaintenancePlanSchema)
	.handler(requireAuthThenRun(updateMaintenancePlan))

export const deleteMaintenancePlanFn = createServerFn({ method: "POST" })
	.validator(DeleteMaintenancePlanSchema)
	.handler(requireAuthThenRun(deleteMaintenancePlan))

export const logMaintenanceFn = createServerFn({ method: "POST" }).validator(LogMaintenanceSchema).handler(requireAuthThenRun(logMaintenance))

export const listMaintenanceLogsFn = createServerFn({ method: "GET" }).validator(ListMaintenanceLogsSchema).handler(requireAuthThenRun(listMaintenanceLogs))

// ── Relatórios ────────────────────────────────────────────────────────────

export const getKitchenEquipmentConditionFn = createServerFn({ method: "GET" })
	.validator(KitchenEquipmentConditionSchema)
	.handler(requireAuthThenRun(getKitchenEquipmentCondition))

export const getKitchenMaintenanceMatrixFn = createServerFn({ method: "GET" })
	.validator(KitchenMaintenanceMatrixSchema)
	.handler(requireAuthThenRun(getKitchenMaintenanceMatrix))

export const getFleetEquipmentReportFn = createServerFn({ method: "GET" })
	.validator(FleetEquipmentReportSchema)
	.handler(requireAuthThenRun(getFleetEquipmentReport))
