/**
 * @module templates.fn
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 * Auth enforced via requireAuth() — all endpoints now require authentication.
 *
 * applyTemplateFn: accepts targetDates[] for backward compat with frontend.
 *   Internally converts to startDate/endDate for domain operation.
 */

import {
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
import { handleDomainError } from "@/lib/domain-errors"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { TemplateWithItemCounts } from "@/types/domain/planning"

export const fetchMenuTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(ListTemplatesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		// listTemplates returns Record<string,unknown>[] — cast for TanStack Start serialization check
		return (await listTemplates(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as TemplateWithItemCounts[]
	})

export const fetchDeletedTemplatesFn = createServerFn({ method: "GET" })
	.inputValidator(ListTemplatesSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return (await listDeletedTemplates(getSupabaseServerClient(), ctx, data).catch(handleDomainError)) as unknown as TemplateWithItemCounts[]
	})

export const fetchTemplateFn = createServerFn({ method: "GET" })
	.inputValidator(GetTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getTemplate(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const fetchTemplateItemsFn = createServerFn({ method: "GET" })
	.inputValidator(GetTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return getTemplateItems(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(CreateTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createTemplate(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const createBlankTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(CreateBlankTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return createBlankTemplate(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const forkTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(ForkTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return forkTemplate(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const updateTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(UpdateTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return updateTemplate(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const deleteTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(DeleteTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return deleteTemplate(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

export const restoreTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(RestoreTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return restoreTemplate(getSupabaseServerClient(), ctx, data).catch(handleDomainError)
	})

// applyTemplateFn: accepts targetDates[] for backward compat with frontend.
// The domain operation works with startDate/endDate; we derive them from the sorted array.
const ApplyTemplateFnSchema = z.object({
	templateId: z.string().uuid(),
	targetDates: z.array(z.string()).min(1),
	startDayOfWeek: z.number().int().min(1).max(7),
	kitchenId: z.number().int().positive(),
})

export const applyTemplateFn = createServerFn({ method: "POST" })
	.inputValidator(ApplyTemplateFnSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		const sorted = [...data.targetDates].sort()
		return applyTemplate(getSupabaseServerClient(), ctx, {
			templateId: data.templateId,
			kitchenId: data.kitchenId,
			startDate: sorted[0],
			endDate: sorted[sorted.length - 1],
			startDayOfWeek: data.startDayOfWeek,
		}).catch(handleDomainError)
	})
