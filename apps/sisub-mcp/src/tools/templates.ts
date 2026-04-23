/**
 * Tools MCP — Módulo Templates Semanais
 *
 * Correções de segurança aplicadas:
 *   C2 — get_template_items verifica que o template pertence à cozinha autorizada
 *   H2 — apply_template verifica ownership do template antes de aplicar
 *   H3 — safeInt() antes de toda interpolação em filtros Supabase
 *   M3 — sanitizeDbError() em todos os erros de banco
 *   L1 — apply_template e create_template tentam rollback se inserts falharem
 *
 * DRY:
 *   resolveTemplateAccess() — busca template + verifica permissão PBAC; usado por
 *     get_template, get_template_items, apply_template, update_template,
 *     delete_template e fork_template.
 *   mapTemplateWithCount()  — computa item_count a partir do count agregado;
 *     usado por list_menu_templates e list_deleted_templates.
 */

import { resolveCredential } from "../auth.ts"
import { getDataClient } from "../supabase.ts"
import type { UserContext } from "../types.ts"
import type { ToolDefinition } from "./shared.ts"
import { requireKitchenPermission, requireValidDates, safeInt, sanitizeDbError, toolError, toolResult } from "./shared.ts"

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

type TemplateRow = {
	id: string
	kitchen_id: number | null
	name: string | null
	deleted_at: string | null
}

/**
 * Mapeia uma row de menu_template (com items via count agregado) para incluir item_count.
 * Evita duplicação entre list_menu_templates e list_deleted_templates.
 */
// biome-ignore lint/suspicious/noExplicitAny: shape varia conforme seleção Supabase
function mapTemplateWithCount(t: any): Record<string, unknown> {
	return {
		...t,
		item_count: Array.isArray(t.items) ? ((t.items[0] as { count: number } | undefined)?.count ?? 0) : 0,
	}
}

/**
 * Busca um template por ID, verifica ownership (PBAC) e retorna o registro.
 * requireKitchenPermission lança McpError se o acesso for negado.
 * Retorna { template: null, err: string } se o template não for encontrado.
 */
async function resolveTemplateAccess(
	db: ReturnType<typeof getDataClient>,
	templateId: string,
	ctx: UserContext,
	minLevel: 1 | 2 = 1
): Promise<{ template: TemplateRow | null; err: string | null }> {
	const { data, error } = await db.from("menu_template").select("id, kitchen_id, name, deleted_at").eq("id", templateId).single()

	if (error || !data) return { template: null, err: "Template não encontrado" }

	// biome-ignore lint/suspicious/noExplicitAny: cast necessário — tipo gerado difere do campo selecionado
	const template = data as any as TemplateRow

	if (template.kitchen_id !== null) {
		requireKitchenPermission(ctx, minLevel, { type: "kitchen", id: template.kitchen_id })
	} else {
		requireKitchenPermission(ctx, minLevel)
	}

	return { template, err: null }
}

// ---------------------------------------------------------------------------
// list_menu_templates
// ---------------------------------------------------------------------------

const listMenuTemplates: ToolDefinition = {
	schema: {
		name: "list_menu_templates",
		description:
			"Lista os templates de cardápio semanal ativos disponíveis para uma cozinha. Retorna templates globais (SDAB, kitchen_id null) e templates locais da cozinha informada. Inclui contagem de itens por template.",
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
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		const db = getDataClient()
		let query = db.from("menu_template").select("*, items:menu_template_items(count)", { count: "exact" }).is("deleted_at", null).order("name")

		if (args?.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId") // H3
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
		} else {
			requireKitchenPermission(ctx, 1)
			query = query.is("kitchen_id", null)
		}

		const { data, error } = await query
		if (error) return toolError(sanitizeDbError(error, "list_menu_templates"))
		return toolResult((data ?? []).map(mapTemplateWithCount))
	},
}

// ---------------------------------------------------------------------------
// list_deleted_templates
// ---------------------------------------------------------------------------

const listDeletedTemplates: ToolDefinition = {
	schema: {
		name: "list_deleted_templates",
		description: "Lista os templates de cardápio removidos (soft-deleted) de uma cozinha, ordenados por data de remoção. Use restore_template para recuperar.",
		inputSchema: {
			type: "object",
			properties: {
				kitchenId: {
					type: "number",
					description: "ID da cozinha. Se omitido, lista apenas templates globais removidos.",
				},
			},
			required: [],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		const db = getDataClient()
		let query = db
			.from("menu_template")
			.select("*, items:menu_template_items(count)", { count: "exact" })
			.not("deleted_at", "is", null)
			.order("deleted_at", { ascending: false })

		if (args?.kitchenId != null) {
			const id = safeInt(args.kitchenId, "kitchenId") // H3
			requireKitchenPermission(ctx, 1, { type: "kitchen", id })
			query = query.or(`kitchen_id.is.null,kitchen_id.eq.${id}`)
		} else {
			requireKitchenPermission(ctx, 1)
			query = query.is("kitchen_id", null)
		}

		const { data, error } = await query
		if (error) return toolError(sanitizeDbError(error, "list_deleted_templates"))
		return toolResult((data ?? []).map(mapTemplateWithCount))
	},
}

// ---------------------------------------------------------------------------
// get_template  [C2: ownership via resolveTemplateAccess]
// ---------------------------------------------------------------------------

const getTemplate: ToolDefinition = {
	schema: {
		name: "get_template",
		description:
			"Retorna um template completo (metadados + todos os itens com receitas) por ID. O usuário deve ter permissão de leitura na cozinha do template.",
		inputSchema: {
			type: "object",
			properties: {
				templateId: { type: "string", description: "ID (UUID) do template" },
			},
			required: ["templateId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.templateId !== "string" || !args.templateId.trim()) {
			return toolError("templateId é obrigatório e deve ser uma string (UUID)")
		}

		const templateId = String(args.templateId).trim()
		const db = getDataClient()

		const { template, err } = await resolveTemplateAccess(db, templateId, ctx, 1)
		if (err) return toolError(err)

		const { data: items, error: itemsError } = await db
			.from("menu_template_items")
			.select("*, meal_type:meal_type_id(*), recipe_origin:recipe_id(*)")
			.eq("menu_template_id", templateId)
			.order("day_of_week")
			.order("meal_type_id")

		if (itemsError) return toolError(sanitizeDbError(itemsError, "get_template:items"))
		return toolResult({ ...template, items: items ?? [] })
	},
}

// ---------------------------------------------------------------------------
// get_template_items  [C2: ownership via resolveTemplateAccess]
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
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.templateId !== "string" || !args.templateId.trim()) {
			return toolError("templateId é obrigatório e deve ser uma string (UUID)")
		}

		const templateId = String(args.templateId).trim()
		const db = getDataClient()

		// C2: resolveTemplateAccess verifica ownership antes de expor itens
		const { err } = await resolveTemplateAccess(db, templateId, ctx, 1)
		if (err) return toolError(err)

		const { data, error } = await db
			.from("menu_template_items")
			.select("*, meal_type:meal_type_id(*), recipe_origin:recipe_id(*)")
			.eq("menu_template_id", templateId)
			.order("day_of_week")
			.order("meal_type_id")

		if (error) return toolError(sanitizeDbError(error, "get_template_items"))
		return toolResult(data ?? [])
	},
}

// ---------------------------------------------------------------------------
// create_template
// ---------------------------------------------------------------------------

const createTemplate: ToolDefinition = {
	schema: {
		name: "create_template",
		description:
			"Cria um novo template de cardápio com metadados e opcionalmente seus itens. Se a inserção dos itens falhar, o template é removido (rollback compensatório). kitchen_id=null cria um template global (SDAB).",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome do template" },
				description: { type: "string", description: "Descrição opcional" },
				kitchenId: { type: "number", description: "ID da cozinha. Omitido ou null = template global (requer kitchen level 2 global)" },
				templateType: { type: "string", enum: ["weekly", "event"], description: "Tipo: weekly (semanal) ou event (evento)" },
				items: {
					type: "array",
					description: "Itens do template (opcional). Cada item: { dayOfWeek, mealTypeId, recipeId, headcountOverride? }",
					items: {
						type: "object",
						properties: {
							dayOfWeek: { type: "number", description: "Dia da semana (1=seg … 7=dom)" },
							mealTypeId: { type: "string", description: "ID do tipo de refeição" },
							recipeId: { type: "string", description: "ID da receita" },
							headcountOverride: { type: "number", description: "Headcount específico para este item (opcional)" },
						},
						required: ["dayOfWeek", "mealTypeId", "recipeId"],
					},
				},
			},
			required: ["name", "templateType"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.name !== "string" || !args.name.trim()) return toolError("name é obrigatório")
		if (!["weekly", "event"].includes(args.templateType)) return toolError("templateType deve ser 'weekly' ou 'event'")

		const kitchenId = args.kitchenId != null ? safeInt(args.kitchenId, "kitchenId") : null // H3

		if (kitchenId !== null) {
			requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })
		} else {
			requireKitchenPermission(ctx, 2)
		}

		const db = getDataClient()

		const { data: newTemplate, error: templateError } = await db
			.from("menu_template")
			.insert({
				name: String(args.name).trim(),
				description: args.description ? String(args.description).trim() : null,
				kitchen_id: kitchenId,
				template_type: args.templateType,
			})
			.select()
			.single()

		if (templateError) return toolError(sanitizeDbError(templateError, "create_template:insert"))

		const items: unknown[] = Array.isArray(args.items) ? args.items : []
		if (items.length > 0) {
			// biome-ignore lint/suspicious/noExplicitAny: items come from tool args — shape validated below
			const templateItems = (items as any[]).map((item: Record<string, unknown>) => ({
				menu_template_id: newTemplate.id,
				day_of_week: safeInt(item.dayOfWeek, "dayOfWeek"),
				meal_type_id: String(item.mealTypeId),
				recipe_id: String(item.recipeId),
				...(item.headcountOverride != null && { headcount_override: safeInt(item.headcountOverride, "headcountOverride") }),
			}))

			const { error: itemsError } = await db.from("menu_template_items").insert(templateItems)

			if (itemsError) {
				// L1: rollback compensatório — remover o template inserido
				await db.from("menu_template").delete().eq("id", newTemplate.id)
				return toolError(sanitizeDbError(itemsError, "create_template:insert_items"))
			}
		}

		return toolResult(newTemplate)
	},
}

// ---------------------------------------------------------------------------
// create_blank_template
// ---------------------------------------------------------------------------

const createBlankTemplate: ToolDefinition = {
	schema: {
		name: "create_blank_template",
		description: "Cria um template vazio (sem itens) para uma cozinha. Use update_template para adicionar itens depois.",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome do template" },
				description: { type: "string", description: "Descrição opcional" },
				kitchenId: { type: "number", description: "ID da cozinha" },
				templateType: { type: "string", enum: ["weekly", "event"], description: "Tipo: weekly (semanal) ou event (evento)" },
			},
			required: ["name", "kitchenId", "templateType"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.name !== "string" || !args.name.trim()) return toolError("name é obrigatório")
		if (!["weekly", "event"].includes(args.templateType)) return toolError("templateType deve ser 'weekly' ou 'event'")

		const kitchenId = safeInt(args.kitchenId, "kitchenId") // H3
		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		const db = getDataClient()

		const { data, error } = await db
			.from("menu_template")
			.insert({
				name: String(args.name).trim(),
				description: args.description ? String(args.description).trim() : null,
				kitchen_id: kitchenId,
				template_type: args.templateType,
			})
			.select()
			.single()

		if (error) return toolError(sanitizeDbError(error, "create_blank_template"))
		return toolResult(data)
	},
}

// ---------------------------------------------------------------------------
// fork_template  [H2: verifica leitura no base via resolveTemplateAccess]
// ---------------------------------------------------------------------------

const forkTemplate: ToolDefinition = {
	schema: {
		name: "fork_template",
		description:
			"Cria uma cópia local de um template existente (global ou de outra cozinha), registrando base_template_id. Os itens são copiados sem headcount_override. Se a inserção dos itens falhar, o template novo é removido (rollback compensatório).",
		inputSchema: {
			type: "object",
			properties: {
				name: { type: "string", description: "Nome do novo template local" },
				description: { type: "string", description: "Descrição opcional" },
				kitchenId: { type: "number", description: "ID da cozinha de destino" },
				baseTemplateId: { type: "string", description: "ID (UUID) do template base a ser copiado" },
				templateType: { type: "string", enum: ["weekly", "event"], description: "Tipo: weekly (semanal) ou event (evento)" },
			},
			required: ["name", "kitchenId", "baseTemplateId", "templateType"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.name !== "string" || !args.name.trim()) return toolError("name é obrigatório")
		if (typeof args.baseTemplateId !== "string" || !args.baseTemplateId.trim()) return toolError("baseTemplateId é obrigatório")
		if (!["weekly", "event"].includes(args.templateType)) return toolError("templateType deve ser 'weekly' ou 'event'")

		const kitchenId = safeInt(args.kitchenId, "kitchenId") // H3
		requireKitchenPermission(ctx, 2, { type: "kitchen", id: kitchenId })

		const baseTemplateId = String(args.baseTemplateId).trim()
		const db = getDataClient()

		// H2: verifica que o usuário tem leitura sobre o template base
		const { err: baseErr } = await resolveTemplateAccess(db, baseTemplateId, ctx, 1)
		if (baseErr) return toolError(baseErr)

		const { data: newTemplate, error: templateError } = await db
			.from("menu_template")
			.insert({
				name: String(args.name).trim(),
				description: args.description ? String(args.description).trim() : null,
				kitchen_id: kitchenId,
				base_template_id: baseTemplateId,
				template_type: args.templateType,
			})
			.select()
			.single()

		if (templateError) return toolError(sanitizeDbError(templateError, "fork_template:insert"))

		// Copiar itens do template base sem headcount_override
		const { data: baseItems, error: itemsError } = await db
			.from("menu_template_items")
			.select("day_of_week, meal_type_id, recipe_id")
			.eq("menu_template_id", baseTemplateId)

		if (itemsError) {
			await db.from("menu_template").delete().eq("id", newTemplate.id)
			return toolError(sanitizeDbError(itemsError, "fork_template:fetch_base_items"))
		}

		if (baseItems && baseItems.length > 0) {
			const forkedItems = baseItems.map((item) => ({
				menu_template_id: newTemplate.id,
				day_of_week: item.day_of_week,
				meal_type_id: item.meal_type_id,
				recipe_id: item.recipe_id,
			}))

			const { error: insertError } = await db.from("menu_template_items").insert(forkedItems)

			if (insertError) {
				// L1: rollback — remover o template criado
				await db.from("menu_template").delete().eq("id", newTemplate.id)
				return toolError(sanitizeDbError(insertError, "fork_template:insert_items"))
			}
		}

		return toolResult(newTemplate)
	},
}

// ---------------------------------------------------------------------------
// update_template  [ownership via resolveTemplateAccess, level 2]
// ---------------------------------------------------------------------------

const updateTemplate: ToolDefinition = {
	schema: {
		name: "update_template",
		description:
			"Atualiza metadados de um template e, opcionalmente, substitui TODOS os seus itens (delete-all + re-insert). Se items for omitido, apenas os metadados são atualizados. Se items=[] vazio, todos os itens são removidos.",
		inputSchema: {
			type: "object",
			properties: {
				templateId: { type: "string", description: "ID (UUID) do template" },
				name: { type: "string", description: "Novo nome (opcional)" },
				description: { type: "string", description: "Nova descrição (opcional)" },
				templateType: { type: "string", enum: ["weekly", "event"], description: "Novo tipo (opcional)" },
				items: {
					type: "array",
					description: "Se fornecido, substitui TODOS os itens existentes. Cada item: { dayOfWeek, mealTypeId, recipeId, headcountOverride? }",
					items: {
						type: "object",
						properties: {
							dayOfWeek: { type: "number" },
							mealTypeId: { type: "string" },
							recipeId: { type: "string" },
							headcountOverride: { type: "number" },
						},
						required: ["dayOfWeek", "mealTypeId", "recipeId"],
					},
				},
			},
			required: ["templateId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.templateId !== "string" || !args.templateId.trim()) {
			return toolError("templateId é obrigatório e deve ser uma string (UUID)")
		}

		const templateId = String(args.templateId).trim()
		const db = getDataClient()

		const { err } = await resolveTemplateAccess(db, templateId, ctx, 2)
		if (err) return toolError(err)

		const updates: Record<string, unknown> = {}
		if (args.name != null) updates.name = String(args.name).trim()
		if (args.description != null) updates.description = String(args.description)
		if (args.templateType != null) {
			if (!["weekly", "event"].includes(args.templateType)) return toolError("templateType deve ser 'weekly' ou 'event'")
			updates.template_type = args.templateType
		}

		const { data: result, error: updateError } = await db
			.from("menu_template")
			// biome-ignore lint/suspicious/noExplicitAny: dynamic update object — keys validated above
			.update(updates as any)
			.eq("id", templateId)
			.select()
			.single()
		if (updateError) return toolError(sanitizeDbError(updateError, "update_template:metadata"))

		// Substituição destrutiva de itens (só se items foi explicitamente fornecido)
		if (args.items !== undefined) {
			const { error: deleteError } = await db.from("menu_template_items").delete().eq("menu_template_id", templateId)
			if (deleteError) return toolError(sanitizeDbError(deleteError, "update_template:delete_items"))

			const items: unknown[] = Array.isArray(args.items) ? args.items : []
			if (items.length > 0) {
				// biome-ignore lint/suspicious/noExplicitAny: items come from tool args — shape validated below
				const templateItems = (items as any[]).map((item: Record<string, unknown>) => ({
					menu_template_id: templateId,
					day_of_week: safeInt(item.dayOfWeek, "dayOfWeek"),
					meal_type_id: String(item.mealTypeId),
					recipe_id: String(item.recipeId),
					...(item.headcountOverride != null && { headcount_override: safeInt(item.headcountOverride, "headcountOverride") }),
				}))

				const { error: insertError } = await db.from("menu_template_items").insert(templateItems)
				if (insertError) return toolError(sanitizeDbError(insertError, "update_template:insert_items"))
			}
		}

		return toolResult(result)
	},
}

// ---------------------------------------------------------------------------
// delete_template  [ownership via resolveTemplateAccess, level 2]
// ---------------------------------------------------------------------------

const deleteTemplate: ToolDefinition = {
	schema: {
		name: "delete_template",
		description: "Soft-delete de um template (define deleted_at). Os itens são preservados e o template pode ser recuperado com restore_template.",
		inputSchema: {
			type: "object",
			properties: {
				templateId: { type: "string", description: "ID (UUID) do template" },
			},
			required: ["templateId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.templateId !== "string" || !args.templateId.trim()) {
			return toolError("templateId é obrigatório e deve ser uma string (UUID)")
		}

		const templateId = String(args.templateId).trim()
		const db = getDataClient()

		const { err } = await resolveTemplateAccess(db, templateId, ctx, 2)
		if (err) return toolError(err)

		const { error } = await db.from("menu_template").update({ deleted_at: new Date().toISOString() }).eq("id", templateId)
		if (error) return toolError(sanitizeDbError(error, "delete_template"))
		return toolResult({ success: true, templateId, message: "Template removido (pode ser restaurado com restore_template)" })
	},
}

// ---------------------------------------------------------------------------
// restore_template  (busca sem filtro deleted_at — template já está deletado)
// ---------------------------------------------------------------------------

const restoreTemplate: ToolDefinition = {
	schema: {
		name: "restore_template",
		description: "Restaura um template soft-deleted, limpando deleted_at. Use list_deleted_templates para obter os IDs disponíveis.",
		inputSchema: {
			type: "object",
			properties: {
				templateId: { type: "string", description: "ID (UUID) do template a restaurar" },
			},
			required: ["templateId"],
		},
	},
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)

		if (typeof args.templateId !== "string" || !args.templateId.trim()) {
			return toolError("templateId é obrigatório e deve ser uma string (UUID)")
		}

		const templateId = String(args.templateId).trim()
		const db = getDataClient()

		// Busca sem filtro de deleted_at para encontrar templates removidos
		const { data: template, error: fetchError } = await db.from("menu_template").select("id, kitchen_id, deleted_at").eq("id", templateId).single()

		if (fetchError || !template) return toolError("Template não encontrado")
		if (!template.deleted_at) return toolError("Este template não está removido")

		if (template.kitchen_id !== null) {
			requireKitchenPermission(ctx, 2, { type: "kitchen", id: template.kitchen_id })
		} else {
			requireKitchenPermission(ctx, 2)
		}

		const { error } = await db.from("menu_template").update({ deleted_at: null }).eq("id", templateId)
		if (error) return toolError(sanitizeDbError(error, "restore_template"))
		return toolResult({ success: true, templateId, message: "Template restaurado com sucesso" })
	},
}

// ---------------------------------------------------------------------------
// apply_template  [H2: ownership via resolveTemplateAccess + L1 rollback]
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
	async handler(args, credential) {
		const ctx = await resolveCredential(credential)
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

		requireValidDates(...args.targetDates) // M4
		const targetDates: string[] = args.targetDates.map((d: unknown) => String(d).trim())

		const db = getDataClient()

		// H2: verifica leitura no template + que não está deletado
		const { template, err: templateErr } = await resolveTemplateAccess(db, templateId, ctx, 1)
		if (templateErr) return toolError(templateErr)
		if (template?.deleted_at !== null) return toolError("Este template foi removido e não pode ser aplicado")

		if (template?.kitchen_id !== null && template?.kitchen_id !== kitchenId) {
			return toolError("Permissão insuficiente: este template pertence a outra cozinha e não pode ser aplicado aqui")
		}

		// 1. Buscar itens do template
		const { data: templateItems, error: fetchError } = await db
			.from("menu_template_items")
			.select("*, recipe_origin:recipe_id(*)")
			.eq("menu_template_id", templateId)

		if (fetchError || !templateItems) {
			return toolError(sanitizeDbError(fetchError ?? new Error("template sem itens"), "apply_template:fetch_items"))
		}

		// 2. Soft-delete dos menus existentes (guarda IDs para rollback)
		const { data: deletedMenus, error: deleteError } = await db
			.from("daily_menu")
			.update({ deleted_at: new Date().toISOString() })
			.in("service_date", targetDates)
			.eq("kitchen_id", kitchenId)
			.select("id")

		if (deleteError) return toolError(sanitizeDbError(deleteError, "apply_template:delete_existing"))

		async function rollbackDeletedMenus(): Promise<void> {
			if (!deletedMenus?.length) return
			const ids = deletedMenus.map((m) => m.id)
			await db.from("daily_menu").update({ deleted_at: null }).in("id", ids)
		}

		// 3. Gerar novos menus e itens para cada data
		const newMenus: Array<{ id: string; service_date: string; meal_type_id: string; kitchen_id: number; status: string }> = []
		const newMenuItems: Array<{ daily_menu_id: string; recipe_origin_id: string; recipe: unknown }> = []

		for (const dateStr of targetDates) {
			const jsDay = new Date(dateStr).getDay()
			const dateDayOfWeek = jsDay === 0 ? 7 : jsDay
			const templateDay = ((dateDayOfWeek - startDayOfWeek + 7) % 7) + 1

			const itemsByMealType: Record<string, typeof templateItems> = {}
			for (const item of templateItems.filter((i) => i.day_of_week === templateDay)) {
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

		// 4. Inserir menus (com rollback L1)
		if (newMenus.length > 0) {
			const { error: menuInsertError } = await db.from("daily_menu").insert(newMenus)
			if (menuInsertError) {
				await rollbackDeletedMenus()
				return toolError(sanitizeDbError(menuInsertError, "apply_template:insert_menus"))
			}
		}

		// 5. Inserir itens (com rollback duplo L1)
		if (newMenuItems.length > 0) {
			const { error: itemInsertError } = await db.from("menu_items").insert(newMenuItems)
			if (itemInsertError) {
				await db
					.from("daily_menu")
					.delete()
					.in(
						"id",
						newMenus.map((m) => m.id)
					)
				await rollbackDeletedMenus()
				return toolError(sanitizeDbError(itemInsertError, "apply_template:insert_items"))
			}
		}

		return toolResult({ success: true, menusCreated: newMenus.length, itemsCreated: newMenuItems.length, datesProcessed: targetDates })
	},
}

// ---------------------------------------------------------------------------
// Exportação
// ---------------------------------------------------------------------------

export const templateTools: ToolDefinition[] = [
	listMenuTemplates,
	listDeletedTemplates,
	getTemplate,
	getTemplateItems,
	createTemplate,
	createBlankTemplate,
	forkTemplate,
	updateTemplate,
	deleteTemplate,
	restoreTemplate,
	applyTemplate,
]
