/**
 * Tools MCP — Módulo Templates Semanais
 *
 * Correções de segurança aplicadas:
 *   C2 — get_template_items verifica que o template pertence à cozinha autorizada
 *   H2 — apply_template verifica ownership do template antes de aplicar
 *   H3 — safeInt() antes de toda interpolação em filtros Supabase
 *   M3 — sanitizeDbError() em todos os erros de banco
 *   L1 — apply_template tenta rollback se inserts falharem (atomicidade compensatória)
 */

import { resolveUserContext } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import type { ToolDefinition } from "./shared.ts"
import { requireKitchenPermission, requireValidDates, safeInt, sanitizeDbError, toolError, toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// list_menu_templates
// ---------------------------------------------------------------------------

const listMenuTemplates: ToolDefinition = {
	schema: {
		name: "list_menu_templates",
		description:
			"Lista os templates de cardápio semanal disponíveis para uma cozinha. Retorna templates globais (SDAB, kitchen_id null) e templates locais da cozinha informada. Inclui contagem de itens por template.",
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: {
					type: "number",
					description: "ID da cozinha. Se omitido, retorna apenas templates globais.",
				},
			},
			required: [],
		},
	},
	async handler(args, jwt) {
		const ctx = await resolveUserContext(jwt)

		const db = getDataClient()
		let query = db.from("menu_template").select(`*, items:menu_template_items(count)`, { count: "exact" }).is("deleted_at", null).order("name")

		if (args?.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId") // H3: safeInt antes da interpolação
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
		} else {
			requireKitchenPermission(ctx, 1)
			query = query.is("kitchen_id", null)
		}

		const { data, error } = await query
		if (error) return toolError(sanitizeDbError(error, "list_menu_templates"))

		const templates = (data ?? []).map((t) => ({
			...t,
			item_count: Array.isArray(t.items) ? ((t.items[0] as { count: number } | undefined)?.count ?? 0) : 0,
		}))

		return toolResult(templates)
	},
}

// ---------------------------------------------------------------------------
// get_template_items  [C2 FIXADO: verifica kitchen scope do template]
// ---------------------------------------------------------------------------

const getTemplateItems: ToolDefinition = {
	schema: {
		name: "get_template_items",
		description:
			"Retorna todos os itens (receitas) de um template semanal, organizados por dia_da_semana e tipo_de_refeição. Útil para visualizar o template antes de aplicá-lo. O usuário deve ter permissão para a cozinha do template.",
		inputSchema: {
			type: "object",
			properties: {
				templateId: { type: "string", description: "ID (UUID) do template" },
			},
			required: ["templateId"],
		},
	},
	async handler(args, jwt) {
		const ctx = await resolveUserContext(jwt)

		if (typeof args.templateId !== "string" || !args.templateId.trim()) {
			return toolError("templateId é obrigatório e deve ser uma string (UUID)")
		}

		const templateId = String(args.templateId).trim()
		const db = getDataClient()

		// C2: buscar o template primeiro para descobrir a qual cozinha pertence,
		// e então verificar se o usuário tem permissão para aquela cozinha.
		const { data: template, error: templateError } = await db.from("menu_template").select("id, kitchen_id, name").eq("id", templateId).single()

		if (templateError || !template) return toolError("Template não encontrado")

		if (template.kitchen_id !== null) {
			// Template local: exige permissão para a cozinha específica do template
			requireKitchenPermission(ctx, 1, { type: "kitchen", id: template.kitchen_id })
		} else {
			// Template global: basta ter qualquer kitchen level 1
			requireKitchenPermission(ctx, 1)
		}

		const { data, error } = await db
			.from("menu_template_items")
			.select(`*, meal_type:meal_type_id(*), recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", templateId)
			.order("day_of_week")
			.order("meal_type_id")

		if (error) return toolError(sanitizeDbError(error, "get_template_items"))
		return toolResult(data ?? [])
	},
}

// ---------------------------------------------------------------------------
// apply_template  [H2 FIXADO: ownership check + L1 rollback compensatório]
// ---------------------------------------------------------------------------

const applyTemplate: ToolDefinition = {
	schema: {
		name: "apply_template",
		description: `Aplica um template semanal a um conjunto de datas de uma cozinha.
Para cada data em targetDates:
  1. Soft-deletes os daily_menus existentes nessa data (para a cozinha)
  2. Calcula qual dia do template corresponde à data (baseado em startDayOfWeek)
  3. Cria novos daily_menus com os itens do template

startDayOfWeek indica qual dia do template (1=seg … 7=dom) corresponde à primeira data em targetDates.

O template deve ser global (SDAB) ou pertencer à mesma cozinha de destino.

Exemplo: aplicar um template de 7 dias começando segunda-feira (startDayOfWeek=1)
a targetDates=["2026-04-13","2026-04-14",...,"2026-04-19"] gera uma semana completa.`,
		inputSchema: {
			type: "object",
			properties: {
				templateId: { type: "string", description: "ID (UUID) do template a aplicar" },
				kitchenId: { type: "number", description: "ID da cozinha de destino" },
				targetDates: {
					type: "array",
					items: { type: "string" },
					description: "Array de datas no formato YYYY-MM-DD onde o template será aplicado",
				},
				startDayOfWeek: {
					type: "number",
					description: "Dia do template (1=segunda … 7=domingo) que corresponde à primeira data em targetDates",
				},
			},
			required: ["templateId", "kitchenId", "targetDates", "startDayOfWeek"],
		},
	},
	async handler(args, jwt) {
		const ctx = await resolveUserContext(jwt)
		const kitchenId = safeInt(args.kitchenId, "kitchenId")
		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		if (typeof args.templateId !== "string" || !args.templateId.trim()) {
			return toolError("templateId é obrigatório e deve ser uma string (UUID)")
		}

		const templateId = String(args.templateId).trim()
		const startDayOfWeek = safeInt(args.startDayOfWeek, "startDayOfWeek")
		if (startDayOfWeek < 1 || startDayOfWeek > 7) {
			return toolError("startDayOfWeek deve ser um número entre 1 (segunda) e 7 (domingo)")
		}

		if (!Array.isArray(args.targetDates) || args.targetDates.length === 0) {
			return toolError("targetDates deve ser um array não vazio de datas")
		}

		// M4: validar todas as datas de uma vez
		requireValidDates(...args.targetDates)

		const targetDates: string[] = args.targetDates.map((d: unknown) => String(d).trim())

		const db = getDataClient()

		// H2: verificar que o template é global OU pertence à cozinha de destino.
		// Impede que um usuário com escrita em cozinha B aplique templates privados de cozinha A.
		const { data: template, error: templateFetchError } = await db
			.from("menu_template")
			.select("id, kitchen_id, name, deleted_at")
			.eq("id", templateId)
			.single()

		if (templateFetchError || !template) return toolError("Template não encontrado")

		if (template.deleted_at !== null) return toolError("Este template foi removido e não pode ser aplicado")

		if (template.kitchen_id !== null && template.kitchen_id !== kitchenId) {
			return toolError("Permissão insuficiente: este template pertence a outra cozinha e não pode ser aplicado aqui")
		}

		// 1. Buscar todos os itens do template
		const { data: templateItems, error: fetchError } = await db
			.from("menu_template_items")
			.select(`*, recipe_origin:recipe_id(*)`)
			.eq("menu_template_id", templateId)

		if (fetchError || !templateItems) {
			return toolError(sanitizeDbError(fetchError ?? new Error("template não encontrado"), "apply_template:fetch_items"))
		}

		// 2. Soft-delete dos menus existentes nas datas alvo (guarda os IDs para rollback)
		const { data: deletedMenus, error: deleteError } = await db
			.from("daily_menu")
			.update({ deleted_at: new Date().toISOString() })
			.in("service_date", targetDates)
			.eq("kitchen_id", kitchenId)
			.select("id")

		if (deleteError) return toolError(sanitizeDbError(deleteError, "apply_template:delete_existing"))

		// ── Função de rollback: restaura os menus soft-deletados se algo falhar ──
		async function rollbackDeletedMenus(): Promise<void> {
			if (!deletedMenus?.length) return
			const ids = deletedMenus.map((m) => m.id)
			await db.from("daily_menu").update({ deleted_at: null }).in("id", ids)
		}

		// 3. Gerar novos menus e itens para cada data
		const newMenus: Array<{
			id: string
			service_date: string
			meal_type_id: string
			kitchen_id: number
			status: string
		}> = []

		const newMenuItems: Array<{
			daily_menu_id: string
			recipe_origin_id: string
			recipe: unknown
		}> = []

		for (const dateStr of targetDates) {
			const date = new Date(dateStr)
			const jsDay = date.getDay() // 0=dom … 6=sab
			const dateDayOfWeek = jsDay === 0 ? 7 : jsDay // 1=seg … 7=dom
			const offset = dateDayOfWeek - startDayOfWeek
			const templateDay = ((offset + 7) % 7) + 1 // 1-7

			const dayItems = templateItems.filter((item) => item.day_of_week === templateDay)

			// Agrupar por meal_type
			const itemsByMealType: Record<string, typeof dayItems> = {}
			for (const item of dayItems) {
				const key = item.meal_type_id ?? "__null__"
				if (!itemsByMealType[key]) itemsByMealType[key] = []
				itemsByMealType[key].push(item)
			}

			for (const [mealTypeId, items] of Object.entries(itemsByMealType)) {
				if (mealTypeId === "__null__") continue

				const menuId = crypto.randomUUID()
				newMenus.push({
					id: menuId,
					service_date: dateStr,
					meal_type_id: mealTypeId,
					kitchen_id: kitchenId,
					status: "PLANNED",
				})

				for (const item of items) {
					newMenuItems.push({
						daily_menu_id: menuId,
						recipe_origin_id: item.recipe_id ?? "",
						recipe: item.recipe_origin, // snapshot da receita
					})
				}
			}
		}

		// 4. Inserir menus (com rollback em caso de falha)
		if (newMenus.length > 0) {
			const { error: menuInsertError } = await db.from("daily_menu").insert(newMenus)
			if (menuInsertError) {
				// L1: tentar restaurar os menus que foram soft-deletados no passo 2
				await rollbackDeletedMenus()
				return toolError(sanitizeDbError(menuInsertError, "apply_template:insert_menus"))
			}
		}

		// 5. Inserir itens (com rollback duplo em caso de falha)
		if (newMenuItems.length > 0) {
			const { error: itemInsertError } = await db.from("menu_items").insert(newMenuItems)
			if (itemInsertError) {
				// L1: remover os menus recém-criados E restaurar os soft-deletados
				const newMenuIds = newMenus.map((m) => m.id)
				await db.from("daily_menu").delete().in("id", newMenuIds)
				await rollbackDeletedMenus()
				return toolError(sanitizeDbError(itemInsertError, "apply_template:insert_items"))
			}
		}

		return toolResult({
			success: true,
			menusCreated: newMenus.length,
			itemsCreated: newMenuItems.length,
			datesProcessed: targetDates,
		})
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const templateTools: ToolDefinition[] = [listMenuTemplates, getTemplateItems, applyTemplate]
