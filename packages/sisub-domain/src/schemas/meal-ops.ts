import { z } from "zod"

// ─── Forecast (diner will_eat intent) ───────────────────────────────────────

export const ListMealForecastsSchema = z.object({
	userId: z.string(),
	startDate: z.string(),
	endDate: z.string(),
})
export type ListMealForecasts = z.infer<typeof ListMealForecastsSchema>

export const GetUserDefaultMessHallSchema = z.object({ userId: z.string() })
export type GetUserDefaultMessHall = z.infer<typeof GetUserDefaultMessHallSchema>

export const PersistDefaultMessHallSchema = z.object({
	email: z.string(),
	messHallId: z.number(),
})
export type PersistDefaultMessHall = z.infer<typeof PersistDefaultMessHallSchema>

export const UpsertForecastSchema = z.object({
	date: z.string(),
	meal: z.string(),
	willEat: z.boolean(),
	messHallId: z.number(),
})
export type UpsertForecast = z.infer<typeof UpsertForecastSchema>

export const DeleteForecastSchema = z.object({ date: z.string(), meal: z.string() })
export type DeleteForecast = z.infer<typeof DeleteForecastSchema>

// ─── Presence (fiscal) ──────────────────────────────────────────────────────

export const ListPresencesSchema = z.object({
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
})
export type ListPresences = z.infer<typeof ListPresencesSchema>

export const ListForecastMapSchema = z.object({
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
	userIds: z.array(z.string()),
})
export type ListForecastMap = z.infer<typeof ListForecastMapSchema>

export const InsertPresenceSchema = z.object({
	user_id: z.string(),
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
})
export type InsertPresence = z.infer<typeof InsertPresenceSchema>

export const DeletePresenceSchema = z.object({ id: z.string() })
export type DeletePresence = z.infer<typeof DeletePresenceSchema>

// ─── Production board ───────────────────────────────────────────────────────

export const FetchProductionBoardSchema = z.object({ kitchenId: z.number(), date: z.string() })
export type FetchProductionBoard = z.infer<typeof FetchProductionBoardSchema>

export const EnsureProductionTasksSchema = z.object({ kitchenId: z.number(), date: z.string() })
export type EnsureProductionTasks = z.infer<typeof EnsureProductionTasksSchema>

export const UpdateProductionTaskStatusSchema = z.object({
	taskId: z.string(),
	status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]),
})
export type UpdateProductionTaskStatus = z.infer<typeof UpdateProductionTaskStatusSchema>

// ─── Daily menu content (aggregated dishes) ─────────────────────────────────

export const FetchDailyMenuContentSchema = z.object({
	kitchenIds: z.array(z.number()),
	startDate: z.string(),
	endDate: z.string(),
})
export type FetchDailyMenuContent = z.infer<typeof FetchDailyMenuContentSchema>
