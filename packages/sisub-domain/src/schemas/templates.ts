import { z } from "zod"
import { DateSchema, KitchenIdSchema, MenuItemGroupSchema, RecommendedProportionSchema, UuidSchema } from "./common.ts"

export const ListTemplatesSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type ListTemplates = z.infer<typeof ListTemplatesSchema>

export const GetTemplateSchema = z.object({
	templateId: UuidSchema,
})
export type GetTemplate = z.infer<typeof GetTemplateSchema>

/** Regimes de cardápio: rotina semanal, evento pontual, exceção previsível. */
export const TemplateTypeSchema = z.enum(["weekly", "event", "exception"])
export type TemplateType = z.infer<typeof TemplateTypeSchema>

/** Ocorrências mensais esperadas — só faz sentido para exceção; multiplica o custeio na Ata. */
export const ExpectedMonthlyOccurrencesSchema = z.number().int().positive()

export const TemplateItemSchema = z.object({
	dayOfWeek: z.number().int().min(1).max(7),
	mealTypeId: UuidSchema,
	recipeId: UuidSchema,
	headcountOverride: z.number().int().positive().optional(),
	/** Grupo canônico dentro da refeição (prato principal, guarnição, …). */
	itemGroup: MenuItemGroupSchema.nullable().optional(),
	/** Posição dentro do grupo, dentro da célula (dia+refeição). */
	sortOrder: z.number().int().nonnegative().optional(),
	/** Proporção recomendada de consumo (%), advisory. */
	recommendedProportion: RecommendedProportionSchema.nullable(),
})
export type TemplateItem = z.infer<typeof TemplateItemSchema>

/** Efetivo base por (dia + refeição) do template. headcount_override do item é exceção. */
export const TemplateMealSchema = z.object({
	dayOfWeek: z.number().int().min(1).max(7),
	mealTypeId: UuidSchema,
	baseHeadcount: z.number().int().positive().nullable(),
})
export type TemplateMeal = z.infer<typeof TemplateMealSchema>

export const CreateTemplateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	templateType: TemplateTypeSchema,
	expectedMonthlyOccurrences: ExpectedMonthlyOccurrencesSchema.nullable().optional(),
	items: z.array(TemplateItemSchema).optional(),
	meals: z.array(TemplateMealSchema).optional(),
})
export type CreateTemplate = z.infer<typeof CreateTemplateSchema>

export const CreateBlankTemplateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	templateType: TemplateTypeSchema,
	expectedMonthlyOccurrences: ExpectedMonthlyOccurrencesSchema.nullable().optional(),
})
export type CreateBlankTemplate = z.infer<typeof CreateBlankTemplateSchema>

export const ForkTemplateSchema = z.object({
	sourceTemplateId: UuidSchema,
	targetKitchenId: KitchenIdSchema.optional(),
	newName: z.string().min(1).optional(),
	description: z.string().optional(),
})
export type ForkTemplate = z.infer<typeof ForkTemplateSchema>

export const UpdateTemplateSchema = z.object({
	templateId: UuidSchema,
	name: z.string().min(1).optional(),
	// nullable: null limpa a descrição; undefined = não mexe.
	description: z.string().nullable().optional(),
	templateType: TemplateTypeSchema.optional(),
	expectedMonthlyOccurrences: ExpectedMonthlyOccurrencesSchema.nullable().optional(),
	items: z.array(TemplateItemSchema).optional(),
	meals: z.array(TemplateMealSchema).optional(),
})
export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>

export const DeleteTemplateSchema = z.object({
	templateId: UuidSchema,
})
export type DeleteTemplate = z.infer<typeof DeleteTemplateSchema>

export const RestoreTemplateSchema = z.object({
	templateId: UuidSchema,
})
export type RestoreTemplate = z.infer<typeof RestoreTemplateSchema>

export const ApplyTemplateSchema = z.object({
	templateId: UuidSchema,
	kitchenId: KitchenIdSchema,
	startDate: DateSchema,
	endDate: DateSchema,
	startDayOfWeek: z.number().int().min(1).max(7),
})
export type ApplyTemplate = z.infer<typeof ApplyTemplateSchema>

/**
 * Materializa um evento/exceção em datas concretas do calendário. Diferente do
 * applyTemplate semanal, é ADITIVO: soma itens ao cardápio existente do dia sem
 * apagar o planejamento rotineiro.
 */
export const ApplyEventTemplateSchema = z.object({
	templateId: UuidSchema,
	kitchenId: KitchenIdSchema,
	dates: z.array(DateSchema).min(1),
})
export type ApplyEventTemplate = z.infer<typeof ApplyEventTemplateSchema>
