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
	createEquipmentModel,
	createEquipmentRole,
	createEquipmentUnit,
	DeleteEquipmentModelSchema,
	DeleteEquipmentRoleSchema,
	DeleteEquipmentUnitSchema,
	deleteEquipmentModel,
	deleteEquipmentRole,
	deleteEquipmentUnit,
	EvaluateRecipeEquipmentFitnessSchema,
	evaluateRecipeEquipmentFitness,
	FetchRecipeEquipmentSchema,
	fetchRecipeEquipment,
	ListEquipmentModelsSchema,
	ListEquipmentRolesSchema,
	ListKitchenEquipmentSchema,
	listEquipmentModels,
	listEquipmentRoles,
	listKitchenEquipment,
	SaveRecipeEquipmentSchema,
	saveRecipeEquipment,
	UpdateEquipmentModelSchema,
	UpdateEquipmentRoleSchema,
	UpdateEquipmentUnitSchema,
	updateEquipmentModel,
	updateEquipmentRole,
	updateEquipmentUnit,
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
