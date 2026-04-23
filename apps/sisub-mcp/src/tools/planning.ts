/**
 * Tools MCP — Módulo Kitchen Planning (cardápios diários)
 *
 * Correções de segurança aplicadas:
 *   C3 — list_kitchens exige kitchen level 1 (não é mais pública)
 *   H1 — get_meal_types verifica scope quando kitchenId fornecido
 *   H3 — safeInt() antes de toda interpolação em filtros Supabase
 *   M3 — sanitizeDbError() em todos os erros de banco
 *   M4 — requireValidDates() antes de usar datas em queries
 *   +   — add_menu_item verifica que a receita pertence à cozinha (ou é global)
 */

import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import type { ToolDefinition } from "./shared.ts"
import { requireKitchenPermission, requireValidDates, safeInt, safePositiveNumber, sanitizeDbError, toolError, toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// Helpers de query
// ---------------------------------------------------------------------------

const dailyMenuSelect = `
  *,
  meal_type:meal_type_id(*),
  menu_items:menu_items(
    *,
    recipe_origin:recipe_origin_id(*)
  )
` as const

// ---------------------------------------------------------------------------
// list_kitchens  [C3 FIXADO: exige kitchen level 1]
// ---------------------------------------------------------------------------

const listKitchens: ToolDefinition = {
	schema: {
		name: "list_kitchens",
		description: "Lista todas as cozinhas disponíveis no sistema. Retorna id, display_name, tipo e unidade de cada cozinha. Requer permissão kitchen nível 1.",
		inputSchema: {
			type: "object",
			properties: {},
			required: [],
		},
	},
	async handler(_args, credential) {
		const ctx = await resolveCredential(credential)
		// C3: exige pelo menos kitchen level 1 (qualquer escopo) — impede que
		// usuários com apenas permissão "diner" enumerem todas as cozinhas.
		requireKitchenPermission(ctx, 1)

		const db = getDataClient()
		const { data, error } = await db.from("kitchen").select(`*, unit:units!kitchen_unit_id_fkey(id, name)`).order("id")

		if (error) return toolError(sanitizeDbError(error, "list_kitchens"))
		return toolResult(data ?? [])
	},
}

// ---------------------------------------------------------------------------
// get_meal_types  [H1 FIXADO: scope check quando kitchenId fornecido]
// ---------------------------------------------------------------------------

const getMealTypes: ToolDefinition = {
	schema: {
		name: "get_meal_types",
		description:
			"Lista todos os tipos de refeição disponíveis (desjejum, almoço, jantar, etc.). Retorna id e nome de cada tipo. Use o id em outras tools que recebem mealTypeId.",
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: {
					type: "number",
					description:
						"ID da cozinha. Se fornecido, retorna tipos globais e tipos específicos desta cozinha (requer permissão para ela). Se omitido, retorna apenas tipos globais.",
				},
			},
			required: [],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		// H1: quando kitchenId é fornecido, verificar que o usuário tem permissão
		// especificamente para aquela cozinha — não basta ter qualquer permissão kitchen.
		if (args?.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId")
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })

			const db = getDataClient()
			const { data, error } = await db.from("meal_type").select("*").is("deleted_at", null).order("sort_order").or(`kitchen_id.is.null,kitchen_id.eq.${id}`) // H3: id já é safeInt

			if (error) return toolError(sanitizeDbError(error, "get_meal_types"))
			return toolResult(data ?? [])
		}

		// Sem kitchenId: retorna apenas tipos globais — nenhuma permissão específica exigida
		// além de estar autenticado (resolveUserContext já garantiu isso)
		const db = getDataClient()
		const { data, error } = await db.from("meal_type").select("*").is("deleted_at", null).is("kitchen_id", null).order("sort_order")

		if (error) return toolError(sanitizeDbError(error, "get_meal_types"))
		return toolResult(data ?? [])
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
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: { type: "number", description: "ID da cozinha" },
				startDate: { type: "string", description: "Data de início no formato YYYY-MM-DD (ex: 2026-04-01)" },
				endDate: { type: "string", description: "Data de fim no formato YYYY-MM-DD (ex: 2026-04-30)" },
			},
			required: ["kitchenId", "startDate", "endDate"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		const id = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 1, { type: "kitchen", id })

		// M4: validar datas antes de usar em query
		requireValidDates(args.startDate, args.endDate)

		const db = getDataClient()
		const { data, error } = await db
			.from("daily_menu")
			.select(dailyMenuSelect)
			.eq("kitchen_id", id)
			.gte("service_date", args.startDate)
			.lte("service_date", args.endDate)
			.is("deleted_at", null)
			.order("service_date")
			.order("meal_type_id")

		if (error) return toolError(sanitizeDbError(error, "get_planning_calendar"))

		const menus = (data ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items ?? []).filter((item: { deleted_at: string | null }) => !item.deleted_at),
		}))

		return toolResult(menus)
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
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: { type: "number", description: "ID da cozinha" },
				date: { type: "string", description: "Data no formato YYYY-MM-DD (ex: 2026-04-10)" },
			},
			required: ["kitchenId", "date"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		const id = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 1, { type: "kitchen", id })

		// M4: validar data
		requireValidDates(args.date)

		const db = getDataClient()
		const { data, error } = await db.from("daily_menu").select(dailyMenuSelect).eq("kitchen_id", id).eq("service_date", args.date).is("deleted_at", null)

		if (error) return toolError(sanitizeDbError(error, "get_day_details"))

		const menus = (data ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items ?? []).filter((item: { deleted_at: string | null }) => !item.deleted_at),
		}))

		return toolResult(menus)
	},
}

// ---------------------------------------------------------------------------
// list_recipes
// ---------------------------------------------------------------------------

const listRecipes: ToolDefinition = {
	schema: {
		name: "list_recipes",
		description:
			"Lista receitas disponíveis para uma cozinha. Retorna receitas globais (kitchen_id null) e, se kitchenId fornecido, também as locais dessa cozinha. Suporta busca por nome via parâmetro search.",
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: {
					type: "number",
					description: "ID da cozinha. Se omitido, retorna apenas receitas globais.",
				},
				search: {
					type: "string",
					description: "Filtro de busca por nome da receita (parcial, case-insensitive).",
				},
			},
			required: [],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		const db = getDataClient()
		let query = db.from("recipes").select(`*, ingredients:recipe_ingredients(*, product:product_id(*))`).is("deleted_at", null).order("name")

		if (args?.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId") // H3: safeInt antes da interpolação
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
		} else {
			// Sem kitchenId: apenas receitas globais — qualquer kitchen level 1 suficiente
			requireKitchenPermission(ctx, 1)
			query = query.is("kitchen_id", null)
		}

		if (args?.search) {
			// Sanitização básica: limitar tamanho do search para evitar abuso
			const search = String(args.search).slice(0, 200)
			query = query.ilike("name", `%${search}%`)
		}

		const { data, error } = await query
		if (error) return toolError(sanitizeDbError(error, "list_recipes"))
		return toolResult(data ?? [])
	},
}

// ---------------------------------------------------------------------------
// create_daily_menu
// ---------------------------------------------------------------------------

const createDailyMenu: ToolDefinition = {
	schema: {
		name: "create_daily_menu",
		description:
			"Cria um novo menu diário (entrada no calendário) para uma cozinha em uma data e tipo de refeição específicos. Usa upsert: se já existir um menu para (data, mealTypeId, kitchenId), ignora o conflito. Retorna o menu criado.",
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: { type: "number", description: "ID da cozinha" },
				date: { type: "string", description: "Data no formato YYYY-MM-DD" },
				mealTypeId: { type: "string", description: "ID do tipo de refeição (obtenha via get_meal_types)" },
				forecastedHeadcount: {
					type: "number",
					description: "Número previsto de comensais (opcional)",
				},
			},
			required: ["kitchenId", "date", "mealTypeId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		const id = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 2, { type: "kitchen", id })

		// M4: validar data
		requireValidDates(args.date)

		if (typeof args.mealTypeId !== "string" || !args.mealTypeId.trim()) {
			return toolError("mealTypeId é obrigatório e deve ser uma string não vazia")
		}

		const db = getDataClient()
		const { data, error } = await db
			.from("daily_menu")
			.upsert(
				{
					kitchen_id: id,
					service_date: args.date,
					meal_type_id: String(args.mealTypeId).trim(),
					status: "PLANNED",
					...(args.forecastedHeadcount != null && {
						forecasted_headcount: safeInt(args.forecastedHeadcount, "forecastedHeadcount"),
					}),
				},
				{ onConflict: "service_date,meal_type_id,kitchen_id", ignoreDuplicates: true }
			)
			.select()

		if (error) return toolError(sanitizeDbError(error, "create_daily_menu"))
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// update_menu_headcount
// ---------------------------------------------------------------------------

const updateMenuHeadcount: ToolDefinition = {
	schema: {
		name: "update_menu_headcount",
		description: "Atualiza o número previsto de comensais (forecasted_headcount) de um menu diário existente.",
		inputSchema: {
			type: "object",
			properties: {
				menuId: { type: "string", description: "ID (UUID) do menu diário" },
				forecastedHeadcount: { type: "number", description: "Novo número de comensais previstos" },
			},
			required: ["menuId", "forecastedHeadcount"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.menuId !== "string" || !args.menuId.trim()) {
			return toolError("menuId é obrigatório e deve ser uma string (UUID)")
		}

		const headcount = safeInt(args.forecastedHeadcount, "forecastedHeadcount")
		const db = getDataClient()

		// Busca o menu para obter o kitchenId e verificar permissão de escopo
		const { data: menu, error: fetchError } = await db.from("daily_menu").select("kitchen_id").eq("id", String(args.menuId).trim()).single()

		if (fetchError || !menu) return toolError("Menu não encontrado")
		if (menu.kitchen_id == null) return toolError("Menu sem cozinha associada")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: menu.kitchen_id })

		const { data, error } = await db.from("daily_menu").update({ forecasted_headcount: headcount }).eq("id", String(args.menuId).trim()).select()

		if (error) return toolError(sanitizeDbError(error, "update_menu_headcount"))
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// add_menu_item  [+ verificação de acesso à receita]
// ---------------------------------------------------------------------------

const addMenuItem: ToolDefinition = {
	schema: {
		name: "add_menu_item",
		description:
			"Adiciona uma receita a um menu diário existente. A receita é buscada com todos seus ingredientes e inserida como snapshot JSON — esse snapshot preserva o estado atual da receita independente de versões futuras. A receita deve pertencer à cozinha do menu ou ser global.",
		inputSchema: {
			type: "object",
			properties: {
				dailyMenuId: { type: "string", description: "ID (UUID) do menu diário de destino" },
				recipeId: { type: "string", description: "ID (UUID) da receita a adicionar" },
			},
			required: ["dailyMenuId", "recipeId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.dailyMenuId !== "string" || !args.dailyMenuId.trim()) {
			return toolError("dailyMenuId é obrigatório e deve ser uma string (UUID)")
		}
		if (typeof args.recipeId !== "string" || !args.recipeId.trim()) {
			return toolError("recipeId é obrigatório e deve ser uma string (UUID)")
		}

		const menuId = String(args.dailyMenuId).trim()
		const recipeId = String(args.recipeId).trim()
		const db = getDataClient()

		// 1. Verificar permissão: buscar kitchenId do menu
		const { data: menu, error: menuError } = await db.from("daily_menu").select("kitchen_id").eq("id", menuId).single()

		if (menuError || !menu) return toolError("Menu diário não encontrado")
		if (menu.kitchen_id == null) return toolError("Menu sem cozinha associada")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: menu.kitchen_id })

		// 2. Buscar a receita completa com ingredientes para gerar o snapshot
		const { data: recipe, error: recipeError } = await db
			.from("recipes")
			.select(`*, ingredients:recipe_ingredients(*, product:product_id(*))`)
			.eq("id", recipeId)
			.is("deleted_at", null)
			.single()

		if (recipeError || !recipe) return toolError("Receita não encontrada")

		// Verificação de acesso à receita: deve ser global (kitchen_id null) ou
		// pertencer à mesma cozinha do menu — evita referenciar receitas de outras cozinhas.
		if (recipe.kitchen_id !== null && recipe.kitchen_id !== menu.kitchen_id) {
			return toolError("Esta receita não está disponível para esta cozinha")
		}

		// 3. Inserir item com o snapshot da receita
		const { data, error } = await db
			.from("menu_items")
			.insert({
				daily_menu_id: menuId,
				recipe_origin_id: recipeId,
				recipe: recipe, // snapshot JSON completo
			})
			.select()

		if (error) return toolError(sanitizeDbError(error, "add_menu_item"))
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// remove_menu_item
// ---------------------------------------------------------------------------

const removeMenuItem: ToolDefinition = {
	schema: {
		name: "remove_menu_item",
		description:
			"Remove (soft delete) um item de um menu diário. O item não é excluído permanentemente — pode ser restaurado com restore_menu_item. Use get_day_details para obter os IDs dos itens.",
		inputSchema: {
			type: "object",
			properties: {
				itemId: { type: "string", description: "ID (UUID) do item de menu a remover" },
			},
			required: ["itemId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.itemId !== "string" || !args.itemId.trim()) {
			return toolError("itemId é obrigatório e deve ser uma string (UUID)")
		}

		const itemId = String(args.itemId).trim()
		const db = getDataClient()

		const { data: item, error: fetchError } = await db.from("menu_items").select(`id, daily_menu:daily_menu_id(kitchen_id)`).eq("id", itemId).single()

		if (fetchError || !item) return toolError("Item de menu não encontrado")

		const kitchenId = item.daily_menu?.kitchen_id
		if (kitchenId == null) return toolError("Não foi possível determinar a cozinha do item")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		const { error } = await db.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", itemId)

		if (error) return toolError(sanitizeDbError(error, "remove_menu_item"))
		return toolResult({ success: true, itemId, message: "Item removido (pode ser restaurado com restore_menu_item)" })
	},
}

// ---------------------------------------------------------------------------
// restore_menu_item
// ---------------------------------------------------------------------------

const restoreMenuItem: ToolDefinition = {
	schema: {
		name: "restore_menu_item",
		description: "Restaura um item de menu previamente removido via remove_menu_item. Limpa o deleted_at, tornando o item visível novamente.",
		inputSchema: {
			type: "object",
			properties: {
				itemId: { type: "string", description: "ID (UUID) do item de menu a restaurar" },
			},
			required: ["itemId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.itemId !== "string" || !args.itemId.trim()) {
			return toolError("itemId é obrigatório e deve ser uma string (UUID)")
		}

		const itemId = String(args.itemId).trim()
		const db = getDataClient()

		const { data: item, error: fetchError } = await db.from("menu_items").select(`id, daily_menu:daily_menu_id(kitchen_id)`).eq("id", itemId).single()

		if (fetchError || !item) return toolError("Item de menu não encontrado")

		const kitchenId = item.daily_menu?.kitchen_id
		if (kitchenId == null) return toolError("Não foi possível determinar a cozinha do item")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		const { error } = await db.from("menu_items").update({ deleted_at: null }).eq("id", itemId)

		if (error) return toolError(sanitizeDbError(error, "restore_menu_item"))
		return toolResult({ success: true, itemId, message: "Item restaurado com sucesso" })
	},
}

// ---------------------------------------------------------------------------
// update_menu_item
// ---------------------------------------------------------------------------

const updateMenuItem: ToolDefinition = {
	schema: {
		name: "update_menu_item",
		description: "Atualiza planned_portion_quantity e/ou excluded_from_procurement de um item de menu. Requer permissão kitchen nível 2 na cozinha do menu.",
		inputSchema: {
			type: "object",
			properties: {
				itemId: { type: "string", description: "ID (UUID) do item de menu" },
				plannedPortionQuantity: {
					type: "number",
					description: "Quantidade planejada de porções (número positivo, aceita decimais)",
				},
				excludedFromProcurement: {
					type: "number",
					description: "0 = incluído no procurement, 1 = excluído",
				},
			},
			required: ["itemId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.itemId !== "string" || !args.itemId.trim()) {
			return toolError("itemId é obrigatório e deve ser uma string (UUID)")
		}

		const itemId = String(args.itemId).trim()
		const db = getDataClient()

		// Buscar kitchen_id do menu para verificar permissão de escopo
		const { data: item, error: fetchError } = await db.from("menu_items").select("id, daily_menu:daily_menu_id(kitchen_id)").eq("id", itemId).single()

		if (fetchError || !item) return toolError("Item de menu não encontrado")
		const kitchenId = item.daily_menu?.kitchen_id
		if (kitchenId == null) return toolError("Não foi possível determinar a cozinha do item")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		const updates: Record<string, unknown> = {}

		if (args.plannedPortionQuantity != null) {
			updates.planned_portion_quantity = safePositiveNumber(args.plannedPortionQuantity, "plannedPortionQuantity")
		}
		if (args.excludedFromProcurement != null) {
			const v = safeInt(args.excludedFromProcurement, "excludedFromProcurement")
			if (v !== 0 && v !== 1) return toolError("excludedFromProcurement deve ser 0 ou 1")
			updates.excluded_from_procurement = v
		}

		if (Object.keys(updates).length === 0) {
			return toolError("Nenhuma atualização fornecida. Passe plannedPortionQuantity e/ou excludedFromProcurement.")
		}

		const { data, error } = await db
			.from("menu_items")
			// biome-ignore lint/suspicious/noExplicitAny: dynamic update object — keys validated above
			.update(updates as any)
			.eq("id", itemId)
			.select()
		if (error) return toolError(sanitizeDbError(error, "update_menu_item"))
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// update_substitutions
// ---------------------------------------------------------------------------

const updateSubstitutions: ToolDefinition = {
	schema: {
		name: "update_substitutions",
		description:
			"Substitui completamente o mapa de substituições de ingredientes de um item de menu (sobrescreve — não é merge). Formato: { [ingredientId]: { type, rationale, updated_at } }. Requer permissão kitchen nível 2.",
		inputSchema: {
			type: "object",
			properties: {
				itemId: { type: "string", description: "ID (UUID) do item de menu" },
				substitutions: {
					type: "object",
					description: "Mapa de substituições. Chave = ingredientId (UUID), valor = { type: string, rationale: string, updated_at: ISO 8601 }",
				},
			},
			required: ["itemId", "substitutions"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.itemId !== "string" || !args.itemId.trim()) {
			return toolError("itemId é obrigatório e deve ser uma string (UUID)")
		}

		const itemId = String(args.itemId).trim()
		const db = getDataClient()

		// Buscar kitchen_id para verificar permissão de escopo
		const { data: item, error: fetchError } = await db.from("menu_items").select("id, daily_menu:daily_menu_id(kitchen_id)").eq("id", itemId).single()

		if (fetchError || !item) return toolError("Item de menu não encontrado")
		const kitchenId = item.daily_menu?.kitchen_id
		if (kitchenId == null) return toolError("Não foi possível determinar a cozinha do item")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		if (typeof args.substitutions !== "object" || Array.isArray(args.substitutions) || args.substitutions === null) {
			return toolError("substitutions deve ser um objeto (mapa de substituições)")
		}

		const { error } = await db.from("menu_items").update({ substitutions: args.substitutions }).eq("id", itemId)
		if (error) return toolError(sanitizeDbError(error, "update_substitutions"))
		return toolResult({ success: true, itemId, message: "Substituições atualizadas com sucesso" })
	},
}

// ---------------------------------------------------------------------------
// get_trash_items
// ---------------------------------------------------------------------------

const getTrashItems: ToolDefinition = {
	schema: {
		name: "get_trash_items",
		description:
			"Lista todos os itens de menu removidos (soft-deleted) de uma cozinha, com receita e menu diário de origem. Ordenados por data de remoção (mais recente primeiro). Use restore_menu_item para recuperar.",
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: { type: "number", description: "ID da cozinha" },
			},
			required: ["kitchenId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
		const id = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 1, { type: "kitchen", id })

		const db = getDataClient()
		const { data, error } = await db
			.from("menu_items")
			.select("*, recipe_origin:recipe_origin_id(*), daily_menu!inner(*)")
			.not("deleted_at", "is", null)
			.eq("daily_menu.kitchen_id", id)
			.order("deleted_at", { ascending: false })

		if (error) return toolError(sanitizeDbError(error, "get_trash_items"))
		return toolResult(data ?? [])
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const planningTools: ToolDefinition[] = [
	listKitchens,
	getMealTypes,
	getPlanningCalendar,
	getDayDetails,
	listRecipes,
	createDailyMenu,
	updateMenuHeadcount,
	addMenuItem,
	removeMenuItem,
	restoreMenuItem,
	updateMenuItem,
	updateSubstitutions,
	getTrashItems,
]
