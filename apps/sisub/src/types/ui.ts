// UI Types - Shared props and UI-specific types

import type { LucideIcon } from "lucide-react";
import type { DayMeals } from "@/lib/meal";

// ============================================================================
// UI HELPER TYPES
// ============================================================================

export interface CardData {
	date: string;
	daySelections: DayMeals;
	dayMessHallCode: string; // UI usa CODE
}

export type Step = {
	/** Título do passo */
	title: string;
	/** Descrição detalhada do passo */
	description: string;
	/** Ícone do Lucide React */
	icon: LucideIcon;
};

/**
 * Representa uma funcionalidade do sistema
 */
export type Feature = {
	title: string;
	description: string;
	icon: LucideIcon;
};
