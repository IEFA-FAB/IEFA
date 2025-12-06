// src/types/domain.ts

import type { DayMeals } from "@/utils/RanchoUtils";
export type { DayMeals };

export type MealKey = "cafe" | "almoco" | "janta" | "ceia";

export interface PresenceRecord {
	id: string; // uuid do registro de presença
	user_id: string; // uuid do militar (nome da coluna do banco mantido)
	date: string; // yyyy-mm-dd
	meal: MealKey;
	unidade: string; // OM
	created_at: string;
}

export type DialogState = {
	open: boolean;
	uuid: string | null;
	systemForecast: boolean | null;
	willEnter: "sim" | "nao";
};

// ============================================================================
// UI HELPER TYPES
// ============================================================================

export interface CardData {
	date: string;
	daySelections: DayMeals;
	dayMessHallCode: string; // UI usa CODE
}

// ============================================================================
// MESS HALL TYPES
// ============================================================================

/**
 * Represents an organizational unit (OM) in the system.
 */
export interface Unit {
	id: number;
	code: string;
	name: string | null;
}

/**
 * Represents a mess hall (rancho) belonging to a unit.
 */
export interface MessHall {
	id: number;
	unitId: number;
	code: string;
	name: string | null;
}

/**
 * Lightweight option structure for UI selects and dropdowns.
 */
export interface Option {
	code: string;
	name: string;
}

// ============================================================================
// MEAL FORECAST TYPES
// ============================================================================

/**
 * Map of dates to meal selections.
 * Key: date in YYYY-MM-DD format
 * Value: object with boolean flags for each meal type
 */
export interface SelectionsByDate {
	[date: string]: DayMeals;
}

/**
 * Map of dates to mess hall codes.
 * Key: date in YYYY-MM-DD format
 * Value: mess hall code (string)
 */
export interface MessHallByDate {
	[date: string]: string; // code
}

/**
 * Represents a pending change to be synchronized with the server.
 * Used for optimistic updates and batch saving.
 */
export interface PendingChange {
	date: string;
	meal: keyof DayMeals;
	value: boolean;
	messHallId: string; // ID (string) -> sisub.mess_halls.id
}

/**
 * Return type for the useMealForecast hook.
 * Provides state and methods for managing meal forecasts.
 */
export interface MealForecastHook {
	success: string;
	error: string;
	isLoading: boolean; // initial load
	isRefetching: boolean; // background refetch
	pendingChanges: PendingChange[];
	isSavingBatch: boolean;
	selections: SelectionsByDate;
	dayMessHalls: MessHallByDate; // CODE por data
	defaultMessHallId: string; // ID preferido do usuário (string)
	dates: string[];
	todayString: string;
	setSuccess: (msg: string) => void;
	setError: (msg: string) => void;
	setPendingChanges: React.Dispatch<React.SetStateAction<PendingChange[]>>;
	setSelections: React.Dispatch<React.SetStateAction<SelectionsByDate>>;
	setDayMessHalls: React.Dispatch<React.SetStateAction<MessHallByDate>>;
	setDefaultMessHallId: (id: string) => void; // setter local
	persistDefaultMessHallId: () => Promise<void>; // persiste no banco
	loadExistingForecasts: () => Promise<void>;
	savePendingChanges: () => Promise<void>;
	clearMessages: () => void;
}

// ============================================================================
// PRESENCE MANAGEMENT TYPES
// ============================================================================

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

// ============================================================================
// PROFILE TYPES
// ============================================================================

export type UserDataRow = {
	id: string;
	email: string;
	nrOrdem: string | null;
};

export type MilitaryDataRow = {
	nrOrdem: string | null;
	nrCpf: string;
	nmGuerra: string | null;
	nmPessoa: string | null;
	sgPosto: string | null;
	sgOrg: string | null;
	dataAtualizacao: string | null; // timestamp with time zone -> string
};

export type WillEnter = "sim" | "nao";
