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
