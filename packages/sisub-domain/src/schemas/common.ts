import { z } from "zod"

export const KitchenIdSchema = z.number().int().positive()
export type KitchenId = z.infer<typeof KitchenIdSchema>

export const DateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
	.refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" })
export type DateString = z.infer<typeof DateSchema>

export const DateRangeSchema = z.object({
	startDate: DateSchema,
	endDate: DateSchema,
})
export type DateRange = z.infer<typeof DateRangeSchema>

export const UuidSchema = z.string().uuid()
export type Uuid = z.infer<typeof UuidSchema>

export const PaginationSchema = z.object({
	page: z.number().int().optional(),
	pageSize: z.number().int().optional(),
})
export type Pagination = z.infer<typeof PaginationSchema>

export const SortOrderSchema = z.number().int().nonnegative().optional()
export type SortOrder = z.infer<typeof SortOrderSchema>
