import type { CatalogScope, PreparationScope } from "@iefa/sisub-domain"
import { useEffect, useMemo, useRef } from "react"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { asArray, buildIngredientTree } from "@/lib/ingredient-tree"
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
 * @param catalog escopo gêneros × itens auxiliares (EPI, limpeza, embalagem…). Padrão
 *   `"include"` — os dois juntos, que é o que o seletor da ficha técnica precisa. As
 *   abas de /global/ingredients pedem `"exclude"` (Insumos) e `"only"` (Itens auxiliares).
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
	preparations: PreparationScope = "exclude",
	catalog: CatalogScope = "include"
) {
	const { caseSensitive, accentSensitive } = sensitivity
	// Chave estável (ordenada) para o memo: ocultação de categorias por pasta raiz.
	const hiddenKey = useMemo(() => hiddenCategoryKeys.toSorted().join(","), [hiddenCategoryKeys])
	// Busca dados via service
	const { tree, error, refetch } = useIngredientsTree(includeDeleted, preparations, catalog)

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
