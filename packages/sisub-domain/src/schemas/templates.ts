import { z } from "zod"
import { DateSchema, KitchenIdSchema, UuidSchema } from "./common.ts"

export const ListTemplatesSchema = z.object({
	kitchenId: KitchenIdSchema.nullable().optional(),
})
export type ListTemplates = z.infer<typeof ListTemplatesSchema>

export const GetTemplateSchema = z.object({
	templateId: UuidSchema,
})
export type GetTemplate = z.infer<typeof GetTemplateSchema>

export const TemplateItemSchema = z.object({
	dayOfWeek: z.number().int().min(1).max(7),
	mealTypeId: UuidSchema,
	recipeId: UuidSchema,
	headcountOverride: z.number().int().positive().optional(),
})
export type TemplateItem = z.infer<typeof TemplateItemSchema>

export const CreateTemplateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	templateType: z.enum(["weekly", "event"]),
	items: z.array(TemplateItemSchema).optional(),
})
export type CreateTemplate = z.infer<typeof CreateTemplateSchema>

export const CreateBlankTemplateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	kitchenId: KitchenIdSchema.nullable().optional(),
	templateType: z.enum(["weekly", "event"]),
})
export type CreateBlankTemplate = z.infer<typeof CreateBlankTemplateSchema>

export const ForkTemplateSchema = z.object({
	sourceTemplateId: UuidSchema,
	targetKitchenId: KitchenIdSchema.optional(),
	newName: z.string().min(1).optional(),
})
export type ForkTemplate = z.infer<typeof ForkTemplateSchema>

export const UpdateTemplateSchema = z.object({
	templateId: UuidSchema,
	name: z.string().min(1).optional(),
	description: z.string().optional(),
	templateType: z.enum(["weekly", "event"]).optional(),
	items: z.array(TemplateItemSchema).optional(),
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
