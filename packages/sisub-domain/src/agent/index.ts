/**
 * Superfície de leitura para agentes de IA — compartilhada pelo chat dos módulos do sisub
 * e pelo servidor MCP.
 *
 * Regra da casa: toda tool de listagem exposta a um modelo passa por aqui. Teto de itens,
 * projeção e orçamento de payload são decisões de uma linha só; duplicá-las por consumidor
 * foi o que deixou o chat com um `list_recipes` de 10,6 MB e o MCP com um de 10,9 MB.
 */

export {
	AGENT_LIST_DEFAULT,
	AGENT_LIST_MAX,
	clampLimit,
	enforcePayloadBudget,
	MAX_TOOL_RESULT_CHARS,
	PayloadTooLargeError,
} from "./budget.ts"
export type {
	AgentEquipmentCatalog,
	AgentEquipmentCatalogEntry,
	AgentEquipmentFitness,
	AgentEquipmentRequirement,
	AgentEquipmentUnit,
	AgentKitchenEquipment,
	AgentMenuEquipmentFitness,
} from "./equipment.ts"
export {
	agentCheckMenuEquipment,
	agentCheckRecipeEquipment,
	agentGetRecipeEquipment,
	agentListEquipmentCatalog,
	agentListKitchenEquipment,
} from "./equipment.ts"
export type { AgentDailyMenu, AgentMenuItem, AgentTemplateItem } from "./menus.ts"
export { agentFetchDayMenus, agentFetchMenus, agentGetTemplateItems } from "./menus.ts"
export { dropUnexpectedNulls } from "./model-input.ts"
export type { AgentIngredientSummary, AgentList, AgentRecipeDetail, AgentRecipeIngredient, AgentRecipeSummary } from "./reads.ts"
export { agentGetRecipe, agentListIngredients, agentListPreparations, agentListRecipes } from "./reads.ts"
export type {
	AgentCheckMenuEquipment,
	AgentCheckRecipeEquipment,
	AgentListEquipmentCatalog,
	AgentListIngredients,
	AgentListKitchenEquipment,
	AgentListPreparations,
	AgentListRecipes,
	AgentRecipeEquipment,
} from "./schemas.ts"
export {
	AgentCheckMenuEquipmentSchema,
	AgentCheckRecipeEquipmentSchema,
	AgentListEquipmentCatalogSchema,
	AgentListIngredientsSchema,
	AgentListKitchenEquipmentSchema,
	AgentListPreparationsSchema,
	AgentListRecipesSchema,
	AgentRecipeEquipmentSchema,
} from "./schemas.ts"
