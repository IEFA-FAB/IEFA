import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { toast } from "sonner"
import supabase from "@/lib/supabase"
import type { DailyMenuInsert, DailyMenuWithItems, MenuItemInsert } from "@/types/domain/planning"

// --- Query Options ---

export const dailyMenusQueryOptions = (kitchenId: number | null, startDate: Date, endDate: Date) =>
	queryOptions({
		queryKey: ["planning", "menus", kitchenId, startDate.toISOString(), endDate.toISOString()],
		queryFn: async () => {
			if (!kitchenId) return []

			const { data, error } = await supabase
				.from("daily_menu")
				.select(`
        *,
        meal_type:meal_type_id(*),
        menu_items:menu_items(
          *,
          recipe_origin:recipe_origin_id(*)
        )
      `)
				.eq("kitchen_id", kitchenId)
				.gte("service_date", format(startDate, "yyyy-MM-dd"))
				.lte("service_date", format(endDate, "yyyy-MM-dd"))
				.is("deleted_at", null)

			if (error) throw error

			// Filter deleted menu_items on the client side
			const filtered =
				data?.map((menu) => ({
					...menu,
					menu_items: (menu.menu_items || []).filter((item: any) => !item.deleted_at),
				})) || []

			return filtered as DailyMenuWithItems[]
		},
		enabled: !!kitchenId,
	})

export const dayDetailsQueryOptions = (kitchenId: number | null, date: Date) =>
	queryOptions({
		queryKey: ["planning", "day", kitchenId, date.toISOString()],
		queryFn: async () => {
			if (!kitchenId) return []

			const dateStr = format(date, "yyyy-MM-dd")
			const { data, error } = await supabase
				.from("daily_menu")
				.select(`
        *,
        meal_type:meal_type_id(*),
        menu_items:menu_items(
          *,
          recipe_origin:recipe_origin_id(*)
        )
      `)
				.eq("kitchen_id", kitchenId)
				.eq("service_date", dateStr)
				.is("deleted_at", null)

			if (error) throw error

			// Filter deleted menu_items on the client side
			const filtered =
				data?.map((menu) => ({
					...menu,
					menu_items: (menu.menu_items || []).filter((item: any) => !item.deleted_at),
				})) || []

			return filtered as DailyMenuWithItems[]
		},
		enabled: !!kitchenId,
	})

// --- Hooks ---

export function useDailyMenus(kitchenId: number | null, startDate: Date, endDate: Date) {
	return useQuery(dailyMenusQueryOptions(kitchenId, startDate, endDate))
}

export function useDayDetails(kitchenId: number | null, date: Date) {
	return useQuery(dayDetailsQueryOptions(kitchenId, date))
}

export function useCreateDailyMenu() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (menus: DailyMenuInsert[]) => {
			// Use upsert to handle conflicts gracefully
			const { data, error } = await supabase
				.from("daily_menu")
				.upsert(menus, {
					onConflict: "service_date,meal_type_id,kitchen_id",
					ignoreDuplicates: true,
				})
				.select()

			if (error) throw error
			return data
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning", "menus"] })
			queryClient.invalidateQueries({ queryKey: ["planning", "day"] })
			toast.success("Cardápio diário criado com sucesso!")
		},
		onError: (error) => {
			toast.error(`Erro ao criar cardápio: ${error.message}`)
		},
	})
}

export function useAddMenuItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (item: MenuItemInsert) => {
			const { data, error } = await supabase.from("menu_items").insert(item).select()

			if (error) throw error
			return data
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning", "menus"] })
			queryClient.invalidateQueries({ queryKey: ["planning", "day"] })
			toast.success("Item adicionado ao cardápio!")
		},
		onError: (error) => {
			toast.error(`Erro ao adicionar item: ${error.message}`)
		},
	})
}

export function useUpdateDailyMenu() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			updates,
		}: {
			id: string
			updates: Partial<{
				forecasted_headcount: number | null
			}>
		}) => {
			const { data, error } = await supabase
				.from("daily_menu")
				.update(updates)
				.eq("id", id)
				.select()

			if (error) throw error
			return data
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning", "menus"] })
			queryClient.invalidateQueries({ queryKey: ["planning", "day"] })
			toast.success("Cardápio atualizado!")
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar cardápio: ${error.message}`)
		},
	})
}

export function useUpdateMenuItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			updates,
		}: {
			id: string
			updates: Partial<{
				planned_portion_quantity: number | null
				excluded_from_procurement: number | null
			}>
		}) => {
			const { data, error } = await supabase
				.from("menu_items")
				.update(updates)
				.eq("id", id)
				.select()

			if (error) throw error
			return data
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning", "menus"] })
			queryClient.invalidateQueries({ queryKey: ["planning", "day"] })
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar item: ${error.message}`)
		},
	})
}

export function useDeleteMenuItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (itemId: string) => {
			const { error } = await supabase
				.from("menu_items")
				.update({ deleted_at: new Date().toISOString() })
				.eq("id", itemId)

			if (error) throw error
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning", "menus"] })
			queryClient.invalidateQueries({ queryKey: ["planning", "day"] })
			toast.success("Item removido!")
		},
		onError: (error) => {
			toast.error(`Erro ao remover item: ${error.message}`)
		},
	})
}

// --- Templates ---

export function useTemplates(kitchenId: number | null) {
	return useQuery({
		queryKey: ["planning", "templates", kitchenId],
		queryFn: async () => {
			if (!kitchenId) return []
			const { data, error } = await supabase
				.from("menu_template")
				.select(`
                    *,
                    items:menu_template_items(
                        *,
                        recipe_origin:recipe_origin_id(*)
                    )
                `)
				.eq("kitchen_id", kitchenId)

			if (error) throw error
			return data // Typed as any/implied for now
		},
		enabled: !!kitchenId,
	})
}

export function useApplyTemplate() {
	return useMutation({
		mutationFn: async ({
			templateId,
			targetDates,
		}: {
			templateId: string
			targetDates: Date[]
			kitchenId: number
		}) => {
			// TODO: Implement backend logic (RPC) to apply template
			// This is a placeholder for Phase 5 frontend integration
			console.log("Applying template", templateId, "to dates", targetDates)

			// Artificial delay
			await new Promise((resolve) => setTimeout(resolve, 1000))

			return true
		},
		onError: (_error) => {
			toast.error("Erro ao aplicar template")
		},
	})
}

// --- Trash ---

export function useTrashItems(kitchenId: number | null) {
	return useQuery({
		queryKey: ["planning", "trash", kitchenId],
		queryFn: async () => {
			if (!kitchenId) return []
			const { data, error } = await supabase
				.from("menu_items")
				.select(`
                    *,
                    recipe_origin:recipe_origin_id(*),
                    daily_menu!inner(*)
                `)
				.not("deleted_at", "is", null)
				.eq("daily_menu.kitchen_id", kitchenId)
				.order("deleted_at", { ascending: false })

			if (error) throw error
			return data
		},
		enabled: !!kitchenId,
	})
}

export function useRestoreMenuItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (itemId: string) => {
			const { error } = await supabase
				.from("menu_items")
				.update({ deleted_at: null })
				.eq("id", itemId)

			if (error) throw error
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning"] })
			toast.success("Item restaurado com sucesso!")
		},
		onError: (error) => {
			toast.error(`Erro ao restaurar item: ${error.message}`)
		},
	})
}
