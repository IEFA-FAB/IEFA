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
	fetchMealTypes,
	GetTrashItemsSchema,
	getTrashItems,
	ListKitchensSchema,
	listKitchens,
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
import { AgentListRecipesSchema, agentFetchDayMenus, agentFetchMenus, agentListRecipes } from "@iefa/sisub-domain/agent"
import { resolveCredential } from "../auth.ts"
import { getDb } from "../db.ts"
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
			return toolResult(await listKitchens(getDb(), ctx))
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
			return toolResult(await fetchMealTypes(getDb(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// get_planning_calendar
// ---------------------------------------------------------------------------

/**
 * Projeção de agente, não a operation crua: cada `menu_items` carrega o snapshot json da ficha
 * técnica congelada, e a leitura relacional ainda embutia a receita atual completa ao lado. Um
 * dia com três refeições já estourava o teto de resultado; uma semana, uma ordem de grandeza.
 * Quem quer a ficha chama `get_recipe`.
 */
const getPlanningCalendar: ToolDefinition = {
	schema: {
		name: "get_planning_calendar",
		description:
			"Retorna o calendário de planejamento de cardápios de uma cozinha para um período: cada refeição do dia com os pratos, por nome, mais efetivo previsto e status. Para a ficha técnica de um prato, chame get_recipe.",
		inputSchema: toJsonSchema(DailyMenuFetchSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = DailyMenuFetchSchema.parse(args)
			return toolResult(await agentFetchMenus(getDb(), ctx, input))
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
			"Retorna as refeições de uma data específica para uma cozinha, com os pratos de cada uma pelo nome. Ideal para ver o dia antes de editar. Para a ficha técnica de um prato, chame get_recipe.",
		inputSchema: toJsonSchema(DayDetailsFetchSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = DayDetailsFetchSchema.parse(args)
			return toolResult(await agentFetchDayMenus(getDb(), ctx, input))
		} catch (e) {
			return handleToolError(e)
		}
	},
}

// ---------------------------------------------------------------------------
// list_recipes
// ---------------------------------------------------------------------------

/**
 * Listagem paginada e enxuta, vinda de `@iefa/sisub-domain/agent` — a mesma que o chat
 * dos módulos do sisub usa.
 *
 * A versão anterior devolvia `listRecipes` cru: as ~2.000 receitas com a ficha técnica
 * aninhada, 10,9 MB de JSON. Nenhum cliente MCP consegue colocar isso num prompt — o
 * provider recusa o turno. Quem quer a ficha chama `get_recipe`.
 */
const listRecipesTool: ToolDefinition = {
	schema: {
		name: "list_recipes",
		description:
			"Lista receitas disponíveis para uma cozinha, só com os campos de identificação (id, nome, versão, rendimento, pasta pelo nome). Retorna as globais (kitchen_id null) e, se kitchenId for informado, também as locais dessa cozinha. Suporta busca por nome via search e limite de itens via limit; o retorno traz total e returned. O id serve para as chamadas seguintes (get_recipe), não para exibir a quem lê — identifique cada receita pelo nome. Para ingredientes e modo de preparo, chame get_recipe.",
		inputSchema: toJsonSchema(AgentListRecipesSchema),
	},
	async handler(args, credential) {
		try {
			const ctx = await resolveCredential(credential)
			const input = AgentListRecipesSchema.parse(args ?? {})
			return toolResult(await agentListRecipes(getDb(), ctx, input))
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
			return toolResult(await upsertDailyMenu(getDb(), ctx, input))
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
			return toolResult(await updateHeadcount(getDb(), ctx, input))
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
			return toolResult(await addMenuItem(getDb(), ctx, input))
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
			await removeMenuItem(getDb(), ctx, input)
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
			await restoreMenuItem(getDb(), ctx, input)
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
			return toolResult(await updateMenuItem(getDb(), ctx, input))
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
			await updateSubstitutions(getDb(), ctx, input)
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
			return toolResult(await getTrashItems(getDb(), ctx, input))
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
