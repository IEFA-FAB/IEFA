// Meal and Forecast Domain Types

import type { LucideIcon } from "lucide-react";
import type { DayMeals } from "@/lib/meal";

export type { DayMeals };

export type MealKey = "cafe" | "almoco" | "janta" | "ceia";

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
 * Represents an organizational unit (OM) in the system.
 */
export interface Unit {
	id: number;
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

/**
 * Representa um tipo de refeição disponível no sistema
 */
export type MealType = {
	/** Nome da refeição (ex: "Café da Manhã") */
	label: string;
	/** Horário de disponibilidade (ex: "06:00 - 08:00") */
	time: string;
	/** Ícone do Lucide React */
	icon: LucideIcon;
};
