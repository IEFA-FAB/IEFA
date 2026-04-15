/**
 * Kitchen module tools — ported from sisub-mcp/tools/planning.ts + templates.ts
 * Uses OpenAI function-calling format instead of MCP SDK format.
 */

import type { ModuleToolDefinition } from "./shared"
import { requireKitchenPermission, requireUuid, requireValidDates, safeInt, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"

// ── Helpers ─────────────────────────────────────────────────────────────────

const dailyMenuSelect = `
  *,
  meal_type:meal_type_id(*),
  menu_items:menu_items(
    *,
    recipe_origin:recipe_origin_id(*)
  )
` as const

// ── Tools ───────────────────────────────────────────────────────────────────

const listKitchens: ModuleToolDefinition = {
	name: "list_kitchens",
	description: "Lista todas as cozinhas disponíveis no sistema. Retorna id, display_name, tipo e unidade.",
	parameters: { type: "object", properties: {}, required: [] },
	requiredLevel: 1,
	async handler(_args, ctx) {
		requireKitchenPermission(ctx, 1)
		const { data, error } = await ctx.supabase.from("kitchen").select(`*, unit:units!kitchen_unit_id_fkey(id, name)`).order("id")
		if (error) return toolErr(sanitizeDbError(error, "list_kitchens"))
		return toolOk(data ?? [])
	},
}

const getMealTypes: ModuleToolDefinition = {
	name: "get_meal_types",
	description: "Lista tipos de refeição (desjejum, almoço, jantar, etc.). Se kitchenId fornecido, inclui tipos específicos da cozinha.",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha (opcional)" },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		if (args.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId")
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			const { data, error } = await ctx.supabase
				.from("meal_type")
				.select("*")
				.is("deleted_at", null)
				.order("sort_order")
				.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
			if (error) return toolErr(sanitizeDbError(error, "get_meal_types"))
			return toolOk(data ?? [])
		}
		const { data, error } = await ctx.supabase.from("meal_type").select("*").is("deleted_at", null).is("kitchen_id", null).order("sort_order")
		if (error) return toolErr(sanitizeDbError(error, "get_meal_types"))
		return toolOk(data ?? [])
	},
}

const getPlanningCalendar: ModuleToolDefinition = {
	name: "get_planning_calendar",
	description: "Retorna calendário de planejamento de uma cozinha para um período. Inclui menus diários com itens (receitas).",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha" },
			startDate: { type: "string", description: "Data início YYYY-MM-DD" },
			endDate: { type: "string", description: "Data fim YYYY-MM-DD" },
		},
		required: ["kitchenId", "startDate", "endDate"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const id = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 1, { type: "kitchen", id })
		requireValidDates(args.startDate, args.endDate)

		const { data, error } = await ctx.supabase
			.from("daily_menu")
			.select(dailyMenuSelect)
			.eq("kitchen_id", id)
			.gte("service_date", args.startDate as string)
			.lte("service_date", args.endDate as string)
			.is("deleted_at", null)
			.order("service_date")
			.order("meal_type_id")

		if (error) return toolErr(sanitizeDbError(error, "get_planning_calendar"))

		const menus = (data ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items ?? []).filter((item: { deleted_at: string | null }) => !item.deleted_at),
		}))

		return toolOk(menus)
	},
}

const getDayDetails: ModuleToolDefinition = {
	name: "get_day_details",
	description: "Retorna todos os menus de uma data específica com receitas. Ideal para ver detalhe antes de editar.",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha" },
			date: { type: "string", description: "Data YYYY-MM-DD" },
		},
		required: ["kitchenId", "date"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const id = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 1, { type: "kitchen", id })
		requireValidDates(args.date)

		const { data, error } = await ctx.supabase
			.from("daily_menu")
			.select(dailyMenuSelect)
			.eq("kitchen_id", id)
			.eq("service_date", args.date as string)
			.is("deleted_at", null)

		if (error) return toolErr(sanitizeDbError(error, "get_day_details"))

		const menus = (data ?? []).map((menu) => ({
			...menu,
			menu_items: (menu.menu_items ?? []).filter((item: { deleted_at: string | null }) => !item.deleted_at),
		}))

		return toolOk(menus)
	},
}

const listRecipes: ModuleToolDefinition = {
	name: "list_recipes",
	description: "Lista receitas disponíveis para uma cozinha. Inclui receitas globais e locais. Suporta busca por nome.",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha (retorna globais + locais)" },
			search: { type: "string", description: "Busca por nome (parcial, case-insensitive)" },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		let query = ctx.supabase.from("recipes").select(`*, ingredients:recipe_ingredients(*, product:product_id(*))`).is("deleted_at", null).order("name")

		if (args.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId")
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
		} else {
			requireKitchenPermission(ctx, 1)
			query = query.is("kitchen_id", null)
		}

		if (args.search) {
			const search = String(args.search).slice(0, 200)
			query = query.ilike("name", `%${search}%`)
		}

		const { data, error } = await query
		if (error) return toolErr(sanitizeDbError(error, "list_recipes"))
		return toolOk(data ?? [])
	},
}

const getRecipe: ModuleToolDefinition = {
	name: "get_recipe",
	description: "Retorna detalhes de uma receita com ingredientes completos.",
	parameters: {
		type: "object",
		properties: {
			recipeId: { type: "string", description: "ID (UUID) da receita" },
		},
		required: ["recipeId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const recipeId = requireUuid(args.recipeId, "recipeId")
		requireKitchenPermission(ctx, 1)

		const { data, error } = await ctx.supabase
			.from("recipes")
			.select(`*, ingredients:recipe_ingredients(*, product:product_id(*))`)
			.eq("id", recipeId)
			.is("deleted_at", null)
			.single()

		if (error) return toolErr(sanitizeDbError(error, "get_recipe"))
		return toolOk(data)
	},
}

const createDailyMenu: ModuleToolDefinition = {
	name: "create_daily_menu",
	description: "Cria menu diário para cozinha em data e refeição. Usa upsert — ignora se já existir.",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha" },
			date: { type: "string", description: "Data YYYY-MM-DD" },
			mealTypeId: { type: "string", description: "ID do tipo de refeição (via get_meal_types)" },
			forecastedHeadcount: { type: "number", description: "Comensais previstos (opcional)" },
		},
		required: ["kitchenId", "date", "mealTypeId"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		const id = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 2, { type: "kitchen", id })
		requireValidDates(args.date)

		if (typeof args.mealTypeId !== "string" || !String(args.mealTypeId).trim()) {
			return toolErr("mealTypeId é obrigatório")
		}

		const insert: Record<string, unknown> = {
			kitchen_id: id,
			service_date: args.date,
			meal_type_id: String(args.mealTypeId).trim(),
			status: "PLANNED",
		}
		if (args.forecastedHeadcount != null) {
			insert.forecasted_headcount = safeInt(args.forecastedHeadcount, "forecastedHeadcount")
		}

		const { data, error } = await untypedFrom(ctx, "daily_menu")
			.upsert(insert, { onConflict: "service_date,meal_type_id,kitchen_id", ignoreDuplicates: true })
			.select()

		if (error) return toolErr(sanitizeDbError(error, "create_daily_menu"))
		return toolOk(data)
	},
}

const addMenuItem: ModuleToolDefinition = {
	name: "add_menu_item",
	description: "Adiciona receita a um menu diário. A receita deve pertencer à cozinha ou ser global.",
	parameters: {
		type: "object",
		properties: {
			dailyMenuId: { type: "string", description: "ID (UUID) do menu diário" },
			recipeId: { type: "string", description: "ID (UUID) da receita" },
		},
		required: ["dailyMenuId", "recipeId"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		const menuId = requireUuid(args.dailyMenuId, "dailyMenuId")
		const recipeId = requireUuid(args.recipeId, "recipeId")

		const { data: menu, error: menuError } = await ctx.supabase.from("daily_menu").select("kitchen_id").eq("id", menuId).single()
		if (menuError || !menu) return toolErr("Menu diário não encontrado")
		if (menu.kitchen_id == null) return toolErr("Menu sem cozinha associada")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: menu.kitchen_id })

		const { data: recipe, error: recipeError } = await ctx.supabase
			.from("recipes")
			.select(`*, ingredients:recipe_ingredients(*, product:product_id(*))`)
			.eq("id", recipeId)
			.is("deleted_at", null)
			.single()

		if (recipeError || !recipe) return toolErr("Receita não encontrada")
		if (recipe.kitchen_id !== null && recipe.kitchen_id !== menu.kitchen_id) {
			return toolErr("Esta receita não está disponível para esta cozinha")
		}

		const { data, error } = await ctx.supabase.from("menu_items").insert({ daily_menu_id: menuId, recipe_origin_id: recipeId, recipe }).select()

		if (error) return toolErr(sanitizeDbError(error, "add_menu_item"))
		return toolOk(data)
	},
}

const removeMenuItem: ModuleToolDefinition = {
	name: "remove_menu_item",
	description: "Remove (soft delete) item de menu. Pode ser restaurado depois.",
	parameters: {
		type: "object",
		properties: {
			itemId: { type: "string", description: "ID (UUID) do item" },
		},
		required: ["itemId"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		const itemId = requireUuid(args.itemId, "itemId")

		const { data: item, error: fetchError } = await ctx.supabase.from("menu_items").select(`id, daily_menu:daily_menu_id(kitchen_id)`).eq("id", itemId).single()
		if (fetchError || !item) return toolErr("Item não encontrado")

		const kitchenId = item.daily_menu?.kitchen_id
		if (kitchenId == null) return toolErr("Não foi possível determinar a cozinha")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		const { error } = await ctx.supabase.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", itemId)
		if (error) return toolErr(sanitizeDbError(error, "remove_menu_item"))
		return toolOk({ success: true, itemId })
	},
}

const updateMenuHeadcount: ModuleToolDefinition = {
	name: "update_menu_headcount",
	description: "Atualiza número de comensais previstos de um menu diário.",
	parameters: {
		type: "object",
		properties: {
			menuId: { type: "string", description: "ID (UUID) do menu diário" },
			forecastedHeadcount: { type: "number", description: "Novo número de comensais" },
		},
		required: ["menuId", "forecastedHeadcount"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		const menuId = requireUuid(args.menuId, "menuId")
		const headcount = safeInt(args.forecastedHeadcount, "forecastedHeadcount")

		const { data: menu, error: fetchError } = await ctx.supabase.from("daily_menu").select("kitchen_id").eq("id", menuId).single()
		if (fetchError || !menu) return toolErr("Menu não encontrado")
		if (menu.kitchen_id == null) return toolErr("Menu sem cozinha associada")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: menu.kitchen_id })

		const { data, error } = await ctx.supabase.from("daily_menu").update({ forecasted_headcount: headcount }).eq("id", menuId).select()
		if (error) return toolErr(sanitizeDbError(error, "update_menu_headcount"))
		return toolOk(data)
	},
}

const listMenuTemplates: ModuleToolDefinition = {
	name: "list_menu_templates",
	description: "Lista templates de cardápio semanal. Retorna templates globais (SDAB) e locais da cozinha.",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha (opcional, retorna globais + locais)" },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		let query = ctx.supabase.from("menu_template").select(`*, items:menu_template_items(count)`, { count: "exact" }).is("deleted_at", null).order("name")

		if (args.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId")
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
		} else {
			requireKitchenPermission(ctx, 1)
			query = query.is("kitchen_id", null)
		}

		const { data, error } = await query
		if (error) return toolErr(sanitizeDbError(error, "list_menu_templates"))

		const templates = (data ?? []).map((t) => ({
			...t,
			item_count: Array.isArray(t.items) ? ((t.items[0] as { count: number } | undefined)?.count ?? 0) : 0,
		}))

		return toolOk(templates)
	},
}

const getTemplateItems: ModuleToolDefinition = {
	name: "get_template_items",
	description: "Retorna itens de um template semanal, organizados por dia/refeição. Útil para visualizar antes de aplicar.",
	parameters: {
		type: "object",
		properties: {
			templateId: { type: "string", description: "ID (UUID) do template" },
		},
		required: ["templateId"],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const templateId = requireUuid(args.templateId, "templateId")

		const { data: template, error: templateError } = await ctx.supabase.from("menu_template").select("id, kitchen_id, name").eq("id", templateId).single()
		if (templateError || !template) return toolErr("Template não encontrado")

		if (template.kitchen_id !== null) {
			requireKitchenPermission(ctx, 1, { type: "kitchen", id: template.kitchen_id })
		} else {
			requireKitchenPermission(ctx, 1)
		}

		const { data, error } = await ctx.supabase
			.from("menu_template_items")
			.select(`*, meal_type:meal_type_id(*), recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", templateId)
			.order("day_of_week")
			.order("meal_type_id")

		if (error) return toolErr(sanitizeDbError(error, "get_template_items"))
		return toolOk(data ?? [])
	},
}

const applyTemplate: ModuleToolDefinition = {
	name: "apply_template",
	description: `Aplica template semanal a datas de uma cozinha. Para cada data:
1. Soft-deletes menus existentes
2. Calcula dia do template via startDayOfWeek (1=seg..7=dom)
3. Cria novos menus com itens do template
O template deve ser global ou da mesma cozinha.`,
	parameters: {
		type: "object",
		properties: {
			templateId: { type: "string", description: "ID (UUID) do template" },
			kitchenId: { type: "number", description: "ID da cozinha destino" },
			targetDates: { type: "array", items: { type: "string" }, description: "Datas YYYY-MM-DD" },
			startDayOfWeek: { type: "number", description: "Dia do template (1=seg..7=dom) para a primeira data" },
		},
		required: ["templateId", "kitchenId", "targetDates", "startDayOfWeek"],
	},
	requiredLevel: 2,
	async handler(args, ctx) {
		const kitchenId = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		const templateId = requireUuid(args.templateId, "templateId")
		const startDayOfWeek = safeInt(args.startDayOfWeek, "startDayOfWeek")
		if (startDayOfWeek < 1 || startDayOfWeek > 7) return toolErr("startDayOfWeek deve ser 1-7")

		if (!Array.isArray(args.targetDates) || args.targetDates.length === 0) return toolErr("targetDates deve ser array não vazio")
		requireValidDates(...args.targetDates)
		const targetDates = (args.targetDates as string[]).map((d) => String(d).trim())

		// Verify template ownership
		const { data: template, error: templateFetchError } = await ctx.supabase
			.from("menu_template")
			.select("id, kitchen_id, name, deleted_at")
			.eq("id", templateId)
			.single()

		if (templateFetchError || !template) return toolErr("Template não encontrado")
		if (template.deleted_at !== null) return toolErr("Template removido")
		if (template.kitchen_id !== null && template.kitchen_id !== kitchenId) {
			return toolErr("Template pertence a outra cozinha")
		}

		// Fetch template items
		const { data: templateItems, error: fetchError } = await ctx.supabase
			.from("menu_template_items")
			.select(`*, recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", templateId)

		if (fetchError || !templateItems) return toolErr(sanitizeDbError(fetchError ?? new Error("template items"), "apply_template"))

		// Soft-delete existing menus
		const { data: deletedMenus, error: deleteError } = await ctx.supabase
			.from("daily_menu")
			.update({ deleted_at: new Date().toISOString() })
			.in("service_date", targetDates)
			.eq("kitchen_id", kitchenId)
			.select("id")

		if (deleteError) return toolErr(sanitizeDbError(deleteError, "apply_template:delete"))

		async function rollback() {
			if (!deletedMenus?.length) return
			await ctx.supabase
				.from("daily_menu")
				.update({ deleted_at: null })
				.in(
					"id",
					deletedMenus.map((m) => m.id)
				)
		}

		// Generate new menus
		const newMenus: Array<{ id: string; service_date: string; meal_type_id: string; kitchen_id: number; status: string }> = []
		const newMenuItems: Array<{ daily_menu_id: string; recipe_origin_id: string; recipe: unknown }> = []

		for (const dateStr of targetDates) {
			const date = new Date(dateStr)
			const jsDay = date.getDay()
			const dateDayOfWeek = jsDay === 0 ? 7 : jsDay
			const offset = dateDayOfWeek - startDayOfWeek
			const templateDay = ((offset + 7) % 7) + 1

			const dayItems = templateItems.filter((item) => item.day_of_week === templateDay)
			const itemsByMealType: Record<string, typeof dayItems> = {}
			for (const item of dayItems) {
				const key = item.meal_type_id ?? "__null__"
				if (!itemsByMealType[key]) itemsByMealType[key] = []
				itemsByMealType[key].push(item)
			}

			for (const [mealTypeId, items] of Object.entries(itemsByMealType)) {
				if (mealTypeId === "__null__") continue
				const menuId = crypto.randomUUID()
				newMenus.push({ id: menuId, service_date: dateStr, meal_type_id: mealTypeId, kitchen_id: kitchenId, status: "PLANNED" })
				for (const item of items) {
					newMenuItems.push({ daily_menu_id: menuId, recipe_origin_id: item.recipe_id ?? "", recipe: item.recipe_origin })
				}
			}
		}

		if (newMenus.length > 0) {
			const { error: menuInsertError } = await ctx.supabase.from("daily_menu").insert(newMenus)
			if (menuInsertError) {
				await rollback()
				return toolErr(sanitizeDbError(menuInsertError, "apply_template:insert_menus"))
			}
		}

		if (newMenuItems.length > 0) {
			const { error: itemInsertError } = await ctx.supabase.from("menu_items").insert(newMenuItems)
			if (itemInsertError) {
				await ctx.supabase
					.from("daily_menu")
					.delete()
					.in(
						"id",
						newMenus.map((m) => m.id)
					)
				await rollback()
				return toolErr(sanitizeDbError(itemInsertError, "apply_template:insert_items"))
			}
		}

		return toolOk({ success: true, menusCreated: newMenus.length, itemsCreated: newMenuItems.length, datesProcessed: targetDates })
	},
}

// ── Export ───────────────────────────────────────────────────────────────────

export const kitchenTools: ModuleToolDefinition[] = [
	listKitchens,
	getMealTypes,
	getPlanningCalendar,
	getDayDetails,
	listRecipes,
	getRecipe,
	createDailyMenu,
	addMenuItem,
	removeMenuItem,
	updateMenuHeadcount,
	listMenuTemplates,
	getTemplateItems,
	applyTemplate,
]
