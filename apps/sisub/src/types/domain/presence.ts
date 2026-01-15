// Presence Domain Types

import type {
	MealPresence,
	MealPresenceInsert,
	MealPresenceUpdate,
	MealPresenceWithUser,
} from "@/types/supabase.types";
import type { MealKey } from "./meal";

// ============================================================================
// BASE TYPES (Re-export de supabase.types.ts)
// ============================================================================

/**
 * Registro de presença em refeição - tabela meal_presences
 * Re-exportado de supabase.types.ts
 */
export type PresenceRow = MealPresence;

/**
 * View de presença com dados do usuário
 * Re-exportado de supabase.types.ts
 */
export type { MealPresenceWithUser };

/**
 * Types para Insert/Update de presenças
 */
export type { MealPresenceInsert, MealPresenceUpdate };

// ============================================================================
// DOMAIN TYPES (Tipos de Negócio)
// ============================================================================

/**
 * Fiscal presence record for presence management
 * Estende PresenceRow com dados derivados de UI
 */
export interface FiscalPresenceRecord extends MealPresence {
	unidade: string; // OM (campo derivado, vem de join com mess_hall -> unit)
}

/**
 * Filters for querying fiscal/presence data.
 * All fields are required for a valid query.
 */
export interface FiscalFilters {
	date: string;
	meal: MealKey;
	unit: string; // mess hall code
}

/**
 * Forecast row data as returned from the database.
 * Subset de MealForecast focado em user_id e will_eat
 */
export interface ForecastRow {
	user_id: string;
	will_eat: boolean | null;
}

/**
 * Combined query result containing presences and forecast data.
 */
export interface QueryResult {
	presences: FiscalPresenceRecord[];
	forecastMap: Record<string, boolean>;
}

/**
 * Parameters for confirming a user's presence at a meal.
 */
export interface ConfirmPresenceParams {
	uuid: string;
	willEnter: boolean;
}

/**
 * Result of a presence confirmation operation.
 * If skipped is true, the operation was intentionally not performed.
 */
export interface ConfirmPresenceResult {
	skipped: boolean;
}

/**
 * Map of user IDs to forecast status.
 * Key: user_id (UUID)
 * Value: boolean indicating if user forecasted they will eat
 */
export type ForecastMap = Record<string, boolean>;

/**
 * Return type for the usePresenceManagement hook.
 * Provides state and methods for managing meal presences.
 */
export interface UsePresenceManagementReturn {
	presences: FiscalPresenceRecord[];
	forecastMap: ForecastMap;
	isLoading: boolean;
	isConfirming: boolean;
	isRemoving: boolean;
	confirmPresence: (
		uuid: string,
		willEnter: boolean,
	) => Promise<ConfirmPresenceResult>;
	removePresence: (row: FiscalPresenceRecord) => Promise<void>;
}

/**
 * Estados de confirmação de entrada
 */
export type WillEnter = "sim" | "nao";

/**
 * Estado do dialog de confirmação de presença
 */
export type DialogState = {
	open: boolean;
	uuid: string | null;
	systemForecast: boolean | null;
	willEnter: "sim" | "nao";
};
