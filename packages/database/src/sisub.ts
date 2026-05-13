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

export type Ingredient = Tables<"ingredient">
export type IngredientInsert = TablesInsert<"ingredient">
export type IngredientUpdate = TablesUpdate<"ingredient">

export type IngredientItem = Tables<"ingredient_item">
export type IngredientItemInsert = TablesInsert<"ingredient_item">
export type IngredientItemUpdate = TablesUpdate<"ingredient_item">

export type Nutrient = Tables<"nutrient">
export type NutrientInsert = TablesInsert<"nutrient">
export type NutrientUpdate = TablesUpdate<"nutrient">

export type Ceafa = Tables<"ceafa">
export type CeafaInsert = TablesInsert<"ceafa">
export type CeafaUpdate = TablesUpdate<"ceafa">

export type IngredientNutrient = Tables<"ingredient_nutrient">
export type IngredientNutrientInsert = TablesInsert<"ingredient_nutrient">
export type IngredientNutrientUpdate = TablesUpdate<"ingredient_nutrient">

export type Recipe = Tables<"recipes">
export type RecipeInsert = TablesInsert<"recipes">
export type RecipeUpdate = TablesUpdate<"recipes">

export type RecipeIngredient = Tables<"recipe_ingredients">
export type RecipeIngredientInsert = TablesInsert<"recipe_ingredients">
export type RecipeIngredientUpdate = TablesUpdate<"recipe_ingredients">

export type RecipeIngredientAlternative = Tables<"recipe_ingredient_alternatives">
export type RecipeIngredientAlternativeInsert = TablesInsert<"recipe_ingredient_alternatives">
export type RecipeIngredientAlternativeUpdate = TablesUpdate<"recipe_ingredient_alternatives">

export type ProcurementList = Tables<"procurement_list">
export type ProcurementListInsert = TablesInsert<"procurement_list">
export type ProcurementListUpdate = TablesUpdate<"procurement_list">

export type ProcurementListKitchen = Tables<"procurement_list_kitchen">
export type ProcurementListKitchenInsert = TablesInsert<"procurement_list_kitchen">
export type ProcurementListKitchenUpdate = TablesUpdate<"procurement_list_kitchen">

export type ProcurementListSelection = Tables<"procurement_list_selection">
export type ProcurementListSelectionInsert = TablesInsert<"procurement_list_selection">
export type ProcurementListSelectionUpdate = TablesUpdate<"procurement_list_selection">

export type ProcurementListItem = Tables<"procurement_list_item">
export type ProcurementListItemInsert = TablesInsert<"procurement_list_item">
export type ProcurementListItemUpdate = TablesUpdate<"procurement_list_item">

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

export type ProductionTask = Tables<"production_task">
export type ProductionTaskInsert = TablesInsert<"production_task">
export type ProductionTaskUpdate = TablesUpdate<"production_task">

export type KitchenType = Enums<"kitchen_type">
export type UnitType = Enums<"unit_type">

export type PolicyRule = Tables<"policy_rule">
export type PolicyRuleInsert = TablesInsert<"policy_rule">
export type PolicyRuleUpdate = TablesUpdate<"policy_rule">

export type ProcurementArp = Tables<"procurement_arp">
export type ProcurementArpInsert = TablesInsert<"procurement_arp">
export type ProcurementArpUpdate = TablesUpdate<"procurement_arp">

export type ProcurementArpItem = Tables<"procurement_arp_item">
export type ProcurementArpItemInsert = TablesInsert<"procurement_arp_item">
export type ProcurementArpItemUpdate = TablesUpdate<"procurement_arp_item">

export type Empenho = Tables<"empenho">
export type EmpenhoInsert = TablesInsert<"empenho">
export type EmpenhoUpdate = TablesUpdate<"empenho">
