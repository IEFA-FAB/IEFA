import type { Recipe } from "@iefa/database/sisub"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChefHat, Folder as FolderIcon, Globe, Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { TREE_LEAF_TONE, TREE_MUTED_TONE, TreeRow, treeFolderTone } from "@/components/ui/tree-row"
import { useRecipeFolders } from "@/hooks/data/useRecipeFolders"
import { useRecipes } from "@/hooks/data/useRecipes"
import { allRecipeFolderIds, buildRecipeTree } from "@/lib/recipe-tree"

const ROW_HEIGHT = 48

interface RecipeSelectorProps {
	open: boolean
	onClose: () => void
	kitchenId: number | null
	selectedRecipeIds: string[]
	onSelect: (recipeIds: string[]) => void
	multiSelect?: boolean
}

interface RecipeSelectorContentProps {
	onClose: () => void
	kitchenId: number | null
	selectedRecipeIds: string[]
	onSelect: (recipeIds: string[]) => void
	multiSelect: boolean
	recipes: Recipe[] | undefined
	isLoading: boolean
}

/**
 * Seleção de preparações POR PASTA — a mesma navegação de `/global/recipes`.
 *
 * Era uma lista plana de ~2.000 nomes: para achar "Arroz Carreteiro" no plano semanal só
 * havia digitar, e quem não lembrava o nome exato não tinha por onde começar. O catálogo
 * já está organizado em pastas (`kitchen.recipe_folder`) e a listagem global mostra essa
 * estrutura; o seletor não mostrava, então a mesma preparação era "fácil de achar" numa
 * tela e não na outra.
 *
 * Reusa a montagem pura (`lib/recipe-tree`) e a linha (`ui/tree-row`) da listagem — não
 * um segundo desenho de árvore. Diferenças, todas por ser um diálogo efêmero: o
 * expand/collapse não é persistido, a busca abre tudo (`autoExpand`), e a linha entra em
 * `selectionMode` para o clique marcar em vez de navegar.
 */
function RecipeSelectorContent({ onClose, kitchenId, selectedRecipeIds, onSelect, multiSelect, recipes, isLoading }: RecipeSelectorContentProps) {
	const [searchQuery, setSearchQuery] = useState("")
	const [debouncedQuery, setDebouncedQuery] = useState("")
	const [tempSelected, setTempSelected] = useState<string[]>(selectedRecipeIds)
	// Complemento (pastas FECHADAS): pasta criada depois que o diálogo abriu nasce aberta
	// em vez de sumir com o conteúdo dentro. Mesma escolha de `buildRecipeTree`.
	const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set())
	const parentRef = useRef<HTMLDivElement>(null)

	const { folders } = useRecipeFolders()

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
		return () => clearTimeout(timer)
	}, [searchQuery])

	// Escopo: catálogo global + as preparações desta cozinha. O filtro de texto fica com a
	// árvore, que também casa NOME DE PASTA — decidir isso aqui fora quebraria esse casamento.
	const inScope = useMemo(() => (recipes ?? []).filter((recipe) => recipe.kitchen_id === null || recipe.kitchen_id === kitchenId), [recipes, kitchenId])

	const tree = useMemo(
		() =>
			buildRecipeTree({
				folders,
				recipes: inScope,
				filterText: debouncedQuery,
				sensitivity: { caseSensitive: false, accentSensitive: false },
				collapsedIds,
				// Buscar e ainda ter de abrir pasta por pasta para ver o resultado seria
				// esconder justamente o que o usuário acabou de pedir.
				autoExpand: debouncedQuery.trim().length > 0,
				hideEmptyFolders: debouncedQuery.trim().length > 0,
			}),
		[folders, inScope, debouncedQuery, collapsedIds]
	)

	const rowVirtualizer = useVirtualizer({
		count: tree.nodes.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
		getItemKey: (index) => tree.nodes[index]?.id ?? index,
	})

	const toggleFolder = (id: string) =>
		setCollapsedIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})

	const handleToggleRecipe = (recipeId: string) => {
		if (multiSelect) {
			setTempSelected((prev) => (prev.includes(recipeId) ? prev.filter((id) => id !== recipeId) : [...prev, recipeId]))
		} else {
			setTempSelected([recipeId])
		}
	}

	const handleConfirm = () => {
		onSelect(tempSelected)
		onClose()
	}

	// Set em vez de `includes`: a checagem roda por linha virtualizada a cada scroll, e
	// varrer a lista inteira em cada uma delas cresce com o quadrado da seleção.
	const selectedSet = useMemo(() => new Set(tempSelected), [tempSelected])
	const selectedCount = tempSelected.length

	return (
		<>
			<DialogHeader>
				<DialogTitle>Selecionar Preparações</DialogTitle>
				<DialogDescription>{multiSelect ? "Selecione uma ou mais Preparações para adicionar ao template." : "Selecione uma Preparação."}</DialogDescription>
			</DialogHeader>

			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-56 flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
					<Input placeholder="Buscar por nome, código ou pasta..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
				</div>
				<ButtonGroup>
					<Button type="button" variant="outline" size="sm" onClick={() => setCollapsedIds(new Set())}>
						Expandir Tudo
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={() => setCollapsedIds(allRecipeFolderIds(folders))}>
						Recolher Tudo
					</Button>
				</ButtonGroup>
			</div>

			<div className="text-xs text-muted-foreground">
				{isLoading ? "Carregando..." : `${tree.recipeCount} ${tree.recipeCount === 1 ? "preparação" : "preparações"} em ${tree.folderCount} pastas`}
			</div>

			<div ref={parentRef} className="overflow-auto border rounded-lg" style={{ height: 420 }}>
				{isLoading ? (
					<div className="py-6 text-center text-sm text-muted-foreground">Carregando Preparações...</div>
				) : tree.nodes.length === 0 ? (
					<div className="py-6 text-center text-sm text-muted-foreground">Nenhuma Preparação encontrada.</div>
				) : (
					<div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
						{rowVirtualizer.getVirtualItems().map((virtualItem) => {
							const node = tree.nodes[virtualItem.index]
							if (!node) return null
							return (
								<div
									key={virtualItem.key}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
										height: `${virtualItem.size}px`,
										transform: `translateY(${virtualItem.start}px)`,
									}}
								>
									{node.type === "folder" ? (
										<TreeRow
											level={0}
											hasChildren={node.hasChildren}
											isExpanded={node.isExpanded}
											onToggle={() => toggleFolder(node.id)}
											onActivate={() => toggleFolder(node.id)}
											icon={FolderIcon}
											tone={treeFolderTone(0)}
											label={node.label}
											meta={
												<span className="text-xs text-muted-foreground">
													{node.recipeCount} {node.recipeCount === 1 ? "preparação" : "preparações"}
												</span>
											}
										>
											<span className="truncate font-medium">{node.label}</span>
										</TreeRow>
									) : (
										<TreeRow
											level={1}
											icon={node.data.kitchen_id === null ? Globe : ChefHat}
											tone={node.data.kitchen_id === null ? TREE_LEAF_TONE : TREE_MUTED_TONE}
											label={node.label}
											// Checkbox sempre visível: escolher é a única coisa que se faz aqui.
											selectionMode
											selected={selectedSet.has(node.id)}
											onSelectChange={() => handleToggleRecipe(node.id)}
											onActivate={() => handleToggleRecipe(node.id)}
											meta={
												<span className="flex items-center gap-2 text-xs text-muted-foreground">
													{node.data.rational_id && <span className="font-mono">{node.data.rational_id}</span>}
													{node.data.portion_yield != null && <span>{node.data.portion_yield} porções</span>}
												</span>
											}
										>
											<span className="truncate">{node.label}</span>
											{node.data.kitchen_id === null && (
												<Badge variant="outline" className="shrink-0 text-xs">
													Global
												</Badge>
											)}
										</TreeRow>
									)}
								</div>
							)
						})}
					</div>
				)}
			</div>

			<DialogFooter className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					{selectedCount > 0 ? (
						<span>
							{selectedCount} Preparação{selectedCount > 1 ? "s" : ""} selecionada
							{selectedCount > 1 ? "s" : ""}
						</span>
					) : (
						<span>Nenhuma Preparação selecionada</span>
					)}
				</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="button" onClick={handleConfirm} disabled={selectedCount === 0}>
						Confirmar ({selectedCount})
					</Button>
				</div>
			</DialogFooter>
		</>
	)
}

export function RecipeSelector({ open, onClose, kitchenId, selectedRecipeIds, onSelect, multiSelect = true }: RecipeSelectorProps) {
	"use no memo"
	const { data: recipes, isLoading } = useRecipes()

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-4xl flex flex-col">
				<RecipeSelectorContent
					key={String(open)}
					onClose={onClose}
					kitchenId={kitchenId}
					selectedRecipeIds={selectedRecipeIds}
					onSelect={onSelect}
					multiSelect={multiSelect}
					recipes={recipes}
					isLoading={isLoading}
				/>
			</DialogContent>
		</Dialog>
	)
}
