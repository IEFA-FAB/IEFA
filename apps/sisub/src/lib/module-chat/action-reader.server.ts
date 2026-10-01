/**
 * Leituras do `describeChatActionFn` — o mínimo para trocar UUID por nome no cartão de
 * aprovação do chat. Service-role via `@iefa/supabase-kit` (`getServerClient`), criado por
 * chamada; quem decide o que pode ser lido é `describeChatAction`, com PBAC e escopo da rota.
 *
 * Linha apagada (`deleted_at`) conta como inexistente: a tool não age sobre ela.
 */

import { getCoreClient, getKitchenClient, getProcurementClient } from "@/lib/supabase.server"
import type { ChatActionReader, DailyMenuView, MealTypeView } from "./describe-action"

export function createChatActionReader(): ChatActionReader {
	const kitchen = getKitchenClient()
	const core = getCoreClient()
	const procurement = getProcurementClient()

	return {
		async findRecipe(id) {
			const { data, error } = await kitchen.from("recipes").select("name, kitchen_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			return data ? { name: data.name, kitchenId: data.kitchen_id } : null
		},

		async findKitchen(id) {
			const { data, error } = await kitchen.from("kitchen").select("display_name").eq("id", id).maybeSingle()
			if (error) throw error
			return data ? { name: data.display_name } : null
		},

		async findMealTypes(ids) {
			const views = new Map<string, MealTypeView>()
			if (ids.length === 0) return views
			const { data, error } = await kitchen
				.from("meal_type")
				.select("id, name, kitchen_id")
				.in("id", [...ids])
				.is("deleted_at", null)
			if (error) throw error
			for (const row of data ?? []) views.set(row.id, { name: row.name, kitchenId: row.kitchen_id })
			return views
		},

		async findDailyMenu(id): Promise<DailyMenuView | null> {
			// Uma consulta só: cozinha e refeição vêm pelas FKs do cardápio. O nome da refeição não
			// filtra `deleted_at` de propósito — o cardápio que já existe continua com o nome dela.
			const { data, error } = await kitchen
				.from("daily_menu")
				.select("service_date, kitchen_id, forecasted_headcount, kitchen:kitchen_id(display_name), meal_type:meal_type_id(name)")
				.eq("id", id)
				.is("deleted_at", null)
				.maybeSingle()
			if (error) throw error
			if (!data) return null
			return {
				serviceDate: data.service_date,
				mealTypeName: data.meal_type?.name ?? null,
				kitchenId: data.kitchen_id,
				kitchenName: data.kitchen?.display_name ?? null,
				forecastedHeadcount: data.forecasted_headcount,
			}
		},

		async findMenuItem(id) {
			const { data, error } = await kitchen.from("menu_items").select("recipe, daily_menu_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			if (!data) return null
			// O item guarda o snapshot da receita; o nome mostrado é o que está no cardápio.
			const snapshot = data.recipe as { name?: unknown } | null
			return { recipeName: typeof snapshot?.name === "string" ? snapshot.name : null, dailyMenuId: data.daily_menu_id }
		},

		async findTemplate(id) {
			const { data, error } = await kitchen.from("menu_template").select("name, kitchen_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			return data ? { name: data.name, kitchenId: data.kitchen_id } : null
		},

		async findQuantityEstimate(id) {
			const { data, error } = await procurement.from("quantity_estimate").select("title, status, unit_id").eq("id", id).is("deleted_at", null).maybeSingle()
			if (error) throw error
			if (!data) return null
			const { data: unit, error: unitError } = await core.from("units").select("display_name, code").eq("id", data.unit_id).maybeSingle()
			if (unitError) throw unitError
			return { title: data.title, status: data.status, unitId: data.unit_id, unitName: unit?.display_name ?? unit?.code ?? null }
		},
	}
}
