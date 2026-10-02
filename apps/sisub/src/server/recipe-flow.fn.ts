/**
 * @module recipe-flow.fn
 * Server fns do Fluxo de Produção (DAG do modo de preparo). Wrappers finos sobre
 * as operations de @iefa/sisub-domain, com auth via requireAuthThenRun().
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
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const fetchRecipeFlowFn = createServerFn({ method: "GET" }).validator(FetchRecipeFlowSchema).handler(requireAuthThenRun(fetchRecipeFlow))

export const saveRecipeFlowFn = createServerFn({ method: "POST" }).validator(SaveRecipeFlowSchema).handler(requireAuthThenRun(saveRecipeFlow))

export const listStepTemplatesFn = createServerFn({ method: "GET" }).validator(ListStepTemplatesSchema).handler(requireAuthThenRun(listStepTemplates))

export const createStepTemplateFn = createServerFn({ method: "POST" }).validator(CreateStepTemplateSchema).handler(requireAuthThenRun(createStepTemplate))

export const listUtensilsFn = createServerFn({ method: "GET" }).validator(ListUtensilsSchema).handler(requireAuthThenRun(listUtensils))

export const createUtensilFn = createServerFn({ method: "POST" }).validator(CreateUtensilSchema).handler(requireAuthThenRun(createUtensil))
