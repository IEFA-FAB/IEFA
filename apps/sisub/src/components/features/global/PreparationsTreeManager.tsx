import { useNavigate } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownAZ, ArrowDownZA, Loader2, Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useIngredientsHierarchy } from "@/hooks/data/useIngredientsHierarchy"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { getStoredScrollOffset, usePersistScrollOffset } from "@/hooks/ui/useScrollRestoration"
import type { FlatIngredientTree } from "@/types/domain/ingredients"
import { IngredientsTreeNode } from "./IngredientsTreeNode"

/**
 * Árvore do grupo "Preparações" herdado do SISUBWEB.
 *
 * São linhas de `kitchen.ingredient` que não são insumos — são preparações, com nomes
 * que colidem com os das receitas. Ficam fora de toda listagem de insumo (árvore,
 * seletor da ficha técnica, CSV, denominador da conferência) e vivem aqui.
 *
 * MESMA árvore de pastas dos insumos, só recortada no grupo: o escopo `"only"` inverte
 * o filtro do servidor, e daí pra frente é o mesmo hook e o mesmo nó de linha. Uma
 * estrutura própria obrigaria a reaprender a navegação num catálogo que o pessoal já
 * conhece de cor.
 *
 * Somente leitura: as linhas continuam existindo porque receitas antigas apontam para
 * elas por FK; quem precisa corrigir uma abre a página de detalhe do insumo.
 */

const PERSIST_KEY = "sisub:global-preparations"
const SCROLL_KEY = `${PERSIST_KEY}:scroll`

/** Contagem do que o filtro deixou passar (não do que está expandido na tela). */
function countVisible(flatTree: FlatIngredientTree | null): { folders: number; ingredients: number } {
	let folders = 0
	let ingredients = 0
	if (flatTree) {
		for (const node of Object.values(flatTree.byId)) {
			if (node.type === "folder") folders++
			else if (node.type === "ingredient") ingredients++
		}
	}
	return { folders, ingredients }
}

export function PreparationsTreeManager() {
	const navigate = useNavigate()
	const [inputValue, setInputValue] = useState("")
	const [filterText, setFilterText] = useState("")
	// Ordenação alfabética (A-Z / Z-A), persistida por aba — espelha a árvore de insumos.
	const [sortDirection, setSortDirection] = usePersistentState<"asc" | "desc">(`${PERSIST_KEY}:sort`, "asc")

	// Debounce local: a árvore de insumos debounce via URL, mas aqui a busca não vai
	// para a query string (o param `search` pertence à aba de insumos, que fica montada
	// em separado) — sem o atraso, cada tecla reconstrói a árvore inteira.
	useEffect(() => {
		const timer = setTimeout(() => setFilterText(inputValue), 400)
		return () => clearTimeout(timer)
	}, [inputValue])

	const { flatTree, stats, itemCountByIngredientId, lastReviewByIngredientId, error, refetch, toggleExpand, expandAll, collapseAll } = useIngredientsHierarchy(
		filterText,
		false,
		PERSIST_KEY,
		{ caseSensitive: false, accentSensitive: false },
		[],
		sortDirection,
		true, // abre tudo recolhido, como na árvore de insumos
		false,
		"only"
	)

	const parentRef = useRef<HTMLDivElement>(null)
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 48,
		overscan: 10,
		getItemKey: (index) => flatTree?.nodes[index]?.id ?? index,
		initialOffset: () => getStoredScrollOffset(SCROLL_KEY),
	})
	usePersistScrollOffset(SCROLL_KEY, parentRef, !!flatTree && flatTree.nodes.length > 0)

	if (!flatTree && !error) {
		return (
			<div className="flex items-center justify-center h-96">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error) {
		return (
			<Card className="p-6">
				<div className="text-center space-y-4">
					<p className="text-destructive">Erro ao carregar a árvore de preparações</p>
					<p className="text-sm text-muted-foreground">{error.message}</p>
					<Button onClick={() => refetch()}>Tentar Novamente</Button>
				</div>
			</Card>
		)
	}

	// `byId` traz todo nó incluído, independente de expand/collapse → reflete o filtro.
	const visibleCounts = countVisible(flatTree)

	return (
		<div className="space-y-6">
			<Card className="flex-col lg:flex-row lg:items-center gap-3 p-4 overflow-visible">
				<div className="relative flex-1 min-w-56">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						type="search"
						placeholder="Buscar pastas ou preparações..."
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						className="pl-10"
						aria-label="Buscar na árvore de preparações"
					/>
				</div>
				<div className="flex flex-wrap items-center gap-2 lg:justify-end">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
						aria-label={sortDirection === "asc" ? "Ordenar de Z a A" : "Ordenar de A a Z"}
					>
						{sortDirection === "asc" ? <ArrowDownAZ className="size-4 mr-2" /> : <ArrowDownZA className="size-4 mr-2" />}
						<span className="hidden sm:inline">{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
					</Button>
					<ButtonGroup>
						<Button variant="outline" size="sm" onClick={expandAll} aria-label="Expandir tudo">
							Expandir Tudo
						</Button>
						<Button variant="outline" size="sm" onClick={collapseAll} aria-label="Recolher tudo">
							Recolher Tudo
						</Button>
					</ButtonGroup>
				</div>
			</Card>

			<Card>
				<div ref={parentRef} className="h-150 overflow-auto" role="tree" aria-label="Árvore de preparações do SISUBWEB">
					{flatTree && flatTree.nodes.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
							<p className="font-sans">Nenhuma preparação encontrada</p>
							{filterText && <p className="text-sm mt-2">Tente ajustar a busca</p>}
						</div>
					) : (
						<div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
							{rowVirtualizer.getVirtualItems().map((virtualRow) => {
								const node = flatTree?.nodes[virtualRow.index]
								if (!node) return null
								return (
									<div
										key={virtualRow.key}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											height: `${virtualRow.size}px`,
											transform: `translateY(${virtualRow.start}px)`,
										}}
									>
										{/* canWrite=false: o grupo é só leitura, então editar/excluir não aparecem.
										    `onEdit` é obrigatório na prop, mas fica inalcançável sem essas ações. */}
										<IngredientsTreeNode
											node={node}
											onEdit={() => {}}
											onToggle={toggleExpand}
											itemCount={node.type === "ingredient" ? (itemCountByIngredientId[node.id] ?? 0) : undefined}
											lastReviewedAt={node.type === "ingredient" ? (lastReviewByIngredientId[node.id] ?? null) : undefined}
											canWrite={false}
											onNavigate={
												node.type === "ingredient" ? () => navigate({ to: "/global/ingredients/$ingredientId", params: { ingredientId: node.id } }) : undefined
											}
										/>
									</div>
								)
							})}
						</div>
					)}
				</div>
				{stats && (
					<CardFooter className="flex-col items-start gap-1 text-xs text-muted-foreground select-none sm:flex-row sm:items-center sm:justify-between sm:gap-3">
						<div className="flex items-center gap-3">
							<span>
								{visibleCounts.folders} {visibleCounts.folders === 1 ? "pasta" : "pastas"}
							</span>
							<span aria-hidden>·</span>
							<span>
								{visibleCounts.ingredients} {visibleCounts.ingredients === 1 ? "preparação" : "preparações"}
								{visibleCounts.ingredients !== stats.totalIngredients && <span className="text-muted-foreground/60"> de {stats.totalIngredients}</span>}
							</span>
						</div>
						<span className="sm:text-right">
							Itens migrados do SISUBWEB como insumo, mas que são preparações. Ficam fora do catálogo de insumos e da conferência.
						</span>
					</CardFooter>
				)}
			</Card>
		</div>
	)
}
