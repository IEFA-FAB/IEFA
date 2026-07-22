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
	UpdateTemplateSchema,
	updateTemplate,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
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

export const fetchTemplateFn = createServerFn({ method: "GET" })
	.validator(GetTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchTemplateItemsFn = createServerFn({ method: "GET" })
	.validator(GetTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getTemplateItems(getDb(), ctx, data).catch(handleDomainError)
	})

export const createTemplateFn = createServerFn({ method: "POST" })
	.validator(CreateTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const createBlankTemplateFn = createServerFn({ method: "POST" })
	.validator(CreateBlankTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createBlankTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const forkTemplateFn = createServerFn({ method: "POST" })
	.validator(ForkTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return forkTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const updateTemplateFn = createServerFn({ method: "POST" })
	.validator(UpdateTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const deleteTemplateFn = createServerFn({ method: "POST" })
	.validator(DeleteTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const restoreTemplateFn = createServerFn({ method: "POST" })
	.validator(RestoreTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

// applyTemplateFn: accepts targetDates[] for backward compat with frontend.
// The domain operation works with startDate/endDate; we derive them from the sorted array.
const ApplyTemplateFnSchema = z.object({
	templateId: z.string().uuid(),
	targetDates: z.array(z.string()).min(1),
	startDayOfWeek: z.number().int().min(1).max(7),
	kitchenId: z.number().int().positive(),
	conflictMode: z.enum(["replace", "skip"]).optional(),
})

// applyEventTemplateFn: materializa evento/exceção em datas concretas (aditivo,
// não substitui o planejamento rotineiro do dia).
export const applyEventTemplateFn = createServerFn({ method: "POST" })
	.validator(ApplyEventTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return applyEventTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const applyTemplateFn = createServerFn({ method: "POST" })
	.validator(ApplyTemplateFnSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const sorted = data.targetDates.toSorted()
		return applyTemplate(getDb(), ctx, {
			templateId: data.templateId,
			kitchenId: data.kitchenId,
			startDate: sorted[0],
			endDate: sorted[sorted.length - 1],
			startDayOfWeek: data.startDayOfWeek,
			conflictMode: data.conflictMode,
		}).catch(handleDomainError)
	})
