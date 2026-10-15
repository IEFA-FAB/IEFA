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
	/** Data, refeição e refeitório em que o crachá foi lido; sem ele, os filtros atuais da tela. */
	scope?: FiscalFilters
}

/**
 * O que `insertPresenceFn` devolve. A unicidade de `meal_presences` é pessoa + data + refeição,
 * SEM o refeitório: `duplicate` traz o refeitório da presença existente (`null` se ela sumiu
 * entre o insert e a leitura), e quem chama compara com o seu.
 */
export type InsertPresenceOutcome = { status: "inserted" } | { status: "duplicate"; messHallId: number | null; messHallName: string | null }

/**
 * Resultado da confirmação: `inserted` gravou agora; `duplicate` já estava gravada NESTE
 * refeitório; `elsewhere` já há presença nesta refeição em outro refeitório (ou não se sabe
 * onde), e nada foi gravado aqui; `skipped` o militar não vai entrar e nada foi gravado.
 */
export interface ConfirmPresenceResult {
	status: "inserted" | "duplicate" | "elsewhere" | "skipped"
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
	confirmPresence: (uuid: string, willEnter: boolean, scope?: FiscalFilters) => Promise<ConfirmPresenceResult>
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
	/** Recusado ou cancelado antes nesta refeição: sem fechamento automático, exige toque. */
	manual?: boolean
}
