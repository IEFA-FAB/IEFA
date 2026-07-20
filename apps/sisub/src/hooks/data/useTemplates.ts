import type { MenuTemplateInsert, MenuTemplateItemInsert, MenuTemplateUpdate } from "@iefa/database/sisub"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { MenuItemGroup } from "@/lib/menu-item-groups"
import { queryKeys } from "@/lib/query-keys"
import {
	applyEventTemplateFn,
	applyTemplateFn,
	createTemplateFn,
	deleteTemplateFn,
	fetchDeletedTemplatesFn,
	fetchMenuTemplatesFn,
	fetchTemplateFn,
	fetchTemplateItemsFn,
	restoreTemplateFn,
	updateTemplateFn,
} from "@/server/templates.fn"
import type { ApplyTemplatePayload, MenuTemplateWithItems, TemplateMealDraft, TemplateWithItemCounts } from "@/types/domain/planning"

// --- Query Options ---

export const menuTemplatesQueryOptions = (kitchenId: number | null) =>
	queryOptions({
		queryKey: queryKeys.templates.list(kitchenId),
		queryFn: () => fetchMenuTemplatesFn({ data: { kitchenId } }) as Promise<TemplateWithItemCounts[]>,
		enabled: kitchenId !== null,
		staleTime: 5 * 60 * 1000,
	})

export const templateItemsQueryOptions = (templateId: string | null) =>
	queryOptions({
		queryKey: queryKeys.templates.items(templateId),
		queryFn: () =>
			templateId
				? (fetchTemplateItemsFn({
						data: { templateId },
					}) as Promise<MenuTemplateWithItems["items"]>)
				: Promise.resolve([]),
		enabled: !!templateId,
		staleTime: 5 * 60 * 1000,
	})

export const templateQueryOptions = (templateId: string | null) =>
	queryOptions({
		queryKey: queryKeys.templates.detail(templateId),
		queryFn: () => (templateId ? (fetchTemplateFn({ data: { templateId } }) as Promise<MenuTemplateWithItems | null>) : Promise.resolve(null)),
		enabled: !!templateId,
	})

// --- Query Hooks ---

export function useMenuTemplates(kitchenId: number | null) {
	return useQuery(menuTemplatesQueryOptions(kitchenId))
}

export function useTemplateItems(templateId: string | null) {
	return useQuery(templateItemsQueryOptions(templateId))
}

export function useTemplate(templateId: string | null) {
	return useQuery(templateQueryOptions(templateId))
}

export function useDeletedTemplates(kitchenId: number | null) {
	return useQuery({
		queryKey: queryKeys.templates.deleted(kitchenId),
		queryFn: () => fetchDeletedTemplatesFn({ data: { kitchenId } }) as Promise<TemplateWithItemCounts[]>,
		enabled: kitchenId !== null,
		staleTime: 1 * 60 * 1000,
	})
}

// --- Mutation Hooks ---

export function useCreateTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({
			template,
			items,
			meals,
		}: {
			template: MenuTemplateInsert
			items: Omit<MenuTemplateItemInsert, "menu_template_id">[]
			meals?: TemplateMealDraft[]
		}) =>
			createTemplateFn({
				data: {
					name: template.name ?? "",
					description: template.description ?? undefined,
					kitchenId: template.kitchen_id ?? null,
					templateType: (template.template_type ?? "weekly") as "weekly" | "event" | "exception",
					expectedMonthlyOccurrences: template.expected_monthly_occurrences ?? null,
					items: items.map((i, index) => ({
						dayOfWeek: i.day_of_week ?? 1,
						mealTypeId: i.meal_type_id ?? "",
						recipeId: i.recipe_id ?? "",
						headcountOverride: i.headcount_override ?? undefined,
						itemGroup: (i.item_group as MenuItemGroup | null | undefined) ?? null,
						sortOrder: i.sort_order ?? index,
						recommendedProportion: i.recommended_proportion ?? null,
					})),
					meals: meals?.map((m) => ({ dayOfWeek: m.day_of_week, mealTypeId: m.meal_type_id, baseHeadcount: m.base_headcount })),
				},
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() })
			toast.success(`Template "${data?.name}" criado com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao criar template: ${error.message}`),
	})
}

export function useUpdateTemplate(options?: { silent?: boolean }) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({
			id,
			updates,
			items,
			meals,
		}: {
			id: string
			updates: MenuTemplateUpdate
			items?: Omit<MenuTemplateItemInsert, "menu_template_id">[]
			meals?: TemplateMealDraft[]
		}) =>
			updateTemplateFn({
				data: {
					templateId: id,
					name: updates.name ?? undefined,
					// Preserva null (limpar) vs undefined (não mexer) — `?? undefined` apagaria o intent de limpar.
					description: updates.description === undefined ? undefined : updates.description,
					templateType: updates.template_type as "weekly" | "event" | "exception" | undefined,
					expectedMonthlyOccurrences: updates.expected_monthly_occurrences === undefined ? undefined : updates.expected_monthly_occurrences,
					items: items?.map((i, index) => ({
						dayOfWeek: i.day_of_week ?? 1,
						mealTypeId: i.meal_type_id ?? "",
						recipeId: i.recipe_id ?? "",
						headcountOverride: i.headcount_override ?? undefined,
						itemGroup: (i.item_group as MenuItemGroup | null | undefined) ?? null,
						sortOrder: i.sort_order ?? index,
						recommendedProportion: i.recommended_proportion ?? null,
					})),
					meals: meals?.map((m) => ({ dayOfWeek: m.day_of_week, mealTypeId: m.meal_type_id, baseHeadcount: m.base_headcount })),
				},
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() })
			queryClient.invalidateQueries({ queryKey: queryKeys.templates.detail(data?.id ?? null) })
			queryClient.invalidateQueries({ queryKey: queryKeys.templates.items(data?.id ?? null) })
			if (!options?.silent) toast.success(`Template "${data?.name}" atualizado!`)
		},
		onError: (error) => {
			if (!options?.silent) toast.error(`Erro ao atualizar template: ${error.message}`)
		},
	})
}

export function useDeleteTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => deleteTemplateFn({ data: { templateId: id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() })
			toast.success("Template removido!")
		},
		onError: (error) => toast.error(`Erro ao remover template: ${error.message}`),
	})
}

export function useRestoreTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => restoreTemplateFn({ data: { templateId: id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() })
			toast.success("Template restaurado!")
		},
		onError: (error) => toast.error(`Erro ao restaurar template: ${error.message}`),
	})
}

export function useApplyEventTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ templateId, kitchenId, dates }: { templateId: string; kitchenId: number; dates: string[] }) =>
			applyEventTemplateFn({ data: { templateId, kitchenId, dates } }),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.dailyMenus.all() })
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.all() })
			queryClient.invalidateQueries({ queryKey: queryKeys.production.all() })
			const dates = result?.datesProcessed?.length ?? 0
			toast.success(`Aplicado ao calendário! ${result?.itemsCreated ?? 0} itens somados em ${dates} ${dates === 1 ? "dia" : "dias"}.`)
		},
		onError: (error) => toast.error(`Erro ao aplicar ao calendário: ${error.message}`),
	})
}

export function useApplyTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ templateId, targetDates, startDayOfWeek, kitchenId, conflictMode }: ApplyTemplatePayload) =>
			applyTemplateFn({ data: { templateId, targetDates, startDayOfWeek, kitchenId, conflictMode } }),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.dailyMenus.all() })
			queryClient.invalidateQueries({ queryKey: queryKeys.planning.all() })
			// itemsSkipped é contado por ocorrência (data×refeição), não por slot único do template.
			const skipped = result?.itemsSkipped ?? 0
			const skippedNote = skipped > 0 ? ` ${skipped} ${skipped === 1 ? "ocorrência ignorada" : "ocorrências ignoradas"} (itens sem refeição ou receita).` : ""
			const preserved = result?.datesSkipped?.length ?? 0
			const preservedNote = preserved > 0 ? ` ${preserved} ${preserved === 1 ? "dia já planejado foi preservado" : "dias já planejados foram preservados"}.` : ""
			toast.success(`Template aplicado! ${result?.menusCreated} cardápios e ${result?.itemsCreated} itens criados.${preservedNote}${skippedNote}`)
		},
		onError: (error) => toast.error(`Erro ao aplicar template: ${error.message}`),
	})
}
