/**
 * @module recipe-flow.fn
 * Server fns do Fluxo de Produção (DAG do modo de preparo). Wrappers finos sobre
 * as operations de @iefa/sisub-domain, com auth via requireAuth().
 * @domain core
 */

import {
	CreateStepTemplateSchema,
	CreateUtensilSchema,
	createStepTemplate,
	createUtensil,
	FetchRecipeFlowSchema,
	fetchRecipeFlow,
	ListStepTemplatesSchema,
	ListUtensilsSchema,
	listStepTemplates,
	listUtensils,
	SaveRecipeFlowSchema,
	saveRecipeFlow,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const fetchRecipeFlowFn = createServerFn({ method: "GET" })
	.validator(FetchRecipeFlowSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchRecipeFlow(getDb(), ctx, data).catch(handleDomainError)
	})

export const saveRecipeFlowFn = createServerFn({ method: "POST" })
	.validator(SaveRecipeFlowSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return saveRecipeFlow(getDb(), ctx, data).catch(handleDomainError)
	})

export const listStepTemplatesFn = createServerFn({ method: "GET" })
	.validator(ListStepTemplatesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listStepTemplates(getDb(), ctx, data).catch(handleDomainError)
	})

export const createStepTemplateFn = createServerFn({ method: "POST" })
	.validator(CreateStepTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createStepTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const listUtensilsFn = createServerFn({ method: "GET" })
	.validator(ListUtensilsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return listUtensils(getDb(), ctx, data).catch(handleDomainError)
	})

export const createUtensilFn = createServerFn({ method: "POST" })
	.validator(CreateUtensilSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createUtensil(getDb(), ctx, data).catch(handleDomainError)
	})
