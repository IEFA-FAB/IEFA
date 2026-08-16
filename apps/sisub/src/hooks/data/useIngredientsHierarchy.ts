import type { PreparationScope } from "@iefa/sisub-domain"
import { useEffect, useMemo, useRef } from "react"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { asArray, buildIngredientTree, type FolderConference, type FolderReviewStats, folderConferenceStatus, folderReviewStats } from "@/lib/ingredient-tree"
import type { SearchSensitivity } from "@/lib/text-search"
import { useIngredientsTree } from "@/services/IngredientsService"
import type { FlatIngredientTree } from "@/types/domain/ingredients"

/**
 * Hook avançado que orquestra os dados de ingredientes
 * Gerencia estado de filtro, árvore hierárquica e virtualização
 *
 * Segue padrão: hooks/ orquestram múltiplos services e gerenciam estado de UI
 *
 * @param persistKey quando informado, o estado de expand/collapse é persistido
 *   em `sessionStorage` (preserva as pastas abertas ao navegar e voltar). Omitir
 *   em usos efêmeros (ex: IngredientSelector) para manter o comportamento padrão.
 * @param preparations escopo do grupo legado "Preparações" (SISUBWEB). Padrão
 *   `"exclude"`; a aba dedicada usa `"only"` e recebe a MESMA árvore de pastas,
 *   só que recortada naquele grupo.
 */
export function useIngredientsHierarchy(
	filterText = "",
	includeDeleted = false,
	persistKey?: string,
	sensitivity: SearchSensitivity = { caseSensitive: false, accentSensitive: false },
	hiddenCategoryKeys: readonly string[] = [],
	sortDirection: "asc" | "desc" = "asc",
	defaultCollapsed = false,
	onlyNotReviewed = false,
	preparations: PreparationScope = "exclude"
) {
	const { caseSensitive, accentSensitive } = sensitivity
	// Chave estável (ordenada) para o memo: ocultação de categorias por pasta raiz.
	const hiddenKey = useMemo(() => hiddenCategoryKeys.toSorted().join(","), [hiddenCategoryKeys])
	// Busca dados via service
	const { tree, error, refetch } = useIngredientsTree(includeDeleted, preparations)

	// Estado de expand/collapse
	// Inicializa com todas as pastas de primeiro nível expandidas — exceto quando
	// `defaultCollapsed`, que abre a árvore totalmente recolhida.
	// Usa ref para garantir que a inicialização ocorra somente uma vez,
	// mesmo que `tree` chegue de forma assíncrona (ex: IngredientSelector sem loader).
	const [expandedIds, setExpandedIds, expandMeta] = usePersistentState<Set<string>>(persistKey ? `${persistKey}:expanded` : null, new Set(), {
		serialize: (s) => JSON.stringify([...s]),
		deserialize: (raw) => new Set(JSON.parse(raw) as string[]),
	})
	const initializedRef = useRef(false)

	useEffect(() => {
		// Aguarda a hidratação do storage para saber se há um estado salvo.
		if (!expandMeta.hydrated) return
		if (tree && !initializedRef.current) {
			initializedRef.current = true
			// Havia estado salvo (inclui "tudo recolhido") → respeita, não reexpande.
			if (expandMeta.hadStored) return
			// Default da tela: abrir tudo recolhido (mantém o Set vazio).
			if (defaultCollapsed) return
			const rootFolders = asArray(tree.folders).flatMap((f) => (f.parent_id ? [] : [f.id]))
			setExpandedIds(new Set(rootFolders))
		}
	}, [tree, expandMeta.hydrated, expandMeta.hadStored, setExpandedIds, defaultCollapsed])

	// Funções de controle de expansão
	const toggleExpand = (nodeId: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (next.has(nodeId)) {
				next.delete(nodeId)
			} else {
				next.add(nodeId)
			}
			return next
		})
	}

	const expandAll = () => {
		if (!tree) return
		// Ingredients are leaf nodes (items live on detail page), only expand folders
		setExpandedIds(new Set(asArray(tree.folders).map((f) => f.id)))
	}

	const collapseAll = () => {
		setExpandedIds(new Set())
	}

	// Contagem de itens de compra por ingrediente (para badges na árvore)
	const itemCountByIngredientId = useMemo<Record<string, number>>(() => {
		if (!tree) return {}
		const counts: Record<string, number> = {}
		for (const item of asArray(tree.ingredientItems)) {
			if (item.ingredient_id) {
				counts[item.ingredient_id] = (counts[item.ingredient_id] || 0) + 1
			}
		}
		return counts
	}, [tree])

	// Data da última revisão por ingrediente (ISO) — exibida na árvore para acompanhar a conferência.
	const lastReviewByIngredientId = useMemo<Record<string, string>>(() => {
		if (!tree) return {}
		const map: Record<string, string> = {}
		for (const r of asArray(tree.lastReviews)) {
			if (r.ingredient_id) map[r.ingredient_id] = r.reviewed_at
		}
		return map
	}, [tree])

	// Progresso de conferência por pasta, derivado das revisões de insumo que já vêm
	// no payload da árvore. Calculado sobre os dados crus, não sobre `flatTree`: o
	// número descreve o catálogo, e mudaria de sentido se seguisse o filtro da tela.
	const folderReviewByFolderId = useMemo(() => {
		if (!tree) return new Map<string, FolderReviewStats>()
		return folderReviewStats({ folders: tree.folders, ingredients: tree.ingredients, lastReviews: tree.lastReviews })
	}, [tree])

	// Conferência da pasta enquanto pasta (carimbo humano) + quanto entrou depois
	// dela. Fato distinto do progresso acima; a tela mostra os dois, nunca um pelo outro.
	const folderConferenceByFolderId = useMemo(() => {
		if (!tree) return new Map<string, FolderConference>()
		return folderConferenceStatus({ folders: tree.folders, ingredients: tree.ingredients, folderLastReviews: tree.folderLastReviews })
	}, [tree])

	// Constrói a estrutura flat para virtualização. A lógica é pura e vive em
	// `lib/ingredient-tree` — é onde ela tem teste.
	const flatTree = useMemo<FlatIngredientTree | null>(() => {
		if (!tree) return null
		return buildIngredientTree({
			folders: tree.folders,
			ingredients: tree.ingredients,
			lastReviews: tree.lastReviews,
			filterText,
			sensitivity: { caseSensitive, accentSensitive },
			hiddenCategoryKeys: hiddenKey ? hiddenKey.split(",") : [],
			sortDirection,
			onlyNotReviewed,
			expandedIds,
		})
	}, [tree, filterText, expandedIds, caseSensitive, accentSensitive, hiddenKey, sortDirection, onlyNotReviewed])

	// Estatísticas
	const stats = useMemo(() => {
		if (!tree) return null

		return {
			totalFolders: asArray(tree.folders).length,
			totalIngredients: asArray(tree.ingredients).length,
			totalItems: asArray(tree.ingredientItems).length,
		}
	}, [tree])

	return {
		// Dados
		flatTree,
		stats,
		itemCountByIngredientId,
		lastReviewByIngredientId,
		folderReviewByFolderId,
		folderConferenceByFolderId,

		// Estados (componente decide skeleton)
		error,

		// Estado de expansão
		expandedIds,

		// Ações
		refetch,
		toggleExpand,
		expandAll,
		collapseAll,
	}
}
