/**
 * Leituras do `describeChatActionFn` — o mínimo para trocar UUID por nome no cartão de
 * aprovação do chat. Service-role via `@iefa/supabase-kit` (`getServerClient`), criado por
 * chamada; quem decide o que pode ser lido é `describeChatAction`, com PBAC e escopo da rota.
 *
 * Linha apagada (`deleted_at`) conta como inexistente: a tool não age sobre ela.
 */

import { getCoreClient, getKitchenClient, getProcurementClient } from "@/lib/supabase.server"
import type { ChatActionReader, DailyMenuView } from "./describe-action"

export function createChatActionReader(): ChatActionReader {
	const kitchen = getKitchenClient()
	const core = getCoreClient()
	const procurement = getProcurementClient()

	const kitchenName = async (id: number | null): Promise<string | null> => {
		if (id == null) return null
		const { data, error } = await kitchen.from("kitchen").select("display_name").eq("id", id).maybeSingle()
		if (error) throw error
		return data?.display_name ?? null
	}

	const mealTypeName = async (id: string | null): Promise<string | null> => {
		if (!id) return null
		const { data, error } = await kitchen.from("meal_type").select("name").eq("id", id).maybeSingle()
		if (error) throw error
		return data?.name ?? null
	}

	return {
		async recipe(id) {
			const { data, error } = await kitchen.from("recipes").select("name, kitchen_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			return data ? { name: data.name, kitchenId: data.kitchen_id } : null
		},

		async kitchen(id) {
			const { data, error } = await kitchen.from("kitchen").select("display_name").eq("id", id).maybeSingle()
			if (error) throw error
			return data ? { name: data.display_name } : null
		},

		async mealType(id) {
			const { data, error } = await kitchen.from("meal_type").select("name, kitchen_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			return data ? { name: data.name, kitchenId: data.kitchen_id } : null
		},

		async dailyMenu(id): Promise<DailyMenuView | null> {
			const { data, error } = await kitchen
				.from("daily_menu")
				.select("service_date, meal_type_id, kitchen_id, forecasted_headcount")
				.eq("id", id)
				.is("deleted_at", null)
				.maybeSingle()
			if (error) throw error
			if (!data) return null
			const [kitchenDisplayName, mealName] = await Promise.all([kitchenName(data.kitchen_id), mealTypeName(data.meal_type_id)])
			return {
				serviceDate: data.service_date,
				mealTypeName: mealName,
				kitchenId: data.kitchen_id,
				kitchenName: kitchenDisplayName,
				forecastedHeadcount: data.forecasted_headcount,
			}
		},

		async menuItem(id) {
			const { data, error } = await kitchen.from("menu_items").select("recipe, daily_menu_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			if (!data) return null
			// O item guarda o snapshot da receita; o nome mostrado é o que está no cardápio.
			const snapshot = data.recipe as { name?: unknown } | null
			return { recipeName: typeof snapshot?.name === "string" ? snapshot.name : null, dailyMenuId: data.daily_menu_id }
		},

		async template(id) {
			const { data, error } = await kitchen.from("menu_template").select("name, kitchen_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			return data ? { name: data.name, kitchenId: data.kitchen_id } : null
		},

		async quantityEstimate(id) {
			const { data, error } = await procurement.from("quantity_estimate").select("title, status, unit_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			if (!data) return null
			const { data: unit, error: unitError } = await core.from("units").select("display_name, code").eq("id", data.unit_id).maybeSingle()
			if (unitError) throw unitError
			return { title: data.title, status: data.status, unitId: data.unit_id, unitName: unit?.display_name ?? unit?.code ?? null }
		},
	}
}
