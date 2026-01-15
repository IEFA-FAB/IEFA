import type {
	DailyMenu,
	DailyMenuInsert,
	DailyMenuUpdate,
	MealType,
	MenuItem,
	MenuItemInsert,
	MenuItemUpdate,
	Recipe,
	Tables,
} from "@/types/supabase.types";

export type {
	DailyMenu,
	DailyMenuInsert,
	DailyMenuUpdate,
	MenuItem,
	MenuItemInsert,
	MenuItemUpdate,
};

export type PlanningStatus = "PLANNED" | "PUBLISHED" | "EXECUTED";

export type MenuTemplate = Tables<"menu_template">;
export type MenuTemplateItem = Tables<"menu_template_items">;

export type MenuTemplateWithItems = MenuTemplate & {
	items: (MenuTemplateItem & { recipe_origin: Recipe | null })[];
};

export interface DailyMenuWithItems extends DailyMenu {
	menu_items: (MenuItem & {
		recipe_origin: Recipe | null;
		recipe: Record<string, any>; // Snapshot
	})[];
	meal_type: MealType | null;
}

export type CalendarViewMode = "month" | "week";

export interface MenuDayData {
	date: Date;
	dailyMenu: DailyMenuWithItems | null;
	isCurrentMonth: boolean;
	isToday: boolean;
}

// --- Template Management Types ---

/**
 * Draft item para criação/edição de templates
 * Usado no TemplateEditor para state management
 */
export interface TemplateItemDraft {
	day_of_week: number; // 1-7 (Monday-Sunday)
	meal_type_id: string;
	recipe_id: string;
}

/**
 * Payload para aplicação de template em datas específicas
 */
export interface ApplyTemplatePayload {
	templateId: string;
	targetDates: string[]; // Array de datas no formato YYYY-MM-DD
	startDayOfWeek: number; // 1-7, indica qual dia do template corresponde ao primeiro targetDate
	kitchenId: number;
}

/**
 * Template com contagem de items (para preview)
 */
export interface TemplateWithItemCounts extends MenuTemplate {
	item_count: number;
	recipe_count: number;
}
