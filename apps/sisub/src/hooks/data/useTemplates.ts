import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import supabase from "@/lib/supabase"
import type {
	ApplyTemplatePayload,
	MenuTemplateWithItems,
	TemplateWithItemCounts,
} from "@/types/domain/planning"
import type {
	MenuTemplateInsert,
	MenuTemplateItemInsert,
	MenuTemplateUpdate,
} from "@/types/supabase.types"

// --- Query Options ---

/**
 * Query options para buscar templates disponíveis
 * Retorna templates globais (kitchen_id NULL) + templates da kitchen específica
 */
export const menuTemplatesQueryOptions = (kitchenId: number | null) =>
	queryOptions({
		queryKey: ["menu_templates", kitchenId],
		queryFn: async (): Promise<TemplateWithItemCounts[]> => {
			let query = supabase
				.from("menu_template")
				.select(
					`
          *,
          items:menu_template_items(count)
        `,
					{ count: "exact" }
				)
				.is("deleted_at", null)
				.order("name")

			// Filtrar: templates globais (NULL) OU templates da kitchen específica
			if (kitchenId !== null) {
				query = query.or(`kitchen_id.is.null,kitchen_id.eq.${kitchenId}`)
			} else {
				query = query.is("kitchen_id", null)
			}

			const { data, error } = await query

			if (error) {
				throw new Error(`Failed to fetch templates: ${error.message}`)
			}

			// Transformar para incluir contagens
			return (data || []).map((template) => ({
				...template,
				item_count: template.items?.[0]?.count || 0,
				recipe_count: template.items?.[0]?.count || 0, // Simplificado
			}))
		},
		enabled: kitchenId !== null,
		staleTime: 5 * 60 * 1000, // 5 minutes
	})

/**
 * Query options para buscar items de um template específico
 */
export const templateItemsQueryOptions = (templateId: string | null) =>
	queryOptions({
		queryKey: ["template_items", templateId],
		queryFn: async (): Promise<MenuTemplateWithItems["items"]> => {
			if (!templateId) return []

			const { data, error } = await supabase
				.from("menu_template_items")
				.select(
					`
          *,
          meal_type:meal_type_id(*),
          recipe_origin:recipe_origin_id(*)
        `
				)
				.eq("menu_template_id", templateId)
				.order("day_of_week")
				.order("meal_type_id")

			if (error) {
				throw new Error(`Failed to fetch template items: ${error.message}`)
			}

			return data || []
		},
		enabled: !!templateId,
		staleTime: 5 * 60 * 1000,
	})

/**
 * Query options para buscar um template específico com seus items
 */
export const templateQueryOptions = (templateId: string | null) =>
	queryOptions({
		queryKey: ["template", templateId],
		queryFn: async (): Promise<MenuTemplateWithItems | null> => {
			if (!templateId) return null

			const { data: template, error: templateError } = await supabase
				.from("menu_template")
				.select("*")
				.eq("id", templateId)
				.single()

			if (templateError) {
				throw new Error(`Failed to fetch template: ${templateError.message}`)
			}

			const { data: items, error: itemsError } = await supabase
				.from("menu_template_items")
				.select(
					`
          *,
          recipe_origin:recipe_origin_id(*)
        `
				)
				.eq("menu_template_id", templateId)

			if (itemsError) {
				throw new Error(`Failed to fetch template items: ${itemsError.message}`)
			}

			return {
				...template,
				items: items || [],
			}
		},
		enabled: !!templateId,
	})

// --- Query Hooks ---

/**
 * Hook para buscar templates disponíveis para uma kitchen
 *
 * @param kitchenId - ID da kitchen (null retorna apenas templates globais)
 *
 * @example
 * ```tsx
 * const { data: templates, isLoading } = useMenuTemplates(kitchenId);
 * ```
 */
export function useMenuTemplates(kitchenId: number | null) {
	return useQuery(menuTemplatesQueryOptions(kitchenId))
}

/**
 * Hook para buscar items de um template específico
 *
 * @param templateId - ID do template
 *
 * @example
 * ```tsx
 * const { data: items } = useTemplateItems(templateId);
 * ```
 */
export function useTemplateItems(templateId: string | null) {
	return useQuery(templateItemsQueryOptions(templateId))
}

/**
 * Hook para buscar um template completo com items
 *
 * @param templateId - ID do template
 *
 * @example
 * ```tsx
 * const { data: template } = useTemplate(templateId);
 * ```
 */
export function useTemplate(templateId: string | null) {
	return useQuery(templateQueryOptions(templateId))
}

/**
 * Hook para buscar templates deletados da lixeira
 *
 * @param kitchenId - ID da kitchen
 *
 * @example
 * ```tsx
 * const { data: deletedTemplates } = useDeletedTemplates(kitchenId);
 * ```
 */
export function useDeletedTemplates(kitchenId: number | null) {
	return useQuery({
		queryKey: ["deleted_templates", kitchenId],
		queryFn: async (): Promise<TemplateWithItemCounts[]> => {
			let query = supabase
				.from("menu_template")
				.select(
					`
          *,
          items:menu_template_items(count)
        `,
					{ count: "exact" }
				)
				.not("deleted_at", "is", null)
				.order("deleted_at", { ascending: false })

			// Filtrar por kitchen
			if (kitchenId !== null) {
				query = query.or(`kitchen_id.is.null,kitchen_id.eq.${kitchenId}`)
			} else {
				query = query.is("kitchen_id", null)
			}

			const { data, error } = await query

			if (error) {
				throw new Error(`Failed to fetch deleted templates: ${error.message}`)
			}

			return (data || []).map((template) => ({
				...template,
				item_count: template.items?.[0]?.count || 0,
				recipe_count: template.items?.[0]?.count || 0,
			}))
		},
		enabled: kitchenId !== null,
		staleTime: 1 * 60 * 1000, // 1 minute
	})
}

// --- Mutation Hooks ---

/**
 * Hook para criar novo template
 *
 * @example
 * ```tsx
 * const { mutate: createTemplate } = useCreateTemplate();
 *
 * createTemplate({
 *   template: {
 *     name: 'Semana Padrão',
 *     kitchen_id: 1,
 *   },
 *   items: [
 *     { day_of_week: 1, meal_type_id: 'uuid', recipe_id: 'uuid' }
 *   ]
 * });
 * ```
 */
export function useCreateTemplate() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			template,
			items,
		}: {
			template: MenuTemplateInsert
			items: Omit<MenuTemplateItemInsert, "menu_template_id">[]
		}) => {
			// 1. Criar template
			const { data: newTemplate, error: templateError } = await supabase
				.from("menu_template")
				.insert(template)
				.select()
				.single()

			if (templateError) {
				throw new Error(`Failed to create template: ${templateError.message}`)
			}

			// 2. Criar items do template (se houver)
			if (items.length > 0) {
				const templateItems = items.map((item) => ({
					...item,
					menu_template_id: newTemplate.id,
				}))

				const { error: itemsError } = await supabase
					.from("menu_template_items")
					.insert(templateItems)

				if (itemsError) {
					// Rollback: deletar template criado
					await supabase.from("menu_template").delete().eq("id", newTemplate.id)
					throw new Error(`Failed to create template items: ${itemsError.message}`)
				}
			}

			return newTemplate
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success(`Template "${data.name}" criado com sucesso!`)
		},
		onError: (error) => {
			toast.error(`Erro ao criar template: ${error.message}`)
		},
	})
}

/**
 * Hook para atualizar template existente
 *
 * @example
 * ```tsx
 * const { mutate: updateTemplate } = useUpdateTemplate();
 *
 * updateTemplate({
 *   id: 'uuid',
 *   updates: { name: 'Novo Nome' },
 *   items: [...] // Opcional: atualizar items
 * });
 * ```
 */
export function useUpdateTemplate() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			id,
			updates,
			items,
		}: {
			id: string
			updates: MenuTemplateUpdate
			items?: Omit<MenuTemplateItemInsert, "menu_template_id">[]
		}) => {
			// 1. Atualizar template metadata
			const { data, error: templateError } = await supabase
				.from("menu_template")
				.update(updates)
				.eq("id", id)
				.select()
				.single()

			if (templateError) {
				throw new Error(`Failed to update template: ${templateError.message}`)
			}

			// 2. Se items foram fornecidos, substituir todos
			if (items !== undefined) {
				// Deletar items existentes
				const { error: deleteError } = await supabase
					.from("menu_template_items")
					.delete()
					.eq("menu_template_id", id)

				if (deleteError) {
					throw new Error(`Failed to delete old items: ${deleteError.message}`)
				}

				// Inserir novos items
				if (items.length > 0) {
					const templateItems = items.map((item) => ({
						...item,
						menu_template_id: id,
					}))

					const { error: insertError } = await supabase
						.from("menu_template_items")
						.insert(templateItems)

					if (insertError) {
						throw new Error(`Failed to insert new items: ${insertError.message}`)
					}
				}
			}

			return data
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			queryClient.invalidateQueries({ queryKey: ["template", data.id] })
			queryClient.invalidateQueries({ queryKey: ["template_items", data.id] })
			toast.success(`Template "${data.name}" atualizado!`)
		},
		onError: (error) => {
			toast.error(`Erro ao atualizar template: ${error.message}`)
		},
	})
}

/**
 * Hook para soft-delete de template
 *
 * @example
 * ```tsx
 * const { mutate: deleteTemplate } = useDeleteTemplate();
 *
 * deleteTemplate('template-uuid');
 * ```
 */
export function useDeleteTemplate() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("menu_template")
				.update({ deleted_at: new Date().toISOString() })
				.eq("id", id)

			if (error) {
				throw new Error(`Failed to delete template: ${error.message}`)
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success("Template removido!")
		},
		onError: (error) => {
			toast.error(`Erro ao remover template: ${error.message}`)
		},
	})
}

/**
 * Hook para restaurar template soft-deleted
 */
export function useRestoreTemplate() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase
				.from("menu_template")
				.update({ deleted_at: null })
				.eq("id", id)

			if (error) {
				throw new Error(`Failed to restore template: ${error.message}`)
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["menu_templates"] })
			toast.success("Template restaurado!")
		},
		onError: (error) => {
			toast.error(`Erro ao restaurar template: ${error.message}`)
		},
	})
}

/**
 * Hook complexo para aplicar template em datas específicas
 *
 * Processo:
 * 1. Busca items do template com recipes completes
 * 2. Soft-delete daily_menus existentes nas datas alvo
 * 3. Mapeia dias do template para datas alvo
 * 4. Cria novos daily_menus e menu_items com snapshots
 *
 * @example
 * ```tsx
 * const { mutate: applyTemplate, isPending } = useApplyTemplate();
 *
 * applyTemplate({
 *   templateId: 'uuid',
 *   targetDates: ['2024-01-15', '2024-01-16'],
 *   startDayOfWeek: 1, // Monday
 *   kitchenId: 1
 * });
 * ```
 */
export function useApplyTemplate() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			templateId,
			targetDates,
			startDayOfWeek,
			kitchenId,
		}: ApplyTemplatePayload) => {
			// 1. Buscar template items com recipes
			const { data: templateItems, error: fetchError } = await supabase
				.from("menu_template_items")
				.select(
					`
          *,
          recipe_origin:recipe_id(*)
        `
				)
				.eq("menu_template_id", templateId)

			if (fetchError || !templateItems) {
				throw new Error(`Failed to fetch template items: ${fetchError?.message}`)
			}

			// 2. Soft-delete existing menus para as datas alvo
			const { error: deleteError } = await supabase
				.from("daily_menu")
				.update({ deleted_at: new Date().toISOString() })
				.in("service_date", targetDates)
				.eq("kitchen_id", kitchenId)

			if (deleteError) {
				throw new Error(`Failed to delete existing menus: ${deleteError.message}`)
			}

			// 3. Preparar dados para inserção
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
				recipe: any
			}> = []

			for (const dateStr of targetDates) {
				const date = new Date(dateStr)
				// day_of_week: 0 (Sunday) to 6 (Saturday) -> convert to 1-7
				const jsDay = date.getDay()
				const dateDayOfWeek = jsDay === 0 ? 7 : jsDay

				// Calcular qual dia do template corresponde a esta data
				// startDayOfWeek = 1 (Monday template) e dateDayOfWeek = 3 (Wednesday real)
				// templateDay = ((3 - 1) % 7) + 1 = 3 (Wednesday template)
				const offset = dateDayOfWeek - startDayOfWeek
				const templateDay = ((offset + 7) % 7) + 1

				// Filtrar items do template para este dia
				const dayItems = templateItems.filter((item) => item.day_of_week === templateDay)

				// Agrupar por meal_type_id
				const itemsByMealType = dayItems.reduce(
					(acc, item) => {
						if (!acc[item.meal_type_id]) {
							acc[item.meal_type_id] = []
						}
						acc[item.meal_type_id].push(item)
						return acc
					},
					{} as Record<string, typeof dayItems>
				)

				// Criar daily_menu para cada meal_type
				for (const [mealTypeId, items] of Object.entries(itemsByMealType)) {
					const menuId = crypto.randomUUID()

					newMenus.push({
						id: menuId,
						service_date: dateStr,
						meal_type_id: mealTypeId,
						kitchen_id: kitchenId,
						status: "PLANNED",
					})

					// Criar menu_items com recipe snapshots
					for (const item of items) {
						newMenuItems.push({
							daily_menu_id: menuId,
							recipe_origin_id: item.recipe_id,
							recipe: item.recipe_origin, // Snapshot
						})
					}
				}
			}

			// 4. Inserir novos menus e items
			if (newMenus.length > 0) {
				const { error: menusError } = await supabase.from("daily_menu").insert(newMenus)

				if (menusError) {
					throw new Error(`Failed to insert menus: ${menusError.message}`)
				}
			}

			if (newMenuItems.length > 0) {
				const { error: itemsError } = await supabase.from("menu_items").insert(newMenuItems)

				if (itemsError) {
					throw new Error(`Failed to insert menu items: ${itemsError.message}`)
				}
			}

			return {
				menusCreated: newMenus.length,
				itemsCreated: newMenuItems.length,
			}
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["daily_menus"] })
			queryClient.invalidateQueries({ queryKey: ["planning"] })
			toast.success(
				`Template aplicado! ${result.menusCreated} cardápios e ${result.itemsCreated} items criados.`
			)
		},
		onError: (error) => {
			toast.error(`Erro ao aplicar template: ${error.message}`)
		},
	})
}
