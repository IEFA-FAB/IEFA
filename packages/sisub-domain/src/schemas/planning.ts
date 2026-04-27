import { z } from "zod"
import { DateSchema, KitchenIdSchema, UuidSchema } from "./common.ts"

export const DailyMenuFetchSchema = z.object({
	kitchenId: KitchenIdSchema,
	startDate: DateSchema,
	endDate: DateSchema,
})
export type DailyMenuFetch = z.infer<typeof DailyMenuFetchSchema>

export const DayDetailsFetchSchema = z.object({
	kitchenId: KitchenIdSchema,
	date: DateSchema,
})
export type DayDetailsFetch = z.infer<typeof DayDetailsFetchSchema>

export const UpsertDailyMenuSchema = z.object({
	kitchenId: KitchenIdSchema,
	serviceDate: DateSchema,
	mealTypeId: UuidSchema,
	forecastedHeadcount: z.number().int().positive().optional(),
})
export type UpsertDailyMenu = z.infer<typeof UpsertDailyMenuSchema>

export const AddMenuItemSchema = z.object({
	dailyMenuId: UuidSchema,
	recipeId: UuidSchema,
	plannedPortionQuantity: z.number().positive().optional(),
	excludedFromProcurement: z.union([z.literal(0), z.literal(1)]).optional(),
})
export type AddMenuItem = z.infer<typeof AddMenuItemSchema>

export const UpdateMenuItemSchema = z.object({
	menuItemId: UuidSchema,
	plannedPortionQuantity: z.number().positive().optional(),
	excludedFromProcurement: z.union([z.literal(0), z.literal(1)]).optional(),
})
export type UpdateMenuItem = z.infer<typeof UpdateMenuItemSchema>

export const RemoveMenuItemSchema = z.object({
	menuItemId: UuidSchema,
})
export type RemoveMenuItem = z.infer<typeof RemoveMenuItemSchema>

export const RestoreMenuItemSchema = z.object({
	menuItemId: UuidSchema,
})
export type RestoreMenuItem = z.infer<typeof RestoreMenuItemSchema>

export const UpdateHeadcountSchema = z.object({
	dailyMenuId: UuidSchema,
	forecastedHeadcount: z.number().int().positive(),
})
export type UpdateHeadcount = z.infer<typeof UpdateHeadcountSchema>

const SubstitutionEntrySchema = z.object({
	type: z.string(),
	rationale: z.string(),
	updated_at: z.string(),
})

export const UpdateSubstitutionsSchema = z.object({
	menuItemId: UuidSchema,
	substitutions: z.record(z.string(), SubstitutionEntrySchema),
})
export type UpdateSubstitutions = z.infer<typeof UpdateSubstitutionsSchema>

export const GetTrashItemsSchema = z.object({
	kitchenId: KitchenIdSchema,
})
export type GetTrashItems = z.infer<typeof GetTrashItemsSchema>
