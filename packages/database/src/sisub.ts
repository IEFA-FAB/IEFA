import type { Database } from "./generated.ts"

type SisubSchema = Database["sisub"]

export type Tables<T extends keyof SisubSchema["Tables"]> = SisubSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof SisubSchema["Tables"]> = SisubSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof SisubSchema["Tables"]> = SisubSchema["Tables"][T]["Update"]
export type Views<T extends keyof SisubSchema["Views"]> = SisubSchema["Views"][T]["Row"]
export type Enums<T extends keyof SisubSchema["Enums"]> = SisubSchema["Enums"][T]

export type ProfileAdmin = Tables<"profiles_admin">
export type ProfileAdminInsert = TablesInsert<"profiles_admin">
export type ProfileAdminUpdate = TablesUpdate<"profiles_admin">

export type UserData = Tables<"user_data">
export type UserDataInsert = TablesInsert<"user_data">
export type UserDataUpdate = TablesUpdate<"user_data">

export type UserMilitaryData = Tables<"user_military_data">
export type UserMilitaryDataInsert = TablesInsert<"user_military_data">
export type UserMilitaryDataUpdate = TablesUpdate<"user_military_data">

export type MealForecast = Tables<"meal_forecasts">
export type MealForecastInsert = TablesInsert<"meal_forecasts">
export type MealForecastUpdate = TablesUpdate<"meal_forecasts">

export type MealPresence = Tables<"meal_presences">
export type MealPresenceInsert = TablesInsert<"meal_presences">
export type MealPresenceUpdate = TablesUpdate<"meal_presences">

export type OtherPresence = Tables<"other_presences">
export type OtherPresenceInsert = TablesInsert<"other_presences">
export type OtherPresenceUpdate = TablesUpdate<"other_presences">

export type MessHall = Tables<"mess_halls">
export type MessHallInsert = TablesInsert<"mess_halls">
export type MessHallUpdate = TablesUpdate<"mess_halls">

export type Kitchen = Tables<"kitchen">
export type KitchenInsert = TablesInsert<"kitchen">
export type KitchenUpdate = TablesUpdate<"kitchen">

export type Unit = Tables<"units">
export type UnitInsert = TablesInsert<"units">
export type UnitUpdate = TablesUpdate<"units">

export type DailyMenu = Tables<"daily_menu">
export type DailyMenuInsert = TablesInsert<"daily_menu">
export type DailyMenuUpdate = TablesUpdate<"daily_menu">

export type MealType = Tables<"meal_type">
export type MealTypeInsert = TablesInsert<"meal_type">
export type MealTypeUpdate = TablesUpdate<"meal_type">

export type MenuItem = Tables<"menu_items">
export type MenuItemInsert = TablesInsert<"menu_items">
export type MenuItemUpdate = TablesUpdate<"menu_items">

export type MenuTemplate = Tables<"menu_template">
export type MenuTemplateInsert = TablesInsert<"menu_template">
export type MenuTemplateUpdate = TablesUpdate<"menu_template">

export type MenuTemplateItem = Tables<"menu_template_items">
export type MenuTemplateItemInsert = TablesInsert<"menu_template_items">
export type MenuTemplateItemUpdate = TablesUpdate<"menu_template_items">

export type Product = Tables<"product">
export type ProductInsert = TablesInsert<"product">
export type ProductUpdate = TablesUpdate<"product">

export type ProductItem = Tables<"product_item">
export type ProductItemInsert = TablesInsert<"product_item">
export type ProductItemUpdate = TablesUpdate<"product_item">

export type Nutrient = Tables<"nutrient">
export type NutrientInsert = TablesInsert<"nutrient">
export type NutrientUpdate = TablesUpdate<"nutrient">

export type Ceafa = Tables<"ceafa">
export type CeafaInsert = TablesInsert<"ceafa">
export type CeafaUpdate = TablesUpdate<"ceafa">

export type ProductNutrient = Tables<"product_nutrient">
export type ProductNutrientInsert = TablesInsert<"product_nutrient">
export type ProductNutrientUpdate = TablesUpdate<"product_nutrient">

export type Recipe = Tables<"recipes">
export type RecipeInsert = TablesInsert<"recipes">
export type RecipeUpdate = TablesUpdate<"recipes">

export type RecipeIngredient = Tables<"recipe_ingredients">
export type RecipeIngredientInsert = TablesInsert<"recipe_ingredients">
export type RecipeIngredientUpdate = TablesUpdate<"recipe_ingredients">

export type RecipeIngredientAlternative = Tables<"recipe_ingredient_alternatives">
export type RecipeIngredientAlternativeInsert = TablesInsert<"recipe_ingredient_alternatives">
export type RecipeIngredientAlternativeUpdate = TablesUpdate<"recipe_ingredient_alternatives">

export type ProcurementAta = Tables<"procurement_ata">
export type ProcurementAtaInsert = TablesInsert<"procurement_ata">
export type ProcurementAtaUpdate = TablesUpdate<"procurement_ata">

export type ProcurementAtaKitchen = Tables<"procurement_ata_kitchen">
export type ProcurementAtaKitchenInsert = TablesInsert<"procurement_ata_kitchen">
export type ProcurementAtaKitchenUpdate = TablesUpdate<"procurement_ata_kitchen">

export type ProcurementAtaSelection = Tables<"procurement_ata_selection">
export type ProcurementAtaSelectionInsert = TablesInsert<"procurement_ata_selection">
export type ProcurementAtaSelectionUpdate = TablesUpdate<"procurement_ata_selection">

export type ProcurementAtaItem = Tables<"procurement_ata_item">
export type ProcurementAtaItemInsert = TablesInsert<"procurement_ata_item">
export type ProcurementAtaItemUpdate = TablesUpdate<"procurement_ata_item">

export type KitchenAtaDraft = Tables<"kitchen_ata_draft">
export type KitchenAtaDraftInsert = TablesInsert<"kitchen_ata_draft">
export type KitchenAtaDraftUpdate = TablesUpdate<"kitchen_ata_draft">

export type KitchenAtaDraftSelection = Tables<"kitchen_ata_draft_selection">
export type KitchenAtaDraftSelectionInsert = TablesInsert<"kitchen_ata_draft_selection">
export type KitchenAtaDraftSelectionUpdate = TablesUpdate<"kitchen_ata_draft_selection">

export type Changelog = Tables<"changelog">
export type ChangelogInsert = TablesInsert<"changelog">
export type ChangelogUpdate = TablesUpdate<"changelog">

export type SuperAdminController = Tables<"super_admin_controller">
export type SuperAdminControllerInsert = TablesInsert<"super_admin_controller">
export type SuperAdminControllerUpdate = TablesUpdate<"super_admin_controller">

export type Opinion = Tables<"opinions">
export type OpinionInsert = TablesInsert<"opinions">
export type OpinionUpdate = TablesUpdate<"opinions">

export type Folder = Tables<"folder">
export type FolderInsert = TablesInsert<"folder">
export type FolderUpdate = TablesUpdate<"folder">

export type MealPresenceWithUser = Views<"v_meal_presences_with_user">
export type UserIdentity = Views<"v_user_identity">

export type KitchenType = Enums<"kitchen_type">
export type UnitType = Enums<"unit_type">
