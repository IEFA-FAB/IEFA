import type { MenuTemplateInsert, MenuTemplateItemInsert, MenuTemplateUpdate } from "@iefa/database/sisub"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
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
import type { ApplyTemplatePayload, MenuTemplateWithItems, TemplateWithItemCounts } from "@/types/domain/planning"

// --- Query Options ---

export const menuTemplatesQueryOptions = (kitchenId: number | null) =>
	queryOptions({
		queryKey: ["menu_templates", kitchenId],
		queryFn: () => fetchMenuTemplatesFn({ data: { kitchenId } }) as Promise<TemplateWithItemCounts[]>,
		enabled: kitchenId !== null,
		staleTime: 5 * 60 * 1000,
	})

export const templateItemsQueryOptions = (templateId: string | null) =>
	queryOptions({
		queryKey: ["template_items", templateId],
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
		queryKey: ["template", templateId],
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
		queryKey: ["deleted_templates", kitchenId],
		queryFn: () => fetchDeletedTemplatesFn({ data: { kitchenId } }) as Promise<TemplateWithItemCounts[]>,
		enabled: kitchenId !== null,
		staleTime: 1 * 60 * 1000,
	})
}

// --- Mutation Hooks ---

export function useCreateTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ template, items }: { template: MenuTemplateInsert; items: Omit<MenuTemplateItemInsert, "menu_template_id">[] }) =>
			createTemplateFn({
				data: {
					template: template as Record<string, unknown>,
					items: items as Record<string, unknown>[],
				},
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success(`Template "${data?.name}" criado com sucesso!`)
		},
		onError: (error) => toast.error(`Erro ao criar template: ${error.message}`),
	})
}

export function useUpdateTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ id, updates, items }: { id: string; updates: MenuTemplateUpdate; items?: Omit<MenuTemplateItemInsert, "menu_template_id">[] }) =>
			updateTemplateFn({
				data: {
					id,
					updates: updates as Record<string, unknown>,
					items: items as Record<string, unknown>[] | undefined,
				},
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			queryClient.invalidateQueries({ queryKey: ["template", data?.id] })
			queryClient.invalidateQueries({ queryKey: ["template_items", data?.id] })
			toast.success(`Template "${data?.name}" atualizado!`)
		},
		onError: (error) => toast.error(`Erro ao atualizar template: ${error.message}`),
	})
}

export function useDeleteTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => deleteTemplateFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success("Template removido!")
		},
		onError: (error) => toast.error(`Erro ao remover template: ${error.message}`),
	})
}

export function useRestoreTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => restoreTemplateFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success("Template restaurado!")
		},
		onError: (error) => toast.error(`Erro ao restaurar template: ${error.message}`),
	})
}

export function useApplyTemplate() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ templateId, targetDates, startDayOfWeek, kitchenId }: ApplyTemplatePayload) =>
			applyTemplateFn({ data: { templateId, targetDates, startDayOfWeek, kitchenId } }),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["daily_menus"] })
			queryClient.invalidateQueries({ queryKey: ["planning"] })
			toast.success(`Template aplicado! ${result?.menusCreated} cardápios e ${result?.itemsCreated} items criados.`)
		},
		onError: (error) => toast.error(`Erro ao aplicar template: ${error.message}`),
	})
}
