/**
 * @module planning-adjustments.fn
 * Imprevistos do Agendamento da Produção: cancelar/adiar o que um cardápio pôs num dia,
 * trocar o dia inteiro por contingência, trocar a preparação de um item e listar os
 * substitutos que a ficha prevê. Wrappers finos sobre `@iefa/sisub-domain`.
 * @domain kitchen
 */

import {
	fetchMenuItemSubstituteOptions,
	MenuItemSubstituteOptionsSchema,
	MoveOriginToDateSchema,
	moveOriginToDate,
	RemoveOriginFromDaySchema,
	ReplaceDayWithTemplateSchema,
	ReplaceMenuItemRecipeSchema,
	removeOriginFromDay,
	replaceDayWithTemplate,
	replaceMenuItemRecipe,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuth } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"

export const removeOriginFromDayFn = createServerFn({ method: "POST" })
	.validator(RemoveOriginFromDaySchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return removeOriginFromDay(getDb(), ctx, data).catch(handleDomainError)
	})

export const moveOriginToDateFn = createServerFn({ method: "POST" })
	.validator(MoveOriginToDateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return moveOriginToDate(getDb(), ctx, data).catch(handleDomainError)
	})

export const replaceDayWithTemplateFn = createServerFn({ method: "POST" })
	.validator(ReplaceDayWithTemplateSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return replaceDayWithTemplate(getDb(), ctx, data).catch(handleDomainError)
	})

export const replaceMenuItemRecipeFn = createServerFn({ method: "POST" })
	.validator(ReplaceMenuItemRecipeSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return replaceMenuItemRecipe(getDb(), ctx, data).catch(handleDomainError)
	})

export const fetchMenuItemSubstituteOptionsFn = createServerFn({ method: "GET" })
	.validator(MenuItemSubstituteOptionsSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuth()
		return fetchMenuItemSubstituteOptions(getDb(), ctx, data).catch(handleDomainError)
	})
