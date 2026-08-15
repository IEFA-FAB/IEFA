import type { RecipeFolder } from "@iefa/database/sisub"
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { queryKeys } from "@/lib/query-keys"
import { createRecipeFolderFn, deleteRecipeFolderFn, fetchRecipeFoldersFn, renameRecipeFolderFn, setRecipeFolderFn } from "@/server/recipes.fn"

/**
 * Pastas de preparação — agrupamento PLANO (sem hierarquia), só para organizar e filtrar
 * a listagem. Não confundir com as pastas de insumo (`IngredientsService`), que formam a
 * árvore de navegação e carregam semântica de categoria.
 */
export const recipeFoldersQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.recipes.folders(),
		queryFn: () => fetchRecipeFoldersFn({ data: {} }) as Promise<RecipeFolder[]>,
		staleTime: 10 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	})

export function useRecipeFolders() {
	const query = useQuery(recipeFoldersQueryOptions())
	const folders = useMemo(() => query.data ?? [], [query.data])
	const nameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders])
	return { ...query, folders, nameById }
}

/**
 * Mutações do CATÁLOGO de pastas (exigem `global:2` no servidor). Arquivar preparações é
 * outra coisa — vai em `useBulkRecipeOps.moveToFolder`, autorizado pela posse da preparação.
 */
export function useRecipeFolderMutations() {
	const queryClient = useQueryClient()

	const invalidate = async () => {
		await queryClient.invalidateQueries({ queryKey: queryKeys.recipes.folders() })
		// Excluir uma pasta desarquiva as preparações que estavam nela: a listagem precisa recarregar.
		await queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all() })
	}

	const create = useMutation({
		mutationFn: (name: string) => createRecipeFolderFn({ data: { name } }),
		onSuccess: invalidate,
	})

	const rename = useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) => renameRecipeFolderFn({ data: { id, name } }),
		onSuccess: invalidate,
	})

	const remove = useMutation({
		mutationFn: (id: string) => deleteRecipeFolderFn({ data: { id } }),
		onSuccess: invalidate,
	})

	return {
		createFolder: create.mutateAsync,
		renameFolder: rename.mutateAsync,
		deleteFolder: remove.mutateAsync,
		isPending: create.isPending || rename.isPending || remove.isPending,
	}
}

/** Arquiva UMA preparação (ou a tira da pasta, com `folderId: null`). */
export function useSetRecipeFolder() {
	const queryClient = useQueryClient()
	const mutation = useMutation({
		mutationFn: ({ recipeId, folderId }: { recipeId: string; folderId: string | null }) => setRecipeFolderFn({ data: { recipeIds: [recipeId], folderId } }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all() }),
	})
	return { setRecipeFolder: mutation.mutateAsync, isSaving: mutation.isPending }
}
