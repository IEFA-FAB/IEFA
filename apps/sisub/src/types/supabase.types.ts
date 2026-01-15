import type { Database } from "./database.types";

// ========================================
// Generic Helpers (schema-aware)
// ========================================

/**
 * Extrai tipo Row de uma tabela do schema sisub
 * @example type Profile = Tables<"profiles_admin">
 */
export type Tables<T extends keyof Database["sisub"]["Tables"]> =
	Database["sisub"]["Tables"][T]["Row"];

/**
 * Extrai tipo Insert de uma tabela do schema sisub
 * @example type ProfileInsert = TablesInsert<"profiles_admin">
 */
export type TablesInsert<T extends keyof Database["sisub"]["Tables"]> =
	Database["sisub"]["Tables"][T]["Insert"];

/**
 * Extrai tipo Update de uma tabela do schema sisub
 * @example type ProfileUpdate = TablesUpdate<"profiles_admin">
 */
export type TablesUpdate<T extends keyof Database["sisub"]["Tables"]> =
	Database["sisub"]["Tables"][T]["Update"];

/**
 * Extrai tipo de View do schema sisub
 * @example type UserIdentity = Views<"v_user_identity">
 */
export type Views<T extends keyof Database["sisub"]["Views"]> =
	Database["sisub"]["Views"][T]["Row"];

/**
 * Extrai tipo de Enum do schema sisub
 * @example type KitchenType = Enums<"kitchen_type">
 */
export type Enums<T extends keyof Database["sisub"]["Enums"]> =
	Database["sisub"]["Enums"][T];

// ========================================
// Specific Table Types (Export Ready)
// ========================================

// Auth & Users
export type ProfileAdmin = Tables<"profiles_admin">;
export type ProfileAdminInsert = TablesInsert<"profiles_admin">;
export type ProfileAdminUpdate = TablesUpdate<"profiles_admin">;

export type UserData = Tables<"user_data">;
export type UserDataInsert = TablesInsert<"user_data">;
export type UserDataUpdate = TablesUpdate<"user_data">;

export type UserMilitaryData = Tables<"user_military_data">;
export type UserMilitaryDataInsert = TablesInsert<"user_military_data">;
export type UserMilitaryDataUpdate = TablesUpdate<"user_military_data">;

// Meals & Forecasts
export type MealForecast = Tables<"meal_forecasts">;
export type MealForecastInsert = TablesInsert<"meal_forecasts">;
export type MealForecastUpdate = TablesUpdate<"meal_forecasts">;

export type MealPresence = Tables<"meal_presences">;
export type MealPresenceInsert = TablesInsert<"meal_presences">;
export type MealPresenceUpdate = TablesUpdate<"meal_presences">;

export type OtherPresence = Tables<"other_presences">;
export type OtherPresenceInsert = TablesInsert<"other_presences">;
export type OtherPresenceUpdate = TablesUpdate<"other_presences">;

// Infrastructure
export type MessHall = Tables<"mess_halls">;
export type MessHallInsert = TablesInsert<"mess_halls">;
export type MessHallUpdate = TablesUpdate<"mess_halls">;

export type Kitchen = Tables<"kitchen">;
export type KitchenInsert = TablesInsert<"kitchen">;
export type KitchenUpdate = TablesUpdate<"kitchen">;

export type Unit = Tables<"units">;
export type UnitInsert = TablesInsert<"units">;
export type UnitUpdate = TablesUpdate<"units">;

// Menu Management
export type DailyMenu = Tables<"daily_menu">;
export type DailyMenuInsert = TablesInsert<"daily_menu">;
export type DailyMenuUpdate = TablesUpdate<"daily_menu">;

export type MealType = Tables<"meal_type">;
export type MealTypeInsert = TablesInsert<"meal_type">;
export type MealTypeUpdate = TablesUpdate<"meal_type">;

export type MenuItem = Tables<"menu_items">;
export type MenuItemInsert = TablesInsert<"menu_items">;
export type MenuItemUpdate = TablesUpdate<"menu_items">;

export type MenuTemplate = Tables<"menu_template">;
export type MenuTemplateInsert = TablesInsert<"menu_template">;
export type MenuTemplateUpdate = TablesUpdate<"menu_template">;

export type MenuTemplateItem = Tables<"menu_template_items">;
export type MenuTemplateItemInsert = TablesInsert<"menu_template_items">;
export type MenuTemplateItemUpdate = TablesUpdate<"menu_template_items">;

// Products & Recipes
export type Product = Tables<"product">;
export type ProductInsert = TablesInsert<"product">;
export type ProductUpdate = TablesUpdate<"product">;

export type ProductItem = Tables<"product_item">;
export type ProductItemInsert = TablesInsert<"product_item">;
export type ProductItemUpdate = TablesUpdate<"product_item">;

export type Recipe = Tables<"recipes">;
export type RecipeInsert = TablesInsert<"recipes">;
export type RecipeUpdate = TablesUpdate<"recipes">;

export type RecipeIngredient = Tables<"recipe_ingredients">;
export type RecipeIngredientInsert = TablesInsert<"recipe_ingredients">;
export type RecipeIngredientUpdate = TablesUpdate<"recipe_ingredients">;

export type RecipeIngredientAlternative =
	Tables<"recipe_ingredient_alternatives">;
export type RecipeIngredientAlternativeInsert =
	TablesInsert<"recipe_ingredient_alternatives">;
export type RecipeIngredientAlternativeUpdate =
	TablesUpdate<"recipe_ingredient_alternatives">;

// System
export type Changelog = Tables<"changelog">;
export type ChangelogInsert = TablesInsert<"changelog">;
export type ChangelogUpdate = TablesUpdate<"changelog">;

export type SuperAdminController = Tables<"super_admin_controller">;
export type SuperAdminControllerInsert = TablesInsert<"super_admin_controller">;
export type SuperAdminControllerUpdate = TablesUpdate<"super_admin_controller">;

export type Opinion = Tables<"opinions">;
export type OpinionInsert = TablesInsert<"opinions">;
export type OpinionUpdate = TablesUpdate<"opinions">;

export type Folder = Tables<"folder">;
export type FolderInsert = TablesInsert<"folder">;
export type FolderUpdate = TablesUpdate<"folder">;

// Views
export type MealPresenceWithUser = Views<"v_meal_presences_with_user">;
export type UserIdentity = Views<"v_user_identity">;

// Enums
export type KitchenType = Enums<"kitchen_type">;
export type UnitType = Enums<"unit_type">;

export * from "./domain/recipes";
