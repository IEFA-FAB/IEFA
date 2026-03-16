import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { toast } from "sonner"
import {
	addMenuItemFn,
	fetchDailyMenusFn,
	fetchDayDetailsFn,
	fetchTemplatesFn,
	fetchTrashItemsFn,
	restoreMenuItemFn,
	softDeleteMenuItemFn,
	updateDailyMenuFn,
	updateMenuItemFn,
	upsertDailyMenuFn,
} from "@/server/planning.fn"
import type { DailyMenuInsert, MenuItemInsert } from "@/types/domain/planning"

// --- Query Options ---

export const dailyMenusQueryOptions = (kitchenId: number | null, startDate: Date, endDate: Date) =>
	queryOptions({
		queryKey: ["planning", "menus", kitchenId, startDate.toISOString(), endDate.toISOString()],
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
		queryKey: ["planning", "day", kitchenId, date.toISOString()],
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
		mutationFn: (menus: DailyMenuInsert[]) => upsertDailyMenuFn({ data: { menus: menus as Record<string, unknown>[] } }),
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
		mutationFn: (item: MenuItemInsert) => addMenuItemFn({ data: { item: item as Record<string, unknown> } }),
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
		mutationFn: ({
			id,
			updates,
		}: {
			id: string
			updates: Partial<{
				forecasted_headcount: number | null
			}>
		}) => updateDailyMenuFn({ data: { id, updates } }),
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
		mutationFn: ({
			id,
			updates,
		}: {
			id: string
			updates: Partial<{
				planned_portion_quantity: number | null
				excluded_from_procurement: number | null
			}>
		}) => updateMenuItemFn({ data: { id, updates } }),
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
		mutationFn: (itemId: string) => softDeleteMenuItemFn({ data: { id: itemId } }),
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
		queryFn: () => fetchTemplatesFn({ data: { kitchenId: kitchenId as number } }),
		enabled: !!kitchenId,
	})
}

export function useApplyTemplate() {
	return useMutation({
		mutationFn: async ({ templateId, targetDates }: { templateId: string; targetDates: Date[]; kitchenId: number }) => {
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
		queryFn: () => fetchTrashItemsFn({ data: { kitchenId: kitchenId as number } }),
		enabled: !!kitchenId,
	})
}

export function useRestoreMenuItem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (itemId: string) => restoreMenuItemFn({ data: { id: itemId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["planning"] })
			toast.success("Item restaurado com sucesso!")
		},
		onError: (error) => {
			toast.error(`Erro ao restaurar item: ${error.message}`)
		},
	})
}
