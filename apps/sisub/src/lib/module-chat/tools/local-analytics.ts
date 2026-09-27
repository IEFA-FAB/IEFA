/**
 * Local Analytics module tools — unit dashboard, anexos quantitativos do TR, ARPs, cozinhas, cardápios.
 * Read-only: no write operations. Scoped to the current unit via ctx.scopeId.
 *
 * Só `daily_menu` mora no schema `kitchen` (o default do client do chat). Unidade e cozinha
 * estão em `core`, anexo e ARP em `procurement` — daí o schema explícito em cada `untypedFrom`.
 */

import { clampLimit } from "@iefa/sisub-domain/agent"
import type { ModuleToolDefinition } from "./shared"
import { requireModulePermission, safeInt, sanitizeDbError, toolErr, toolOk, untypedFrom } from "./shared"
import { listQuantityEstimates } from "./unit"

/** Teto das listagens: o resultado volta inteiro no prompt do turno seguinte. */
const LIST_DEFAULT = 25
const LIST_MAX = 100

function requireCurrentUnitId(ctx: Parameters<ModuleToolDefinition["handler"]>[1]): number {
	const unitId = safeInt(ctx.scopeId, "scopeId")
	requireModulePermission(ctx, "local-analytics", 1, { type: "unit", id: unitId })
	return unitId
}

const getUnitOverview: ModuleToolDefinition = {
	name: "get_unit_overview",
	description: "Retorna informações gerais da unidade atual: nome, código, UASG e lista de cozinhas vinculadas.",
	parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
	requiredLevel: 1,
	async handler(_args, ctx) {
		const unitId = requireCurrentUnitId(ctx)

		const { data: unit, error: unitError } = await untypedFrom(ctx, "units", "core").select("id, code, display_name, uasg").eq("id", unitId).single()
		if (unitError) return toolErr(sanitizeDbError(unitError, "get_unit_overview:unit"))

		const { data: kitchens, error: kitchensError } = await untypedFrom(ctx, "kitchen", "core")
			.select("id, display_name, type")
			.eq("unit_id", unitId)
			.order("id")
		if (kitchensError) return toolErr(sanitizeDbError(kitchensError, "get_unit_overview:kitchens"))

		return toolOk({ unit, kitchens: kitchens ?? [] })
	},
}

const getLowBalanceItems: ModuleToolDefinition = {
	name: "get_low_balance_items",
	description:
		"Lista itens de ARP com consumo ≥80% (saldo crítico) para os anexos quantitativos concluídos (status completed) da unidade, os mais críticos primeiro. Inclui flag se o item aparece em menus dos próximos 30 dias.",
	parameters: {
		type: "object",
		properties: {
			limit: { type: "number", description: `Quantos itens retornar (padrão ${LIST_DEFAULT}, máximo ${LIST_MAX})` },
		},
		required: [],
		additionalProperties: false,
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = requireCurrentUnitId(ctx)
		const limit = clampLimit(args.limit, LIST_DEFAULT, LIST_MAX)

		// Anexos concluídos
		const { data: completedQuantityEstimates, error: quantityEstimatesError } = await untypedFrom(ctx, "quantity_estimate", "procurement")
			.select("id, title")
			.eq("unit_id", unitId)
			.eq("status", "completed")
			.is("deleted_at", null)
		if (quantityEstimatesError) return toolErr(sanitizeDbError(quantityEstimatesError, "get_low_balance_items:quantity_estimates"))

		const completedQuantityEstimateIds = (completedQuantityEstimates ?? []).map((a: { id: string }) => a.id)
		if (completedQuantityEstimateIds.length === 0) return toolOk({ message: "Nenhum anexo quantitativo concluído encontrado.", items: [] })

		// ARPs vinculadas aos anexos concluídos
		const { data: arps, error: arpsError } = await untypedFrom(ctx, "arp", "procurement")
			.select("id, quantity_estimate_id, numero_ata, ano_ata, data_vigencia_fim")
			.in("quantity_estimate_id", completedQuantityEstimateIds)
		if (arpsError) return toolErr(sanitizeDbError(arpsError, "get_low_balance_items:arps"))

		const arpsData = arps ?? []
		if (arpsData.length === 0) return toolOk({ message: "Nenhuma ARP vinculada aos anexos quantitativos concluídos.", items: [] })

		const arpIds = arpsData.map((a: { id: string }) => a.id)
		const quantityEstimateIdToTitle = new Map((completedQuantityEstimates ?? []).map((a: { id: string; title: string }) => [a.id, a.title]))
		const arpById = new Map(arpsData.map((a: { id: string }) => [a.id, a]))

		// ARP items
		const { data: arpItems, error: itemsError } = await untypedFrom(ctx, "arp_item", "procurement")
			.select(
				"id, arp_id, numero_item, catmat_item_codigo, descricao_item, quantidade_homologada, quantidade_empenhada, saldo_empenho, valor_unitario, medida_catmat, quantity_estimate_item_id"
			)
			.in("arp_id", arpIds)
		if (itemsError) return toolErr(sanitizeDbError(itemsError, "get_low_balance_items:items"))

		// Filter ≥80% consumed
		const critical = (arpItems ?? []).filter((item: { quantidade_homologada: number | null; quantidade_empenhada: number | null }) => {
			const homologada = Number(item.quantidade_homologada ?? 0)
			const empenhada = Number(item.quantidade_empenhada ?? 0)
			return homologada > 0 && empenhada / homologada >= 0.8
		})

		// Upcoming menus (next 30 days) for ingredient annotation.
		// Erro aqui não pode virar ausência: `in_upcoming_menu: false` em todos os itens é
		// uma afirmação ("nenhum item crítico entra em cardápio"), não um silêncio.
		const upcomingIngredientIds = new Set<string>()
		const { data: kitchens, error: kitchensError } = await untypedFrom(ctx, "kitchen", "core").select("id").eq("unit_id", unitId)
		if (kitchensError) return toolErr(sanitizeDbError(kitchensError, "get_low_balance_items:kitchens"))
		const kitchenIds = (kitchens ?? []).map((k: { id: number }) => k.id)

		if (kitchenIds.length > 0) {
			const today = new Date().toISOString().substring(0, 10)
			const future = new Date(Date.now() + 30 * 86_400_000).toISOString().substring(0, 10)
			const { data: menus, error: menusError } = await untypedFrom(ctx, "daily_menu")
				.select("id, menu_items(id, deleted_at, recipe_origin:recipe_origin_id(recipe_ingredients(ingredient_id)))")
				.in("kitchen_id", kitchenIds)
				.gte("service_date", today)
				.lte("service_date", future)
				.is("deleted_at", null)

			if (menusError) return toolErr(sanitizeDbError(menusError, "get_low_balance_items:menus"))

			for (const menu of menus ?? []) {
				for (const menuItem of menu.menu_items ?? []) {
					if (menuItem.deleted_at) continue
					const recipeOrigin = Array.isArray(menuItem.recipe_origin) ? menuItem.recipe_origin[0] : menuItem.recipe_origin
					for (const ing of recipeOrigin?.recipe_ingredients ?? []) {
						if (ing.ingredient_id) upcomingIngredientIds.add(ing.ingredient_id)
					}
				}
			}
		}

		// Insumo de cada item do anexo, para a anotação
		const quantityEstimateItemIds = critical.map((i: { quantity_estimate_item_id: string | null }) => i.quantity_estimate_item_id).filter(Boolean)
		const ingredientMap = new Map<string, { ingredient_id: string | null; ingredient_name: string | null }>()
		if (quantityEstimateItemIds.length > 0) {
			const { data: quantityEstimateItems, error: quantityEstimateItemsError } = await untypedFrom(ctx, "quantity_estimate_item", "procurement")
				.select("id, ingredient_id, ingredient_name")
				.in("id", quantityEstimateItemIds)
			if (quantityEstimateItemsError) return toolErr(sanitizeDbError(quantityEstimateItemsError, "get_low_balance_items:quantity_estimate_items"))
			for (const ai of quantityEstimateItems ?? []) {
				ingredientMap.set(ai.id, { ingredient_id: ai.ingredient_id, ingredient_name: ai.ingredient_name })
			}
		}

		const items = critical.map(
			(item: {
				id: string
				arp_id: string
				quantity_estimate_item_id: string | null
				numero_item: number | null
				catmat_item_codigo: number | null
				descricao_item: string | null
				quantidade_homologada: number | null
				quantidade_empenhada: number | null
				saldo_empenho: number | null
				valor_unitario: number | null
				medida_catmat: string | null
			}) => {
				const arp = arpById.get(item.arp_id) as
					| { quantity_estimate_id: string; numero_ata: string; ano_ata: string | null; data_vigencia_fim: string | null }
					| undefined
				const quantityEstimateItem = item.quantity_estimate_item_id ? ingredientMap.get(item.quantity_estimate_item_id) : undefined
				const homologada = Number(item.quantidade_homologada ?? 0)
				const empenhada = Number(item.quantidade_empenhada ?? 0)
				const consumptionPct = homologada > 0 ? Math.round((empenhada / homologada) * 100) : 0
				const ingredientId = quantityEstimateItem?.ingredient_id ?? null
				return {
					id: item.id,
					descricao: item.descricao_item ?? quantityEstimateItem?.ingredient_name ?? "—",
					catmat: item.catmat_item_codigo,
					medida: item.medida_catmat,
					quantidade_homologada: item.quantidade_homologada,
					quantidade_empenhada: item.quantidade_empenhada,
					saldo_empenho: item.saldo_empenho,
					valor_unitario: item.valor_unitario,
					consumption_pct: consumptionPct,
					arp_numero: arp?.numero_ata ?? "—",
					arp_ano: arp?.ano_ata ?? null,
					arp_vigencia_fim: arp?.data_vigencia_fim ?? null,
					quantity_estimate_title: arp ? (quantityEstimateIdToTitle.get(arp.quantity_estimate_id) ?? "—") : "—",
					in_upcoming_menu: ingredientId ? upcomingIngredientIds.has(ingredientId) : false,
				}
			}
		)

		items.sort((a: { in_upcoming_menu: boolean; consumption_pct: number }, b: { in_upcoming_menu: boolean; consumption_pct: number }) => {
			if (a.in_upcoming_menu !== b.in_upcoming_menu) return a.in_upcoming_menu ? -1 : 1
			return b.consumption_pct - a.consumption_pct
		})

		return toolOk({ total_critical: items.length, returned: Math.min(items.length, limit), limit, items: items.slice(0, limit) })
	},
}

const getUpcomingMenus: ModuleToolDefinition = {
	name: "get_upcoming_menus",
	description: "Retorna cardápios planejados para os próximos dias nas cozinhas da unidade.",
	parameters: {
		type: "object",
		properties: {
			days: { type: "number", description: "Número de dias à frente (padrão: 7, máximo: 30)" },
		},
		required: [],
		additionalProperties: false,
	},
	requiredLevel: 1,
	async handler(args, ctx) {
		const unitId = requireCurrentUnitId(ctx)
		const days = Math.min(Math.max(1, args.days ? safeInt(args.days, "days") : 7), 30)

		const { data: kitchens, error: kitchensError } = await untypedFrom(ctx, "kitchen", "core").select("id, display_name").eq("unit_id", unitId)
		if (kitchensError) return toolErr(sanitizeDbError(kitchensError, "get_upcoming_menus:kitchens"))

		const kitchenIds = (kitchens ?? []).map((k: { id: number }) => k.id)
		if (kitchenIds.length === 0) return toolOk({ message: "Nenhuma cozinha vinculada à unidade.", menus: [] })

		const kitchenNames = new Map((kitchens ?? []).map((k: { id: number; display_name: string | null }) => [k.id, k.display_name ?? String(k.id)]))

		const today = new Date().toISOString().substring(0, 10)
		const future = new Date(Date.now() + days * 86_400_000).toISOString().substring(0, 10)

		const { data: menus, error: menusError } = await untypedFrom(ctx, "daily_menu")
			.select("id, kitchen_id, service_date, meal_type:meal_type_id(name), menu_items(id, deleted_at, recipe_origin:recipe_origin_id(name))")
			.in("kitchen_id", kitchenIds)
			.gte("service_date", today)
			.lte("service_date", future)
			.is("deleted_at", null)
			.order("service_date")
		if (menusError) return toolErr(sanitizeDbError(menusError, "get_upcoming_menus"))

		const result = (menus ?? []).map(
			(m: {
				id: string
				kitchen_id: number
				service_date: string
				meal_type: { name: string } | null
				menu_items: { id: string; deleted_at: string | null; recipe_origin: { name: string } | null }[]
			}) => ({
				service_date: m.service_date,
				kitchen: kitchenNames.get(m.kitchen_id) ?? String(m.kitchen_id),
				meal_type: m.meal_type?.name ?? "—",
				recipes: (m.menu_items ?? []).filter((i) => !i.deleted_at).map((i) => i.recipe_origin?.name ?? "Receita sem nome"),
			})
		)

		return toolOk({ period: `${today} a ${future}`, total_menus: result.length, menus: result })
	},
}

export const localAnalyticsTools: ModuleToolDefinition[] = [getUnitOverview, listQuantityEstimates, getLowBalanceItems, getUpcomingMenus]
