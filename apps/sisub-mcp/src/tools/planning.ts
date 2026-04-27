/**
 * Tools MCP — Módulo Kitchen Planning (cardápios diários)
 * Thin wrappers delegating to @iefa/sisub-domain operations.
 */

import {
	AddMenuItemSchema,
	addMenuItem,
	DailyMenuFetchSchema,
	DayDetailsFetchSchema,
	FetchMealTypesSchema,
	fetchDailyMenus,
	fetchDayDetails,
	fetchMealTypes,
	GetTrashItemsSchema,
	getTrashItems,
	ListKitchensSchema,
	ListRecipesSchema,
	listKitchens,
	listRecipes,
	RemoveMenuItemSchema,
	RestoreMenuItemSchema,
	removeMenuItem,
	restoreMenuItem,
	toJsonSchema,
	UpdateHeadcountSchema,
	UpdateMenuItemSchema,
	UpdateSubstitutionsSchema,
	UpsertDailyMenuSchema,
	updateHeadcount,
	updateMenuItem,
	updateSubstitutions,
	upsertDailyMenu,
} from "@iefa/sisub-domain"
import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import { handleToolError } from "../utils/error-handler.ts"
import type { ToolDefinition } from "./shared.ts"
import { toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// list_kitchens
// ---------------------------------------------------------------------------

const listKitchensTool: ToolDefinition = {
	schema: {
		name: "list_kitchens",
		description: "Lista todas as cozinhas disponíveis no sistema. Retorna id, display_name, tipo e unidade de cada cozinha. Requer permissão kitchen nível 1.",
		inputSchema: toJsonSchema(ListKitchensSchema),
	},
	async handler(_args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			return toolResult(await listKitchens(getDataClient(), ctx))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_meal_types
// ---------------------------------------------------------------------------

const getMealTypes: ToolDefinition = {
	schema: {
		name: "get_meal_types",
		description:
			"Lista todos os tipos de refeição disponíveis (desjejum, almoço, jantar, etc.). Retorna id e nome de cada tipo. Use o id em outras tools que recebem mealTypeId.",
		inputSchema: toJsonSchema(FetchMealTypesSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = FetchMealTypesSchema.parse(args ?? {})
			return toolResult(await fetchMealTypes(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_planning_calendar
// ---------------------------------------------------------------------------

const getPlanningCalendar: ToolDefinition = {
	schema: {
		name: "get_planning_calendar",
		description:
			"Retorna o calendário de planejamento de cardápios de uma cozinha para um período. Inclui todos os menus diários com seus itens (receitas). Use para ter uma visão completa do planejamento mensal ou semanal.",
		inputSchema: toJsonSchema(DailyMenuFetchSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = DailyMenuFetchSchema.parse(args)
			return toolResult(await fetchDailyMenus(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_day_details
// ---------------------------------------------------------------------------

const getDayDetails: ToolDefinition = {
	schema: {
		name: "get_day_details",
		description:
			"Retorna todos os menus de uma data específica para uma cozinha, com todos os itens (receitas) de cada refeição. Ideal para ver o detalhe completo de um dia antes de editar.",
		inputSchema: toJsonSchema(DayDetailsFetchSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = DayDetailsFetchSchema.parse(args)
			return toolResult(await fetchDayDetails(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// list_recipes
// ---------------------------------------------------------------------------

const listRecipesTool: ToolDefinition = {
	schema: {
		name: "list_recipes",
		description:
			"Lista receitas disponíveis para uma cozinha. Retorna receitas globais (kitchen_id null) e, se kitchenId fornecido, também as locais dessa cozinha. Suporta busca por nome via parâmetro search.",
		inputSchema: toJsonSchema(ListRecipesSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = ListRecipesSchema.parse(args ?? {})
			return toolResult(await listRecipes(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// create_daily_menu
// ---------------------------------------------------------------------------

const createDailyMenu: ToolDefinition = {
	schema: {
		name: "create_daily_menu",
		description:
			"Cria um novo menu diário (entrada no calendário) para uma cozinha em uma data e tipo de refeição específicos. Usa upsert: se já existir um menu para (serviceDate, mealTypeId, kitchenId), ignora o conflito. Retorna o menu criado.",
		inputSchema: toJsonSchema(UpsertDailyMenuSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = UpsertDailyMenuSchema.parse(args)
			return toolResult(await upsertDailyMenu(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// update_menu_headcount
// ---------------------------------------------------------------------------

const updateMenuHeadcount: ToolDefinition = {
	schema: {
		name: "update_menu_headcount",
		description: "Atualiza o número previsto de comensais (forecastedHeadcount) de um menu diário existente.",
		inputSchema: toJsonSchema(UpdateHeadcountSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = UpdateHeadcountSchema.parse(args)
			return toolResult(await updateHeadcount(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// add_menu_item
// ---------------------------------------------------------------------------

const addMenuItemTool: ToolDefinition = {
	schema: {
		name: "add_menu_item",
		description:
			"Adiciona uma receita a um menu diário existente. A receita é buscada com todos seus ingredientes e inserida como snapshot JSON — esse snapshot preserva o estado atual da receita independente de versões futuras. A receita deve pertencer à cozinha do menu ou ser global.",
		inputSchema: toJsonSchema(AddMenuItemSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = AddMenuItemSchema.parse(args)
			return toolResult(await addMenuItem(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// remove_menu_item
// ---------------------------------------------------------------------------

const removeMenuItemTool: ToolDefinition = {
	schema: {
		name: "remove_menu_item",
		description:
			"Remove (soft delete) um item de um menu diário. O item não é excluído permanentemente — pode ser restaurado com restore_menu_item. Use get_day_details para obter os IDs dos itens.",
		inputSchema: toJsonSchema(RemoveMenuItemSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = RemoveMenuItemSchema.parse(args)
			await removeMenuItem(getDataClient(), ctx, input)
			return toolResult({ success: true, menuItemId: input.menuItemId, message: "Item removido (pode ser restaurado com restore_menu_item)" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// restore_menu_item
// ---------------------------------------------------------------------------

const restoreMenuItemTool: ToolDefinition = {
	schema: {
		name: "restore_menu_item",
		description: "Restaura um item de menu previamente removido via remove_menu_item. Limpa o deleted_at, tornando o item visível novamente.",
		inputSchema: toJsonSchema(RestoreMenuItemSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = RestoreMenuItemSchema.parse(args)
			await restoreMenuItem(getDataClient(), ctx, input)
			return toolResult({ success: true, menuItemId: input.menuItemId, message: "Item restaurado com sucesso" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// update_menu_item
// ---------------------------------------------------------------------------

const updateMenuItemTool: ToolDefinition = {
	schema: {
		name: "update_menu_item",
		description: "Atualiza plannedPortionQuantity e/ou excludedFromProcurement de um item de menu. Requer permissão kitchen nível 2 na cozinha do menu.",
		inputSchema: toJsonSchema(UpdateMenuItemSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = UpdateMenuItemSchema.parse(args)
			return toolResult(await updateMenuItem(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// update_substitutions
// ---------------------------------------------------------------------------

const updateSubstitutionsTool: ToolDefinition = {
	schema: {
		name: "update_substitutions",
		description:
			"Substitui completamente o mapa de substituições de ingredientes de um item de menu (sobrescreve — não é merge). Formato: { [ingredientId]: { type, rationale, updated_at } }. Requer permissão kitchen nível 2.",
		inputSchema: toJsonSchema(UpdateSubstitutionsSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = UpdateSubstitutionsSchema.parse(args)
			await updateSubstitutions(getDataClient(), ctx, input)
			return toolResult({ success: true, menuItemId: input.menuItemId, message: "Substituições atualizadas com sucesso" })
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_trash_items
// ---------------------------------------------------------------------------

const getTrashItemsTool: ToolDefinition = {
	schema: {
		name: "get_trash_items",
		description:
			"Lista todos os itens de menu removidos (soft-deleted) de uma cozinha, com receita e menu diário de origem. Ordenados por data de remoção (mais recente primeiro). Use restore_menu_item para recuperar.",
		inputSchema: toJsonSchema(GetTrashItemsSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = GetTrashItemsSchema.parse(args)
			return toolResult(await getTrashItems(getDataClient(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const planningTools: ToolDefinition[] = [
	listKitchensTool,
	getMealTypes,
	getPlanningCalendar,
	getDayDetails,
	listRecipesTool,
	createDailyMenu,
	updateMenuHeadcount,
	addMenuItemTool,
	removeMenuItemTool,
	restoreMenuItemTool,
	updateMenuItemTool,
	updateSubstitutionsTool,
	getTrashItemsTool,
]
