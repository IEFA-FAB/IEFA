// Presence Domain Types

import type { MealPresence, MealPresenceInsert, MealPresenceUpdate, MealPresenceWithUser } from "@iefa/database/sisub"
import type { MealKey } from "./meal"

// ============================================================================
// BASE TYPES (Re-export de @iefa/database/sisub)
// ============================================================================

/**
 * Registro de presença em refeição - tabela meal_presences
 */
export type PresenceRow = MealPresence

/**
 * View de presença com dados do usuário
 */
/**
 * Types para Insert/Update de presenças
 */
export type { MealPresenceInsert, MealPresenceUpdate, MealPresenceWithUser }

// ============================================================================
// DOMAIN TYPES (Tipos de Negócio)
// ============================================================================

/**
 * Fiscal presence record for presence management
 * Estende PresenceRow com dados derivados de UI
 */
export interface FiscalPresenceRecord extends MealPresence {
	unidade: string // OM (campo derivado, vem de join com mess_hall -> unit)
}

/**
 * Filters for querying fiscal/presence data.
 * All fields are required for a valid query.
 */
export interface FiscalFilters {
	date: string
	meal: MealKey
	/** ID numérico do refeitório — vem do parâmetro da URL, não selecionado dentro da página */
	messHallId: number
}

/**
 * Arranchamento row data as returned from the database.
 * Subset de Arranchamento focado em user_id e will_eat
 */
export interface ArranchamentoRow {
	user_id: string
	will_eat: boolean | null
}

/**
 * Combined query result containing presences and arranchamento data.
 */
export interface QueryResult {
	presences: FiscalPresenceRecord[]
	arranchamentoMap: Record<string, boolean>
}

/**
 * Parameters for confirming a user's presence at a meal.
 */
export interface ConfirmPresenceParams {
	uuid: string
	willEnter: boolean
}

/**
 * Result of a presence confirmation operation.
 * If skipped is true, the operation was intentionally not performed.
 */
export interface ConfirmPresenceResult {
	skipped: boolean
}

/**
 * Map of user IDs to arranchamento status.
 * Key: user_id (UUID)
 * Value: boolean indicating if the user is arranchado (will eat)
 */
export type ArranchamentoMap = Record<string, boolean>

/**
 * Return type for the usePresenceManagement hook.
 * Provides state and methods for managing meal presences.
 */
export interface UsePresenceManagementReturn {
	presences: FiscalPresenceRecord[]
	arranchamentoMap: ArranchamentoMap
	isLoading: boolean
	isConfirming: boolean
	isRemoving: boolean
	confirmPresence: (uuid: string, willEnter: boolean) => Promise<ConfirmPresenceResult>
	removePresence: (row: FiscalPresenceRecord) => Promise<void>
}

/**
 * Estados de confirmação de entrada
 */
export type WillEnter = "sim" | "nao"

/**
 * Estado do dialog de confirmação de presença
 */
export type DialogState = {
	open: boolean
	uuid: string | null
	willEat: boolean | null
	willEnter: "sim" | "nao"
}
