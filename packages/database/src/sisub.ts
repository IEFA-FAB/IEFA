import type { Database } from "./generated.ts"

/**
 * O schema `sisub` foi dividido em schemas por domínio (core, access_control,
 * kitchen, procurement, finance, compras_gov_integration). Estes helpers de tipo
 * resolvem uma tabela/view/enum em QUALQUER um desses schemas — os nomes de
 * tabela são únicos no conjunto, então a interseção expõe todas as chaves sem
 * exigir que cada call site saiba o schema de origem. Mantém `Tables<"recipes">`
 * etc. funcionando após o split (a camada Drizzle já é a fonte de verdade das
 * queries; estes tipos descrevem apenas o contrato de linha snake_case).
 */
type DomainTables = Database["core"]["Tables"] &
	Database["access_control"]["Tables"] &
	Database["kitchen"]["Tables"] &
	Database["procurement"]["Tables"] &
	Database["finance"]["Tables"] &
	Database["compras_gov_integration"]["Tables"] &
	Database["sisub"]["Tables"]

type DomainViews = Database["core"]["Views"] &
	Database["access_control"]["Views"] &
	Database["kitchen"]["Views"] &
	Database["procurement"]["Views"] &
	Database["finance"]["Views"] &
	Database["compras_gov_integration"]["Views"] &
	Database["sisub"]["Views"]

type DomainEnums = Database["core"]["Enums"] &
	Database["access_control"]["Enums"] &
	Database["kitchen"]["Enums"] &
	Database["procurement"]["Enums"] &
	Database["finance"]["Enums"] &
	Database["compras_gov_integration"]["Enums"] &
	Database["sisub"]["Enums"]

export type Tables<T extends keyof DomainTables> = DomainTables[T]["Row"]
export type TablesInsert<T extends keyof DomainTables> = DomainTables[T]["Insert"]
export type TablesUpdate<T extends keyof DomainTables> = DomainTables[T]["Update"]
export type Views<T extends keyof DomainViews> = DomainViews[T]["Row"]
export type Enums<T extends keyof DomainEnums> = DomainEnums[T]

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

export type Rancho = Tables<"rancho">
export type RanchoInsert = TablesInsert<"rancho">
export type RanchoUpdate = TablesUpdate<"rancho">

export type WorkforceCategory = Tables<"workforce_category">
export type WorkforceCategoryInsert = TablesInsert<"workforce_category">

export type WorkforceSurvey = Tables<"workforce_survey">
export type WorkforceSurveyInsert = TablesInsert<"workforce_survey">

export type WorkforceSubmission = Tables<"workforce_submission">
export type WorkforceSubmissionInsert = TablesInsert<"workforce_submission">

export type WorkforceHeadcount = Tables<"workforce_headcount">
export type WorkforceHeadcountInsert = TablesInsert<"workforce_headcount">

export type WorkforceNote = Tables<"workforce_note">
export type WorkforceNoteInsert = TablesInsert<"workforce_note">

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

export type MenuTemplateMeal = Tables<"menu_template_meal">
export type MenuTemplateMealInsert = TablesInsert<"menu_template_meal">
export type MenuTemplateMealUpdate = TablesUpdate<"menu_template_meal">

export type MenuTemplateEventMeal = Tables<"menu_template_event_meal">

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

export type FrozenPreparation = Tables<"frozen_preparation">
export type FrozenPreparationInsert = TablesInsert<"frozen_preparation">
export type FrozenPreparationUpdate = TablesUpdate<"frozen_preparation">

export type Recipe = Tables<"recipes">
export type RecipeInsert = TablesInsert<"recipes">
export type RecipeUpdate = TablesUpdate<"recipes">

export type RecipeIngredient = Tables<"recipe_ingredients">
export type RecipeIngredientInsert = TablesInsert<"recipe_ingredients">
export type RecipeIngredientUpdate = TablesUpdate<"recipe_ingredients">

export type RecipeIngredientAlternative = Tables<"recipe_ingredient_alternatives">
export type RecipeIngredientAlternativeInsert = TablesInsert<"recipe_ingredient_alternatives">
export type RecipeIngredientAlternativeUpdate = TablesUpdate<"recipe_ingredient_alternatives">

export type QuantityEstimate = Tables<"quantity_estimate">
export type QuantityEstimateInsert = TablesInsert<"quantity_estimate">
export type QuantityEstimateUpdate = TablesUpdate<"quantity_estimate">

export type QuantityEstimateKitchen = Tables<"quantity_estimate_kitchen">
export type QuantityEstimateKitchenInsert = TablesInsert<"quantity_estimate_kitchen">
export type QuantityEstimateKitchenUpdate = TablesUpdate<"quantity_estimate_kitchen">

export type QuantityEstimateSelection = Tables<"quantity_estimate_selection">
export type QuantityEstimateSelectionInsert = TablesInsert<"quantity_estimate_selection">
export type QuantityEstimateSelectionUpdate = TablesUpdate<"quantity_estimate_selection">

export type QuantityEstimateItem = Tables<"quantity_estimate_item">
export type QuantityEstimateItemInsert = TablesInsert<"quantity_estimate_item">
export type QuantityEstimateItemUpdate = TablesUpdate<"quantity_estimate_item">

// Previsão de demanda da cozinha (glossário: `demand_forecast`).
export type DemandForecast = Tables<"kitchen_demand_forecast">
export type DemandForecastInsert = TablesInsert<"kitchen_demand_forecast">
export type DemandForecastUpdate = TablesUpdate<"kitchen_demand_forecast">

export type DemandForecastSelection = Tables<"kitchen_demand_forecast_selection">
export type DemandForecastSelectionInsert = TablesInsert<"kitchen_demand_forecast_selection">
export type DemandForecastSelectionUpdate = TablesUpdate<"kitchen_demand_forecast_selection">

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

/** Pasta de preparação — agrupamento plano (sem hierarquia), distinto de `Folder` (insumos). */
export type RecipeFolder = Tables<"recipe_folder">
export type RecipeFolderInsert = TablesInsert<"recipe_folder">
export type RecipeFolderUpdate = TablesUpdate<"recipe_folder">

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

export type Arp = Tables<"arp">
export type ArpInsert = TablesInsert<"arp">
export type ArpUpdate = TablesUpdate<"arp">

export type ArpItem = Tables<"arp_item">
export type ArpItemInsert = TablesInsert<"arp_item">
export type ArpItemUpdate = TablesUpdate<"arp_item">

export type Empenho = Tables<"empenho">
export type EmpenhoInsert = TablesInsert<"empenho">
export type EmpenhoUpdate = TablesUpdate<"empenho">

export type PurchaseItem = Tables<"purchase_item">
export type PurchaseItemInsert = TablesInsert<"purchase_item">
export type PurchaseItemUpdate = TablesUpdate<"purchase_item">

export type PurchaseItemIngredient = Tables<"purchase_item_ingredient">
export type PurchaseItemIngredientInsert = TablesInsert<"purchase_item_ingredient">
export type PurchaseItemIngredientUpdate = TablesUpdate<"purchase_item_ingredient">

// ── Recipe production flow (DAG estruturado do modo de preparo) ──

export type StepTemplate = Tables<"step_template">
export type StepTemplateInsert = TablesInsert<"step_template">
export type StepTemplateUpdate = TablesUpdate<"step_template">

export type Utensil = Tables<"utensil">
export type UtensilInsert = TablesInsert<"utensil">
export type UtensilUpdate = TablesUpdate<"utensil">

export type StepTemplateUtensil = Tables<"step_template_utensil">
export type StepTemplateUtensilInsert = TablesInsert<"step_template_utensil">
export type StepTemplateUtensilUpdate = TablesUpdate<"step_template_utensil">

export type RecipeStep = Tables<"recipe_step">
export type RecipeStepInsert = TablesInsert<"recipe_step">
export type RecipeStepUpdate = TablesUpdate<"recipe_step">

export type RecipeStepOutput = Tables<"recipe_step_output">
export type RecipeStepOutputInsert = TablesInsert<"recipe_step_output">
export type RecipeStepOutputUpdate = TablesUpdate<"recipe_step_output">

export type RecipeStepInput = Tables<"recipe_step_input">
export type RecipeStepInputInsert = TablesInsert<"recipe_step_input">
export type RecipeStepInputUpdate = TablesUpdate<"recipe_step_input">

export type RecipeStepUtensil = Tables<"recipe_step_utensil">
export type RecipeStepUtensilInsert = TablesInsert<"recipe_step_utensil">
export type RecipeStepUtensilUpdate = TablesUpdate<"recipe_step_utensil">

// ── Equipamentos de cozinha (papel × modelo × unidade × exigência) ──

export type EquipmentRole = Tables<"equipment_role">
export type EquipmentRoleInsert = TablesInsert<"equipment_role">
export type EquipmentRoleUpdate = TablesUpdate<"equipment_role">

export type EquipmentModel = Tables<"equipment_model">
export type EquipmentModelInsert = TablesInsert<"equipment_model">
export type EquipmentModelUpdate = TablesUpdate<"equipment_model">

export type EquipmentModelRole = Tables<"equipment_model_role">
export type EquipmentModelRoleInsert = TablesInsert<"equipment_model_role">
export type EquipmentModelRoleUpdate = TablesUpdate<"equipment_model_role">

export type EquipmentUnit = Tables<"equipment_unit">
export type EquipmentUnitInsert = TablesInsert<"equipment_unit">
export type EquipmentUnitUpdate = TablesUpdate<"equipment_unit">

export type EquipmentUnitRole = Tables<"equipment_unit_role">
export type EquipmentUnitRoleInsert = TablesInsert<"equipment_unit_role">
export type EquipmentUnitRoleUpdate = TablesUpdate<"equipment_unit_role">

export type EquipmentIssue = Tables<"equipment_issue">
export type EquipmentIssueInsert = TablesInsert<"equipment_issue">
export type EquipmentIssueUpdate = TablesUpdate<"equipment_issue">

export type EquipmentMaintenancePlan = Tables<"equipment_maintenance_plan">
export type EquipmentMaintenancePlanInsert = TablesInsert<"equipment_maintenance_plan">
export type EquipmentMaintenancePlanUpdate = TablesUpdate<"equipment_maintenance_plan">

export type EquipmentMaintenanceLog = Tables<"equipment_maintenance_log">
export type EquipmentMaintenanceLogInsert = TablesInsert<"equipment_maintenance_log">
export type EquipmentMaintenanceLogUpdate = TablesUpdate<"equipment_maintenance_log">

export type RecipeEquipmentRequirement = Tables<"recipe_equipment_requirement">
export type RecipeEquipmentRequirementInsert = TablesInsert<"recipe_equipment_requirement">
export type RecipeEquipmentRequirementUpdate = TablesUpdate<"recipe_equipment_requirement">
