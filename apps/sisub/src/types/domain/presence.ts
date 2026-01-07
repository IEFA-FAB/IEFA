// Presence Domain Types

import type { MealKey } from "./meal";

// ============================================================================
// PRESENCE MANAGEMENT TYPES
// ============================================================================

export interface PresenceRecord {
	id: string; // uuid do registro de presença
	user_id: string; // uuid do militar (nome da coluna do banco mantido)
	date: string; // yyyy-mm-dd
	meal: MealKey;
	unidade: string; // OM
	created_at: string;
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
 */
export interface ForecastRow {
	user_id: string;
	will_eat: boolean | null;
}

/**
 * Presence row data structure from database.
 */
export interface PresenceRow {
	id: string;
	user_id: string;
	date: string;
	meal: MealKey;
	created_at: string;
	mess_hall_id: number;
}

/**
 * Combined query result containing presences and forecast data.
 */
export interface QueryResult {
	presences: PresenceRecord[];
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
	presences: PresenceRecord[];
	forecastMap: ForecastMap;
	isLoading: boolean;
	isConfirming: boolean;
	isRemoving: boolean;
	confirmPresence: (
		uuid: string,
		willEnter: boolean,
	) => Promise<ConfirmPresenceResult>;
	removePresence: (row: PresenceRecord) => Promise<void>;
}

export type WillEnter = "sim" | "nao";

export type DialogState = {
	open: boolean;
	uuid: string | null;
	systemForecast: boolean | null;
	willEnter: "sim" | "nao";
};
