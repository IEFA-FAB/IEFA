import type { ComposeOccasionMenu, CreateTemplateFolder, MoveTemplateFolder, SetTemplateFolder, UpdateTemplateFolder } from "@iefa/sisub-domain"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/ui/toast"
import { queryKeys } from "@/lib/query-keys"
import type { CatalogFolder } from "@/lib/template-catalog-tree"
import {
	createTemplateFolderFn,
	deleteTemplateFolderFn,
	fetchTemplateFoldersFn,
	moveTemplateFolderFn,
	setTemplateFolderFn,
	updateTemplateFolderFn,
} from "@/server/template-folders.fn"
import { composeOccasionMenuFn, duplicateTemplateAsVariantFn } from "@/server/templates.fn"

/** Pasta como a tela usa (a leitura traz também `template_type`, `created_at`, `deleted_at`). */
export type TemplateFolder = CatalogFolder & { template_type: "event" | "apoio" }

/** Pastas do catálogo global de eventos ou de cardápios de apoio, na ordem da SDAB. `null` = não busca. */
export function useTemplateFolders(templateType: "event" | "apoio" | null) {
	return useQuery({
		queryKey: queryKeys.templates.folders(templateType ?? "event"),
		queryFn: () => fetchTemplateFoldersFn({ data: { templateType: templateType ?? "event" } }) as Promise<TemplateFolder[]>,
		enabled: templateType != null,
		staleTime: 5 * 60 * 1000,
	})
}

/** Refaz árvore e listagens: mexer em pasta muda onde o modelo aparece. */
function useInvalidateCatalog() {
	const queryClient = useQueryClient()
	return () => queryClient.invalidateQueries({ queryKey: queryKeys.templates.all() })
}

export function useCreateTemplateFolder() {
	const invalidate = useInvalidateCatalog()
	return useMutation({
		mutationFn: (input: CreateTemplateFolder) => createTemplateFolderFn({ data: input }),
		onSuccess: (folder) => {
			invalidate()
			toast.success(`Pasta "${folder.name}" criada.`)
		},
		onError: (error) => toast.error(`Erro ao criar a pasta: ${error.message}`),
	})
}

export function useUpdateTemplateFolder() {
	const invalidate = useInvalidateCatalog()
	return useMutation({
		mutationFn: (input: UpdateTemplateFolder) => updateTemplateFolderFn({ data: input }),
		onSuccess: () => {
			invalidate()
			toast.success("Pasta atualizada.")
		},
		onError: (error) => toast.error(`Erro ao salvar a pasta: ${error.message}`),
	})
}

export function useMoveTemplateFolder() {
	const invalidate = useInvalidateCatalog()
	return useMutation({
		mutationFn: (input: MoveTemplateFolder) => moveTemplateFolderFn({ data: input }),
		onSuccess: () => invalidate(),
		onError: (error) => toast.error(`Erro ao reordenar: ${error.message}`),
	})
}

export function useDeleteTemplateFolder() {
	const invalidate = useInvalidateCatalog()
	return useMutation({
		mutationFn: (folderId: string) => deleteTemplateFolderFn({ data: { folderId } }),
		onSuccess: () => {
			invalidate()
			toast.success("Pasta removida.")
		},
		onError: (error) => toast.error(`Não foi possível remover a pasta: ${error.message}`),
	})
}

export function useSetTemplateFolder() {
	const invalidate = useInvalidateCatalog()
	return useMutation({
		mutationFn: (input: SetTemplateFolder) => setTemplateFolderFn({ data: input }),
		onSuccess: () => {
			invalidate()
			toast.success("Modelo movido.")
		},
		onError: (error) => toast.error(`Erro ao mover o modelo: ${error.message}`),
	})
}

/** Outra opção do mesmo formato, na mesma pasta. Devolve o modelo novo para abrir o editor. */
export function useDuplicateTemplateAsVariant() {
	const invalidate = useInvalidateCatalog()
	return useMutation({
		mutationFn: (templateId: string) => duplicateTemplateAsVariantFn({ data: { templateId } }),
		onSuccess: (created) => {
			invalidate()
			toast.success(`Variante "${created.name}" criada. Dê a ela um nome que a distinga.`)
		},
		onError: (error) => toast.error(`Erro ao duplicar: ${error.message}`),
	})
}

/** Evento da cozinha montado a partir de modelos. */
export function useComposeOccasionMenu() {
	const invalidate = useInvalidateCatalog()
	return useMutation({
		mutationFn: (input: ComposeOccasionMenu) => composeOccasionMenuFn({ data: input }),
		onSuccess: (created) => {
			invalidate()
			toast.success(`Evento "${created.name}" montado.`)
		},
		onError: (error) => toast.error(`Erro ao montar o evento: ${error.message}`),
	})
}
