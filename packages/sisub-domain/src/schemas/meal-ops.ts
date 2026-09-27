import { z } from "zod"

// ─── Arranchamento (o comensal declara que vai comer) ──────────────────────

export const ListArranchamentosSchema = z.object({
	userId: z.string(),
	startDate: z.string(),
	endDate: z.string(),
})
export type ListArranchamentos = z.infer<typeof ListArranchamentosSchema>

export const GetUserDefaultMessHallSchema = z.object({ userId: z.string() })
export type GetUserDefaultMessHall = z.infer<typeof GetUserDefaultMessHallSchema>

export const PersistDefaultMessHallSchema = z.object({
	email: z.string(),
	messHallId: z.number(),
})
export type PersistDefaultMessHall = z.infer<typeof PersistDefaultMessHallSchema>

export const UpsertArranchamentoSchema = z.object({
	date: z.string(),
	meal: z.string(),
	willEat: z.boolean(),
	messHallId: z.number(),
})
export type UpsertArranchamento = z.infer<typeof UpsertArranchamentoSchema>

export const DeleteArranchamentoSchema = z.object({ date: z.string(), meal: z.string() })
export type DeleteArranchamento = z.infer<typeof DeleteArranchamentoSchema>

// ─── Presence (fiscal) ──────────────────────────────────────────────────────

export const ListPresencesSchema = z.object({
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
})
export type ListPresences = z.infer<typeof ListPresencesSchema>

export const ListArranchamentoMapSchema = z.object({
	date: z.string(),
	meal: z.string(),
	messHallId: z.number(),
	userIds: z.array(z.string()),
})
export type ListArranchamentoMap = z.infer<typeof ListArranchamentoMapSchema>

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

/** Registro do REAL: porções produzidas, sobras e observações da preparação do dia. */
export const UpdateProductionTaskRecordSchema = z.object({
	taskId: z.string(),
	// nullable: null limpa o campo; undefined = não mexe.
	producedQuantity: z.number().nonnegative().nullable().optional(),
	leftoverQuantity: z.number().nonnegative().nullable().optional(),
	notes: z.string().max(2000).nullable().optional(),
})
export type UpdateProductionTaskRecord = z.infer<typeof UpdateProductionTaskRecordSchema>

/** Ajuste de porções planejadas direto do painel de produção. */
export const AdjustProductionPortionsSchema = z.object({
	menuItemId: z.uuid(),
	plannedPortionQuantity: z.number().positive(),
})
export type AdjustProductionPortions = z.infer<typeof AdjustProductionPortionsSchema>

/**
 * Substituição de insumo registrada durante o turno (chão de fábrica). Mesmo registro do
 * agendamento (`RecordMenuSubstitutionSchema`): a chave é o insumo que FALTOU, e o que ENTROU
 * vai em `substituteDescription` (texto livre, cobre o que não está no catálogo) e, quando é
 * insumo do catálogo, em `substituteIngredientId`.
 */
export const RecordProductionSubstitutionSchema = z.object({
	menuItemId: z.uuid(),
	ingredientId: z.string().min(1),
	substituteIngredientId: z.uuid().nullable().optional(),
	substituteDescription: z.string().trim().min(1).max(200),
	rationale: z.string().trim().min(1).max(500),
})
export type RecordProductionSubstitution = z.infer<typeof RecordProductionSubstitutionSchema>

// ─── Daily menu content (aggregated dishes) ─────────────────────────────────

export const FetchDailyMenuContentSchema = z.object({
	kitchenIds: z.array(z.number()),
	startDate: z.string(),
	endDate: z.string(),
})
export type FetchDailyMenuContent = z.infer<typeof FetchDailyMenuContentSchema>
