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
	RecordMenuSubstitutionSchema,
	RemoveOriginFromDaySchema,
	ReplaceDayWithTemplateSchema,
	ReplaceMenuItemRecipeSchema,
	recordMenuSubstitution,
	removeOriginFromDay,
	replaceDayWithTemplate,
	replaceMenuItemRecipe,
	SizeOriginOnDaySchema,
	sizeOriginOnDay,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { requireAuthThenRun } from "@/lib/domain-handler.server"

export const removeOriginFromDayFn = createServerFn({ method: "POST" }).validator(RemoveOriginFromDaySchema).handler(requireAuthThenRun(removeOriginFromDay))

export const moveOriginToDateFn = createServerFn({ method: "POST" }).validator(MoveOriginToDateSchema).handler(requireAuthThenRun(moveOriginToDate))

export const sizeOriginOnDayFn = createServerFn({ method: "POST" }).validator(SizeOriginOnDaySchema).handler(requireAuthThenRun(sizeOriginOnDay))

export const replaceDayWithTemplateFn = createServerFn({ method: "POST" })
	.validator(ReplaceDayWithTemplateSchema)
	.handler(requireAuthThenRun(replaceDayWithTemplate))

export const replaceMenuItemRecipeFn = createServerFn({ method: "POST" })
	.validator(ReplaceMenuItemRecipeSchema)
	.handler(requireAuthThenRun(replaceMenuItemRecipe))

export const fetchMenuItemSubstituteOptionsFn = createServerFn({ method: "GET" })
	.validator(MenuItemSubstituteOptionsSchema)
	.handler(requireAuthThenRun(fetchMenuItemSubstituteOptions))

export const recordMenuSubstitutionFn = createServerFn({ method: "POST" })
	.validator(RecordMenuSubstitutionSchema)
	.handler(requireAuthThenRun(recordMenuSubstitution))
