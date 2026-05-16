import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { toast } from "sonner"
import { queryKeys } from "@/lib/query-keys"
import {
	addMenuItemFn,
	fetchDailyMenusFn,
	fetchDayDetailsFn,
	fetchTrashItemsFn,
	restoreMenuItemFn,
	softDeleteMenuItemFn,
	updateDailyMenuFn,
	updateMenuItemFn,
	upsertDailyMenuFn,
} from "@/server/planning.fn"
import { fetchMenuTemplatesFn } from "@/server/templates.fn"
import type { AppMenuItemInsert, DailyMenuInsert } from "@/types/domain/planning"

// --- Query Options ---

export const dailyMenusQueryOptions = (kitchenId: number | null, startDate: Date, endDate: Date) =>
	queryOptions({
		queryKey: queryKeys.planning.menu(kitchenId, startDate.toISOString(), endDate.toISOString()),
		queryFn: () =>
			fetchDailyMenusFn({
				data: {
					kitchenId: kitchenId as number,
					startDate: format(startDate, "yyyy-MM-dd"),
					endDate: format(endDate, "yyyy-MM-dd"),
				},
			}),
		enabled: !!kitchenId,
	})

export const dayDetailsQueryOptions = (kitchenId: number | null, date: Date) =>
	queryOptions({
		queryKey: queryKeys.planning.dayDetail(kitchenId, date.toISOString()),
		queryFn: () =>
			fetchDayDetailsFn({
				data: {
					kitchenId: kitchenId as number,
					date: format(date, "yyyy-MM-dd"),
				},
			}),
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
			// Domain upserts one menu at a time; iterate (callers typically pass 1 item)
			const results = []
			for (const m of menus) {
				results.push(
					await upsertDailyMenuFn({
						data: {
							kitchenId: m.kitchen_id as number,
							serviceDate: m.service_date as string,
							mealTypeId: m.meal_type_id as string,
							// forecastedHeadcount omitted when 0 (schema requires positive)
							forecastedHeadcount: m.forecasted_headcount && m.forecasted_headcount > 0 ? m.forecasted_headcount : undefined,
						},
					})
				)
			}
			return results
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.menus() })
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.day() })
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
		mutationFn: (item: AppMenuItemInsert) =>
			addMenuItemFn({
				data: {
					dailyMenuId: item.daily_menu_id as string,
					recipeId: item.recipe_origin_id as string,
					plannedPortionQuantity: item.planned_portion_quantity ?? undefined,
					excludedFromProcurement: (item.excluded_from_procurement as 0 | 1 | undefined) ?? undefined,
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.menus() })
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.day() })
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
		mutationFn: ({
			id,
			updates,
		}: {
			id: string
			updates: Partial<{
				forecasted_headcount: number | null
			}>
		}) =>
			updateDailyMenuFn({
				data: {
					dailyMenuId: id,
					forecastedHeadcount: updates.forecasted_headcount ?? 1,
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.menus() })
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.day() })
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
		mutationFn: ({
			id,
			updates,
		}: {
			id: string
			updates: Partial<{
				planned_portion_quantity: number | null
				excluded_from_procurement: number | null
			}>
		}) =>
			updateMenuItemFn({
				data: {
					menuItemId: id,
					plannedPortionQuantity: updates.planned_portion_quantity ?? undefined,
					excludedFromProcurement: (updates.excluded_from_procurement as 0 | 1 | undefined) ?? undefined,
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.menus() })
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.day() })
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar item: ${error.message}`)
		},
	})
}

export function useDeleteMenuItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (itemId: string) => softDeleteMenuItemFn({ data: { menuItemId: itemId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.menus() })
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.day() })
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
		queryKey: queryKeys.planning.templates(kitchenId),
		queryFn: () => fetchMenuTemplatesFn({ data: { kitchenId } }),
		enabled: !!kitchenId,
	})
}

export function useApplyTemplate() {
	return useMutation({
		mutationFn: async (_vars: { templateId: string; targetDates: Date[]; kitchenId: number }) => {
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
		queryKey: queryKeys.planning.trash(kitchenId),
		queryFn: () => fetchTrashItemsFn({ data: { kitchenId: kitchenId as number } }),
		enabled: !!kitchenId,
	})
}

export function useRestoreMenuItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (itemId: string) => restoreMenuItemFn({ data: { menuItemId: itemId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.all() })
			toast.success("Item restaurado com sucesso!")
		},
		onError: (error) => {
			toast.error(`Erro ao restaurar item: ${error.message}`)
		},
	})
}
