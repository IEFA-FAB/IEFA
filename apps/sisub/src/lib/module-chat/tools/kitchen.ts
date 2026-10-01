/**
 * Kitchen module tools — ported from sisub-mcp/tools/planning.ts + templates.ts
 * Uses OpenAI function-calling format instead of MCP SDK format.
 */

import { listAccessibleKitchens, toJsonSchema, type UpsertDailyMenu, UpsertDailyMenuSchema, upsertDailyMenu } from "@iefa/sisub-domain"
import {
	AGENT_APPLY_TEMPLATE_MAX_DATES,
	type AgentApplyTemplate,
	AgentApplyTemplateSchema,
	AgentCheckMenuEquipmentSchema,
	AgentCheckRecipeEquipmentSchema,
	AgentListKitchenEquipmentSchema,
	AgentListRecipesSchema,
	AgentRecipeEquipmentSchema,
	agentApplyTemplate,
	agentCheckMenuEquipment,
	agentCheckRecipeEquipment,
	agentFetchDayMenus,
	agentFetchMenus,
	agentGetRecipe,
	agentGetRecipeEquipment,
	agentGetTemplateItems,
	agentListKitchenEquipment,
	agentListRecipes,
	clampLimit,
} from "@iefa/sisub-domain/agent"
import type { ModuleToolDefinition, ToolContext } from "./shared"
import {
	assertRouteScope,
	domainCtx,
	requireKitchenPermission,
	requireUuid,
	requireValidDates,
	safeInt,
	sanitizeDbError,
	ToolValidationError,
	toolErr,
	toolOk,
	untypedFrom,
} from "./shared"

// ── Helpers ─────────────────────────────────────────────────────────────────

const RECIPE_LIST_DEFAULT = 30
const RECIPE_LIST_MAX = 100

// `sort_order` entra porque é a ordem em que as refeições do dia devem ser listadas;
// `created_at`/`deleted_at` não dizem nada a quem lê o cardápio.
const MEAL_TYPE_COLUMNS = "id, name, sort_order, kitchen_id" as const

/**
 * Escopo da rota para tools que recebem só o id da linha (receita, template, cardápio do dia)
 * e entregam a leitura a uma operation do domínio que não devolve a cozinha dona. Lê só a
 * `kitchen_id` da linha, e só quando a conversa tem cozinha na rota: fora dela vale o PBAC da
 * operation, como antes. Linha global (`kitchen_id` nulo) é catálogo compartilhado e passa.
 * Linha ausente também passa: a operation responde "não encontrado" com a mensagem dela.
 */
async function assertRowInRouteKitchen(ctx: ToolContext, table: "recipes" | "menu_template" | "daily_menu", id: string): Promise<void> {
	if (ctx.scopeId == null) return
	const { data, error } = await untypedFrom(ctx, table).select("kitchen_id").eq("id", id).maybeSingle()
	if (error) throw new Error(sanitizeDbError(error, `escopo:${table}`))
	if (data?.kitchen_id != null) assertRouteScope(ctx, "kitchen", data.kitchen_id)
}

// ── Tools ───────────────────────────────────────────────────────────────────

const listKitchens: ModuleToolDefinition = {
	name: "list_kitchens",
	description: "Lista as cozinhas em que o usuário tem acesso. Retorna id, display_name, tipo e unidade.",
	parameters: { type: "object", properties: {}, required: [] },
	requiredLevel: 1,
	// Mesma operation do `list_kitchens` do MCP: só as cozinhas do chamador. A versão anterior
	// lia a tabela inteira pelo client service-role e entregava a lista da FAB a qualquer
	// `kitchen:1` escopado.
	async handler(_args, ctx) {
		return toolOk(await listAccessibleKitchens(ctx.db, domainCtx(ctx)))
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
			assertRouteScope(ctx, "kitchen", id)
			const { data, error } = await ctx.supabase
				.from("meal_type")
				.select(MEAL_TYPE_COLUMNS)
				.is("deleted_at", null)
				.order("sort_order")
				.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
			if (error) return toolErr(sanitizeDbError(error, "get_meal_types"))
			return toolOk(data ?? [])
		}
		const { data, error } = await ctx.supabase.from("meal_type").select(MEAL_TYPE_COLUMNS).is("deleted_at", null).is("kitchen_id", null).order("sort_order")
		if (error) return toolErr(sanitizeDbError(error, "get_meal_types"))
		return toolOk(data ?? [])
	},
}

/**
 * Calendário e dia vêm da projeção de agente do domínio, não do PostgREST cru.
 *
 * A versão anterior pedia `menu_items(*, recipe_origin(*))`: cada item trazia o snapshot json
 * da ficha técnica congelada MAIS a receita atual completa ao lado. Um dia com três refeições
 * já passava dos 60 mil caracteres de `enforcePayloadBudget` e a tool respondia erro de
 * payload em vez do cardápio; uma semana ficava uma ordem de grandeza acima do teto.
 */
const getPlanningCalendar: ModuleToolDefinition = {
	name: "get_planning_calendar",
	description: "Retorna o calendário de planejamento de uma cozinha num período: cada refeição do dia com os pratos, por nome.",
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
		assertRouteScope(ctx, "kitchen", id)
		requireValidDates(args.startDate, args.endDate)

		const menus = await agentFetchMenus(ctx.db, domainCtx(ctx), { kitchenId: id, startDate: String(args.startDate), endDate: String(args.endDate) })
		return toolOk({ menus, total_menus: menus.length })
	},
}

const getDayDetails: ModuleToolDefinition = {
	name: "get_day_details",
	description: "Retorna as refeições de uma data específica com os pratos de cada uma, por nome. Ideal para ver o dia antes de editar.",
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
		assertRouteScope(ctx, "kitchen", id)
		requireValidDates(args.date)

		const menus = await agentFetchDayMenus(ctx.db, domainCtx(ctx), { kitchenId: id, date: String(args.date) })
		return toolOk({ menus, total_menus: menus.length })
	},
}

const listRecipes: ModuleToolDefinition = {
	name: "list_recipes",
	description:
		"Lista receitas disponíveis para uma cozinha (globais + locais), só com os campos de identificação. Suporta busca por nome. Para ingredientes e modo de preparo, chame get_recipe com o id da receita.",
	// Mesma listagem que o servidor MCP expõe: entrada, teto e projeção vêm de
	// `@iefa/sisub-domain/agent`, e os guards de escopo são os do domínio.
	parameters: toJsonSchema(AgentListRecipesSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const input = AgentListRecipesSchema.parse(args)
		if (input.kitchenId != null) assertRouteScope(ctx, "kitchen", input.kitchenId)
		const { items, ...counts } = await agentListRecipes(ctx.db, domainCtx(ctx), input)
		return toolOk({ recipes: items, ...counts })
	},
}

const getRecipe: ModuleToolDefinition = {
	name: "get_recipe",
	description: "Retorna a ficha técnica de uma receita: rendimento, tempo, modo de preparo e os insumos com quantidade e unidade.",
	parameters: {
		type: "object",
		properties: {
			recipeId: { type: "string", description: "ID (UUID) da receita" },
		},
		required: ["recipeId"],
	},
	requiredLevel: 1,
	// Mesma projeção do módulo global: a linha crua trazia ~23 campos por insumo para o
	// modelo escrever "500 g de arroz".
	async handler(args, ctx) {
		const recipeId = requireUuid(args.recipeId, "recipeId")
		requireKitchenPermission(ctx, 1)
		const recipe = await agentGetRecipe(ctx.db, domainCtx(ctx), { recipeId })
		// A ficha já traz a cozinha dona: a de outra cozinha não chega ao modelo.
		if (recipe.kitchen_id != null) assertRouteScope(ctx, "kitchen", recipe.kitchen_id)
		return toolOk(recipe)
	},
}

// ── Argumentos das escritas ─────────────────────────────────────────────────
//
// `parseArgs` é o crivo da tool e também o do cartão de aprovação (`describe-action.ts`): o que
// ele aceita é exatamente o que o handler grava. Argumento que a tool recusaria não vira
// descrição de algo que nunca vai rodar.

/** Argumentos do `create_daily_menu` como a tool os aceita: já a entrada da operation. */
function parseCreateDailyMenuArgs(args: Record<string, unknown>): UpsertDailyMenu {
	const kitchenId = safeInt(args.kitchenId, "kitchenId")
	requireValidDates(args.date)
	const mealTypeId = requireUuid(typeof args.mealTypeId === "string" ? args.mealTypeId.trim() : args.mealTypeId, "mealTypeId")

	let forecastedHeadcount: number | undefined
	if (args.forecastedHeadcount != null) {
		forecastedHeadcount = safeInt(args.forecastedHeadcount, "forecastedHeadcount")
		// O schema do domínio exige positivo; aqui a recusa sai em português para o modelo corrigir.
		if (forecastedHeadcount < 1) throw new ToolValidationError("forecastedHeadcount deve ser inteiro positivo; omita o campo se não houver previsão")
	}
	return UpsertDailyMenuSchema.parse({
		kitchenId,
		serviceDate: args.date,
		mealTypeId,
		...(forecastedHeadcount != null && { forecastedHeadcount }),
	})
}

export type AddMenuItemArgs = { dailyMenuId: string; recipeId: string }

function parseAddMenuItemArgs(args: Record<string, unknown>): AddMenuItemArgs {
	return { dailyMenuId: requireUuid(args.dailyMenuId, "dailyMenuId"), recipeId: requireUuid(args.recipeId, "recipeId") }
}

export type RemoveMenuItemArgs = { itemId: string }

function parseRemoveMenuItemArgs(args: Record<string, unknown>): RemoveMenuItemArgs {
	return { itemId: requireUuid(args.itemId, "itemId") }
}

export type UpdateMenuHeadcountArgs = { menuId: string; forecastedHeadcount: number }

function parseUpdateMenuHeadcountArgs(args: Record<string, unknown>): UpdateMenuHeadcountArgs {
	return { menuId: requireUuid(args.menuId, "menuId"), forecastedHeadcount: safeInt(args.forecastedHeadcount, "forecastedHeadcount") }
}

const createDailyMenu: ModuleToolDefinition<UpsertDailyMenu> = {
	name: "create_daily_menu",
	description:
		"Cria menu diário para cozinha em data e refeição. Idempotente: se já existir um menu ativo para (data, refeição, cozinha), devolve o existente sem mudar a previsão de comensais dele (para isso, use update_menu_headcount).",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha" },
			date: { type: "string", description: "Data YYYY-MM-DD" },
			mealTypeId: { type: "string", description: "ID do tipo de refeição (via get_meal_types)" },
			forecastedHeadcount: { type: "number", description: "Comensais previstos, inteiro positivo (opcional)" },
		},
		required: ["kitchenId", "date", "mealTypeId"],
	},
	requiredLevel: 2,
	parseArgs: parseCreateDailyMenuArgs,
	// Mesma operation do `create_daily_menu` do MCP. A versão anterior fazia
	// `upsert(onConflict: "service_date,meal_type_id,kitchen_id")` pelo PostgREST, mas a
	// unicidade do trio é um índice PARCIAL (`daily_menu_active_unique ... where deleted_at is
	// null`): sem o predicado o Postgres não acha árbitro e responde 42P10 em toda chamada.
	async handler(input, ctx) {
		requireKitchenPermission(ctx, 2, { type: "kitchen", id: input.kitchenId })
		assertRouteScope(ctx, "kitchen", input.kitchenId)
		return toolOk(await upsertDailyMenu(ctx.db, domainCtx(ctx), input))
	},
}

const addMenuItem: ModuleToolDefinition<AddMenuItemArgs> = {
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
	parseArgs: parseAddMenuItemArgs,
	async handler({ dailyMenuId: menuId, recipeId }, ctx) {
		const { data: menu, error: menuError } = await ctx.supabase.from("daily_menu").select("kitchen_id").eq("id", menuId).single()
		if (menuError || !menu) return toolErr("Menu diário não encontrado")
		if (menu.kitchen_id == null) return toolErr("Menu sem cozinha associada")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: menu.kitchen_id })
		assertRouteScope(ctx, "kitchen", menu.kitchen_id)

		const { data: recipe, error: recipeError } = await ctx.supabase
			.from("recipes")
			.select(`*, ingredients:recipe_ingredients(*, ingredient:ingredient_id(*))`)
			.eq("id", recipeId)
			.is("deleted_at", null)
			.single()

		if (recipeError || !recipe) return toolErr("Receita não encontrada")
		if (recipe.kitchen_id !== null && recipe.kitchen_id !== menu.kitchen_id) {
			return toolErr("Esta receita não está disponível para esta cozinha")
		}

		// A linha guarda o snapshot inteiro da receita; devolver esse snapshot ao
		// modelo só gastaria contexto (e poderia bater no teto de payload DEPOIS
		// da escrita já ter acontecido). Confirmação enxuta basta.
		const { data, error } = await ctx.supabase.from("menu_items").insert({ daily_menu_id: menuId, recipe_origin_id: recipeId, recipe }).select("id")

		if (error) return toolErr(sanitizeDbError(error, "add_menu_item"))
		return toolOk({ id: data?.[0]?.id ?? null, daily_menu_id: menuId, recipe_origin_id: recipeId, recipe_name: recipe.name })
	},
}

const removeMenuItem: ModuleToolDefinition<RemoveMenuItemArgs> = {
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
	parseArgs: parseRemoveMenuItemArgs,
	async handler({ itemId }, ctx) {
		const { data: item, error: fetchError } = await ctx.supabase.from("menu_items").select(`id, daily_menu:daily_menu_id(kitchen_id)`).eq("id", itemId).single()
		if (fetchError || !item) return toolErr("Item não encontrado")

		const kitchenId = item.daily_menu?.kitchen_id
		if (kitchenId == null) return toolErr("Não foi possível determinar a cozinha")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })
		assertRouteScope(ctx, "kitchen", kitchenId)

		const { error } = await ctx.supabase.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", itemId)
		if (error) return toolErr(sanitizeDbError(error, "remove_menu_item"))
		return toolOk({ success: true, itemId })
	},
}

const updateMenuHeadcount: ModuleToolDefinition<UpdateMenuHeadcountArgs> = {
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
	parseArgs: parseUpdateMenuHeadcountArgs,
	async handler({ menuId, forecastedHeadcount: headcount }, ctx) {
		const { data: menu, error: fetchError } = await ctx.supabase.from("daily_menu").select("kitchen_id").eq("id", menuId).single()
		if (fetchError || !menu) return toolErr("Menu não encontrado")
		if (menu.kitchen_id == null) return toolErr("Menu sem cozinha associada")

		requireKitchenPermission(ctx, 2, { type: "kitchen", id: menu.kitchen_id })
		assertRouteScope(ctx, "kitchen", menu.kitchen_id)

		const { data, error } = await ctx.supabase
			.from("daily_menu")
			.update({ forecasted_headcount: headcount })
			.eq("id", menuId)
			.select("id, service_date, forecasted_headcount")
		if (error) return toolErr(sanitizeDbError(error, "update_menu_headcount"))
		return toolOk(data)
	},
}

const listMenuTemplates: ModuleToolDefinition = {
	name: "list_menu_templates",
	description:
		"Lista templates de cardápio. Retorna templates globais (SDAB) e locais da cozinha. `template_type` distingue: weekly (cardápio semanal), event (evento) e apoio (cardápio de apoio: lanches de bordo/apoio do Módulo 7, coffee break, café de reunião).",
	parameters: {
		type: "object",
		properties: {
			kitchenId: { type: "number", description: "ID da cozinha (opcional, retorna globais + locais)" },
			limit: { type: "number", description: `Quantos templates retornar (padrão ${RECIPE_LIST_DEFAULT}, máximo ${RECIPE_LIST_MAX})` },
		},
		required: [],
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const limit = clampLimit(args.limit, RECIPE_LIST_DEFAULT, RECIPE_LIST_MAX)
		let query = ctx.supabase
			.from("menu_template")
			.select(`id, name, description, template_type, kitchen_id, items:menu_template_items(count)`, { count: "exact" })
			.is("deleted_at", null)
			.order("name")
			.limit(limit)

		if (args.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId")
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			assertRouteScope(ctx, "kitchen", id)
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
		} else {
			requireKitchenPermission(ctx, 1)
			query = query.is("kitchen_id", null)
		}

		const { data, error, count } = await query
		if (error) return toolErr(sanitizeDbError(error, "list_menu_templates"))

		const templates = (data ?? []).map(({ items, ...t }) => ({
			...t,
			item_count: Array.isArray(items) ? ((items[0] as { count: number } | undefined)?.count ?? 0) : 0,
		}))

		return toolOk({ templates, returned: templates.length, total: count ?? templates.length, limit })
	},
}

const getTemplateItems: ModuleToolDefinition = {
	name: "get_template_items",
	description: "Retorna os itens de um template semanal, por dia da semana e refeição, com a receita pelo nome. Útil para visualizar antes de aplicar.",
	parameters: {
		type: "object",
		properties: {
			templateId: { type: "string", description: "ID (UUID) do template" },
		},
		required: ["templateId"],
	},
	requiredLevel: 1,
	// Guards (template de cozinha exige a cozinha, global basta ler cardápio) e projeção ficam
	// na leitura de agente do domínio — a versão anterior trazia `recipe_origin(*)` por item, e
	// um template semanal cheio tem ~100 itens.
	async handler(args, ctx) {
		const templateId = requireUuid(args.templateId, "templateId")
		await assertRowInRouteKitchen(ctx, "menu_template", templateId)
		const items = await agentGetTemplateItems(ctx.db, domainCtx(ctx), { templateId })
		return toolOk({ items, total_items: items.length })
	},
}

/**
 * Invólucro fino de `agentApplyTemplate` (`@iefa/sisub-domain/agent`), que chama o
 * `applyTemplate` do domínio numa transação, só no modo "skip" e com no máximo 31 datas.
 *
 * A versão anterior reimplementava a operação em PostgREST: SEMPRE soft-deletava os
 * cardápios das datas, aceitava qualquer quantidade de datas e desfazia falha parcial com um
 * rollback "melhor esforço" fora de transação. Numa tool que o modelo decide chamar — e que
 * um texto injetado numa receita ou num nome de template pode induzir —, isso era apagar o
 * planejamento de meses com uma frase. Substituir planejamento existente fica para a tela,
 * que mostra a prévia do que vai para a lixeira.
 */
const applyTemplate: ModuleToolDefinition<AgentApplyTemplate> = {
	name: "apply_template",
	description: `Aplica um template semanal a datas de uma cozinha (no máximo ${AGENT_APPLY_TEMPLATE_MAX_DATES} datas por chamada).
Só PREENCHE refeições que ainda não têm cardápio: o planejamento existente, inclusive ajustes manuais, é preservado — esta ferramenta nunca apaga nem substitui cardápio. Para substituir, oriente o usuário a aplicar pela tela de planejamento.
startDayOfWeek (1=seg..7=dom) é o dia da semana em que cai o dia 1 do template: as datas nesse dia da semana recebem o dia 1, as do dia seguinte o dia 2, e assim por diante. O template deve ser semanal e global ou da mesma cozinha.
Template global (SDAB) só tem proporções, sem efetivo: informe o efetivo de cada refeição em headcounts; sem ele o dia fica com "efetivo a definir" e as porções são calculadas quando o usuário informar.
Na resposta, datesSkipped lista as datas que já tinham alguma refeição planejada e foram preservadas.`,
	parameters: toJsonSchema(AgentApplyTemplateSchema),
	requiredLevel: 2,
	parseArgs: (args) => AgentApplyTemplateSchema.parse(args),
	async handler(input, ctx) {
		requireKitchenPermission(ctx, 2, { type: "kitchen", id: input.kitchenId })
		assertRouteScope(ctx, "kitchen", input.kitchenId)
		return toolOk(await agentApplyTemplate(ctx.db, domainCtx(ctx), input))
	},
}

// ── Equipamento ─────────────────────────────────────────────────────────────
//
// Três perguntas distintas de propósito. Deixar o modelo cruzar o parque com a lista mínima
// em prosa seria pedir que ele refizesse o emparelhamento — e ele erraria justamente onde o
// cálculo é sutil: o multifuncional que sabe quatro papéis mas exerce dois por vez, e o
// volume, que vira RODADAS do mesmo forno e não mais fornos.

const listKitchenEquipmentTool: ModuleToolDefinition = {
	name: "list_kitchen_equipment",
	description:
		"Lista o parque de equipamentos instalado numa cozinha: como cada um é chamado, o modelo, a capacidade, as funções que ele assume e quantas zonas independentes tem (um iVario Pro 2-S tem duas cubas: assume várias funções, duas por vez).",
	parameters: toJsonSchema(AgentListKitchenEquipmentSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const input = AgentListKitchenEquipmentSchema.parse(args)
		assertRouteScope(ctx, "kitchen", input.kitchenId)
		const { items, ...rest } = await agentListKitchenEquipment(ctx.db, domainCtx(ctx), input)
		return toolOk({ equipment: items, ...rest })
	},
}

const getRecipeEquipmentTool: ModuleToolDefinition = {
	name: "get_recipe_equipment",
	description:
		"Lista o que UMA BATELADA de uma preparação exige de equipamento (papel ou modelo específico, quantidade, capacidade mínima). Volume não muda esta lista: 900 porções de uma receita que rende 100 são nove rodadas do mesmo forno, não nove fornos.",
	parameters: toJsonSchema(AgentRecipeEquipmentSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const input = AgentRecipeEquipmentSchema.parse(args)
		await assertRowInRouteKitchen(ctx, "recipes", input.recipeId)
		const { items, ...counts } = await agentGetRecipeEquipment(ctx.db, domainCtx(ctx), input)
		return toolOk({ requirements: items, ...counts })
	},
}

const checkRecipeEquipmentTool: ModuleToolDefinition = {
	name: "check_recipe_equipment",
	description:
		"Verifica se uma cozinha consegue produzir uma preparação: o que falta de equipamento e, quando as porções são informadas, em quantas rodadas o volume cabe. Distingue 'parque não cadastrado' de 'parque insuficiente' — não afirme falta quando a cozinha ainda não cadastrou nada.",
	parameters: toJsonSchema(AgentCheckRecipeEquipmentSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const input = AgentCheckRecipeEquipmentSchema.parse(args)
		assertRouteScope(ctx, "kitchen", input.kitchenId)
		await assertRowInRouteKitchen(ctx, "recipes", input.recipeId)
		return toolOk(await agentCheckRecipeEquipment(ctx.db, domainCtx(ctx), input))
	},
}

const checkMenuEquipmentTool: ModuleToolDefinition = {
	name: "check_menu_equipment",
	description:
		"Verifica a disputa de equipamento entre as preparações da MESMA refeição: cada ficha isolada pode caber, e o almoço com três pratos pedindo forno combinado numa cozinha com um forno não cabe. Devolve quais preparações competem por cada equipamento.",
	parameters: toJsonSchema(AgentCheckMenuEquipmentSchema),
	requiredLevel: 1,
	async handler(args, ctx) {
		const input = AgentCheckMenuEquipmentSchema.parse(args)
		await assertRowInRouteKitchen(ctx, "daily_menu", input.dailyMenuId)
		return toolOk(await agentCheckMenuEquipment(ctx.db, domainCtx(ctx), input))
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
	listKitchenEquipmentTool,
	getRecipeEquipmentTool,
	checkRecipeEquipmentTool,
	checkMenuEquipmentTool,
]
