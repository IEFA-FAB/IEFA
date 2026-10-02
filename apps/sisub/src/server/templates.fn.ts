/**
 * @module templates.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 *
 * applyTemplateFn: accepts targetDates[] for backward compat with frontend.
 *   Internally converts to startDate/endDate for domain operation.
 * @domain core
 * @migration done
 */

import {
	ApplyEventTemplateSchema,
	ApplyTemplateSchema,
	applyEventTemplate,
	applyTemplate,
	CreateBlankTemplateSchema,
	CreateTemplateSchema,
	createBlankTemplate,
	createTemplate,
	DeleteTemplateSchema,
	deleteTemplate,
	ForkTemplateSchema,
	forkTemplate,
	GetTemplateSchema,
	getTemplate,
	getTemplateItems,
	ListTemplatesSchema,
	listDeletedTemplates,
	listTemplates,
	RestoreTemplateSchema,
	restoreTemplate,
	SaveTemplateEditSchema,
	saveTemplateEdit,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { requireAuthThenRun } from "@/lib/domain-handler.server"
import type { TemplateWithItemCounts } from "@/types/domain/planning"

export const fetchMenuTemplatesFn = createServerFn({ method: "GET" })
	.validator(ListTemplatesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// listTemplates returns Record<string,unknown>[] — cast for TanStack Start serialization check
		return (await listTemplates(getDb(), ctx, data).catch(handleDomainError)) as unknown as TemplateWithItemCounts[]
	})

export const fetchDeletedTemplatesFn = createServerFn({ method: "GET" })
	.validator(ListTemplatesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await listDeletedTemplates(getDb(), ctx, data).catch(handleDomainError)) as unknown as TemplateWithItemCounts[]
	})

export const fetchTemplateFn = createServerFn({ method: "GET" }).validator(GetTemplateSchema).handler(requireAuthThenRun(getTemplate))

export const fetchTemplateItemsFn = createServerFn({ method: "GET" }).validator(GetTemplateSchema).handler(requireAuthThenRun(getTemplateItems))

export const createTemplateFn = createServerFn({ method: "POST" }).validator(CreateTemplateSchema).handler(requireAuthThenRun(createTemplate))

export const createBlankTemplateFn = createServerFn({ method: "POST" }).validator(CreateBlankTemplateSchema).handler(requireAuthThenRun(createBlankTemplate))

export const forkTemplateFn = createServerFn({ method: "POST" }).validator(ForkTemplateSchema).handler(requireAuthThenRun(forkTemplate))

export const saveTemplateEditFn = createServerFn({ method: "POST" }).validator(SaveTemplateEditSchema).handler(requireAuthThenRun(saveTemplateEdit))

export const deleteTemplateFn = createServerFn({ method: "POST" }).validator(DeleteTemplateSchema).handler(requireAuthThenRun(deleteTemplate))

export const restoreTemplateFn = createServerFn({ method: "POST" }).validator(RestoreTemplateSchema).handler(requireAuthThenRun(restoreTemplate))

// applyTemplateFn: o frontend manda as datas ESCOLHIDAS. `startDate`/`endDate` seguem indo
// (o domínio ainda os aceita como janela), mas quem determina o que é materializado — e, no
// modo "replace", o que é apagado — é a lista `dates`.
const ApplyTemplateFnSchema = z.object({
	templateId: z.uuid(),
	targetDates: z.array(z.string()).min(1),
	startDayOfWeek: z.number().int().min(1).max(7),
	kitchenId: z.number().int().positive(),
	conflictMode: z.enum(["replace", "skip"]).optional(),
	// Efetivo desta aplicação por tipo de refeição: o contrato é o do domínio.
	headcounts: ApplyTemplateSchema.shape.headcounts,
})

// applyEventTemplateFn: materializa evento/exceção em datas concretas (aditivo,
// não substitui o planejamento rotineiro do dia).
export const applyEventTemplateFn = createServerFn({ method: "POST" }).validator(ApplyEventTemplateSchema).handler(requireAuthThenRun(applyEventTemplate))

export const applyTemplateFn = createServerFn({ method: "POST" })
	.validator(ApplyTemplateFnSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const sorted = data.targetDates.toSorted()
		return applyTemplate(getDb(), ctx, {
			templateId: data.templateId,
			kitchenId: data.kitchenId,
			dates: sorted,
			startDate: sorted[0],
			endDate: sorted[sorted.length - 1],
			startDayOfWeek: data.startDayOfWeek,
			conflictMode: data.conflictMode,
			headcounts: data.headcounts,
		}).catch(handleDomainError)
	})
