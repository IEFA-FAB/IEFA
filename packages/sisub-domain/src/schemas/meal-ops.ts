import { z } from "zod"
import { DateSchema, KitchenIdSchema } from "./common.ts"

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

/**
 * Tetos da leitura do cardápio pelo comensal. O arranchamento pede 30 dias a partir de hoje e,
 * no máximo, a cozinha padrão mais uma por dia com refeitório trocado (30 + 1); o cardápio da
 * semana pede 7 dias e uma cozinha. Os tetos cobrem as duas telas com folga zero de propósito:
 * acima disso não é tela, é varredura.
 */
export const DAILY_MENU_CONTENT_MAX_KITCHENS = 31
export const DAILY_MENU_CONTENT_MAX_DAYS = 31

const DAY_MS = 86_400_000

export const FetchDailyMenuContentSchema = z
	.object({
		kitchenIds: z.array(KitchenIdSchema).max(DAILY_MENU_CONTENT_MAX_KITCHENS, `no máximo ${DAILY_MENU_CONTENT_MAX_KITCHENS} cozinhas por consulta`),
		startDate: DateSchema,
		endDate: DateSchema,
	})
	.refine((v) => v.endDate >= v.startDate, { message: "a data final não pode ser anterior à inicial", path: ["endDate"] })
	.refine((v) => (Date.parse(`${v.endDate}T00:00:00Z`) - Date.parse(`${v.startDate}T00:00:00Z`)) / DAY_MS < DAILY_MENU_CONTENT_MAX_DAYS, {
		message: `no máximo ${DAILY_MENU_CONTENT_MAX_DAYS} dias por consulta`,
		path: ["endDate"],
	})
export type FetchDailyMenuContent = z.infer<typeof FetchDailyMenuContentSchema>
