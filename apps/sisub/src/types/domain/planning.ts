import type { DailyMenu, DailyMenuInsert, DailyMenuUpdate, MealType, MenuItem, MenuItemInsert, MenuItemUpdate, Recipe, Tables } from "@iefa/database/sisub"
import type { RecipeWithIngredients } from "@/types/domain/recipes"

export type { DailyMenu, DailyMenuInsert, DailyMenuUpdate, MenuItem, MenuItemInsert, MenuItemUpdate }

/**
 * Domain-level insert type for menu items.
 * Uses RecipeWithIngredients for the recipe snapshot field instead of the
 * generic Json type from Supabase, enabling end-to-end type safety on writes.
 */
export type AppMenuItemInsert = Omit<MenuItemInsert, "recipe"> & {
	recipe?: RecipeWithIngredients | null
}

export type PlanningStatus = "PLANNED" | "PUBLISHED" | "EXECUTED"

export type MenuTemplate = Tables<"menu_template">
export type MenuTemplateItem = Tables<"menu_template_items">

export type MenuTemplateWithItems = MenuTemplate & {
	items: (MenuTemplateItem & { recipe_origin: Recipe | null })[]
}

export interface DailyMenuWithItems extends DailyMenu {
	menu_items: (MenuItem & {
		recipe_origin: Recipe | null
	})[]
	meal_type: MealType | null
}

export type CalendarViewMode = "month" | "week"

export interface MenuDayData {
	date: Date
	dailyMenu: DailyMenuWithItems | null
	isCurrentMonth: boolean
	isToday: boolean
}

// --- Template Management Types ---

/**
 * Draft item para criação/edição de templates
 * Usado no TemplateEditor para state management
 */
export interface TemplateItemDraft {
	day_of_week: number // 1-7 (Monday-Sunday)
	meal_type_id: string
	recipe_id: string
	/** Previsão de comensais para esta preparação específica */
	headcount_override?: number | null
}

/**
 * Payload para aplicação de template em datas específicas
 */
export interface ApplyTemplatePayload {
	templateId: string
	targetDates: string[] // Array de datas no formato YYYY-MM-DD
	startDayOfWeek: number // 1-7, indica qual dia do template corresponde ao primeiro targetDate
	kitchenId: number
}

/**
 * Template com contagem de items e estatísticas de previsão de comensais.
 * headcount_filled = itens com headcount_override preenchido
 * avg_headcount_weekday = média de comensais Seg–Qui (refeições mais volumosas)
 */
export interface TemplateWithItemCounts extends MenuTemplate {
	item_count: number
	recipe_count: number
	headcount_filled: number
	avg_headcount_weekday: number | null
}
