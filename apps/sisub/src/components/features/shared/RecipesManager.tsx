import type { RecipeSummary } from "@iefa/sisub-domain"
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDownAZ, ArrowDownZA, CalendarCheck, ChefHat, Folder as FolderIcon, GitFork, Globe, Replace, Search, SquareCheckBig, X } from "lucide-react"
import { type ReactNode, type Ref, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardFooter } from "@/components/ui/card"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TREE_LEAF_TONE, TREE_MUTED_TONE, TreeRow, treeFolderTone } from "@/components/ui/tree-row"
import type { BulkSelectedRecipe } from "@/hooks/business/useBulkRecipeOps"
import { useRecipeFolders } from "@/hooks/data/useRecipeFolders"
import { useRecipeLastReviews, useRecipeMenuUsage, useRecipes } from "@/hooks/data/useRecipes"
import { usePersistentState } from "@/hooks/ui/usePersistentState"
import { getStoredScrollOffset, usePersistScrollOffset } from "@/hooks/ui/useScrollRestoration"
import { cn } from "@/lib/cn"
import { datedCsvFilename, downloadCsv } from "@/lib/csv"
import { pluralize } from "@/lib/flows/model"
import { allRecipeFolderIds, buildRecipeTree, type RecipeTreeNode } from "@/lib/recipe-tree"
import { buildRecipesCsv } from "@/lib/recipes-csv"
import { RecipeFoldersDialog } from "./RecipeFoldersDialog"
import { RecipeHoverContent } from "./RecipeLink"
import { RecipesBulkActionsBar } from "./RecipesBulkActionsBar"
import { RecipesFindReplaceDialog } from "./RecipesFindReplaceDialog"
import { describeSelectVisible, pickEmptyRecipesHint } from "./recipes-manager-state"
import { SearchOptionsPopover } from "./SearchOptionsPopover"

const ROW_HEIGHT = 48

/** Ações do catálogo de pastas e a exportação ficam no PageHeader da rota, como em Insumos. */
export type RecipesManagerHandle = { openFoldersDialog: () => void; exportCsv: () => void }

/** Formata a data ISO da revisão como "09/06/2026" (curto, pt-BR). Espelha a árvore de insumos. */
function formatReviewDate(iso: string): string {
	return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/**
 * Listagem de preparações — MESMA navegação da árvore de insumos.
 *
 * A pasta era só um filtro num `<Select>`: para saber o que estava em cada uma, era
 * preciso trocar o filtro N vezes, e o agrupamento não aparecia em lugar nenhum. Agora
 * ela é a estrutura da listagem (`lib/recipe-tree`), com o mesmo nó de linha
 * (`ui/tree-row`), o mesmo par Expandir/Recolher e a mesma barra de busca dos insumos.
 *
 * O catálogo de pastas continua PLANO no banco (`recipe_folder` não tem `parent_id`),
 * então a árvore tem dois níveis; a diferença é de dados, não de interface.
 */
export function RecipesManager({ ref }: { ref?: Ref<RecipesManagerHandle> }) {
	"use no memo"
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = kitchenIdStr ?? null
	const kitchenIdNum = kitchenIdStr ? Number(kitchenIdStr) : null
	const persistKey = `sisub:recipes:${kitchenIdStr ?? "global"}`
	const scrollKey = `${persistKey}:scroll`

	const { search: urlSearch = "", type = "all" } = useSearch({ strict: false }) as {
		search?: string
		type?: "all" | "global" | "local"
	}
	const navigate = useNavigate()
	const navigateRef = useRef(navigate)
	navigateRef.current = navigate

	const [inputValue, setInputValue] = useState(urlSearch)
	const isFirstRender = useRef(true)

	useEffect(() => {
		if (isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		const timer = setTimeout(() => {
			// biome-ignore lint/suspicious/noExplicitAny: shared component, navigate has no from context
			navigateRef.current({ search: { search: inputValue || undefined, type: type === "all" ? undefined : type } as any, replace: true })
		}, 400)
		return () => clearTimeout(timer)
	}, [inputValue, type])

	const parentRef = useRef<HTMLDivElement>(null)

	// Sensibilidade da busca (persistida por aba). Default: insensível a ambos.
	const [searchCaseSensitive, setSearchCaseSensitive] = usePersistentState("sisub:recipes:search:caseSensitive", false)
	const [searchAccentSensitive, setSearchAccentSensitive] = usePersistentState("sisub:recipes:search:accentSensitive", false)

	// Ordenação alfabética (A-Z / Z-A). Persistida por aba.
	const [sortDirection, setSortDirection] = usePersistentState<"asc" | "desc">("sisub:recipes:sort", "asc")

	// Seleção em massa
	const [selectionMode, setSelectionMode] = useState(false)
	const [showDeleted, setShowDeleted] = usePersistentState(`${persistKey}:showDeleted`, false)
	const [findReplaceOpen, setFindReplaceOpen] = useState(false)
	// Filtro: mostrar apenas preparações usadas em algum plano semanal.
	const [onlyWeeklyMenu, setOnlyWeeklyMenu] = usePersistentState(`${persistKey}:onlyWeeklyMenu`, false)
	// Filtro: mostrar apenas preparações ainda não revisadas (conferência pendente).
	const [onlyNotReviewed, setOnlyNotReviewed] = usePersistentState(`${persistKey}:onlyNotReviewed`, false)
	const [foldersDialogOpen, setFoldersDialogOpen] = useState(false)
	const [selected, setSelected] = useState<Map<string, BulkSelectedRecipe>>(new Map())
	const selectedRecipes = useMemo(() => Array.from(selected.values()), [selected])
	const searchCaseId = useId()
	const searchAccentId = useId()
	const onlyWeeklyMenuId = useId()
	const onlyNotReviewedId = useId()

	// A busca textual NÃO vai aqui: ela também casa nome de pasta, e isso é decidido na
	// montagem da árvore (ver `buildRecipeTree`). O resto do recorte continua no hook.
	const recipesQuery = useRecipes({
		origin: type,
		includeDeleted: showDeleted,
		caseSensitive: searchCaseSensitive,
		accentSensitive: searchAccentSensitive,
		sortDirection,
	})
	const { data: allRecipes = [], isLoading } = recipesQuery

	// Preparações usadas em planos semanais → revisão prioritária pelas nutricionistas.
	const menuUsageQuery = useRecipeMenuUsage()
	const { usedIds: menuUsageIds } = menuUsageQuery
	// Status de revisão (conferência) por preparação — para o badge por linha e o filtro de pendentes.
	const reviewsQuery = useRecipeLastReviews()
	const { reviewedAtById, isLoading: reviewsLoading } = reviewsQuery
	// Pastas — o agrupamento que estrutura a listagem.
	const foldersQuery = useRecipeFolders()
	const { folders } = foldersQuery

	const filteredRecipes = useMemo(() => {
		let list = allRecipes
		if (onlyWeeklyMenu) list = list.filter((r) => menuUsageIds.has(r.id))
		// Só filtra por revisão quando o mapa já chegou — com o Map ainda vazio, `!has` seria
		// verdadeiro para todas e a lista completa apareceria antes de sumir (flash). O gate de
		// loading abaixo mostra o spinner nesse meio-tempo.
		if (onlyNotReviewed && !reviewsLoading) list = list.filter((r) => !reviewedAtById.has(r.id))
		return list
	}, [allRecipes, onlyWeeklyMenu, onlyNotReviewed, reviewsLoading, menuUsageIds, reviewedAtById])

	// Estado de expand/collapse persistido por aba (preserva o que estava aberto ao entrar numa
	// preparação e voltar). Guarda as pastas ABERTAS: a tela abre com TUDO RECOLHIDO, o índice
	// de pastas primeiro, e quem procura uma preparação usa a busca (que já abre a árvore
	// inteira por `autoExpand`). Já foi o contrário — guardava as fechadas, default tudo aberto
	// — e a listagem inteira do catálogo caía de uma vez na primeira dobra. Efeito colateral
	// aceito: pasta criada depois (ou por outro usuário) nasce fechada, como todas as outras.
	// A chave mudou de `:collapsed` para `:expanded` de propósito — reaproveitá-la faria o
	// conjunto salvo pela versão anterior ser lido com o sentido invertido.
	const [expandedIds, setExpandedIds] = usePersistentState<Set<string>>(`${persistKey}:expanded`, new Set(), {
		serialize: (s) => JSON.stringify([...s]),
		deserialize: (raw) => new Set(JSON.parse(raw) as string[]),
	})

	// Busca textual abre a árvore inteira (igual aos insumos). Qualquer filtro RESTRITIVO —
	// inclusive a origem — esconde pasta que ficou sem resultado; sem isso, escolher uma origem
	// sem correspondência devolvia uma parede de pastas "0 preparações" e o estado vazio da tela
	// nunca aparecia. "Excluídas" não entra: ela amplia o conjunto, não restringe.
	const autoExpand = !!urlSearch || onlyWeeklyMenu || onlyNotReviewed
	const hideEmptyFolders = autoExpand || type !== "all"

	// `buildRecipeTree` fala em pastas FECHADAS (o default dele é aberto, o que a árvore de
	// seleção do planejamento ainda usa). O complemento é tirado aqui, uma vez, em vez de
	// duplicar a semântica no módulo puro.
	const collapsedIds = useMemo(() => {
		const all = allRecipeFolderIds(folders)
		for (const id of expandedIds) all.delete(id)
		return all
	}, [folders, expandedIds])

	// O clique inverte o que a LINHA mostra, não o que está guardado: sob `autoExpand` (busca
	// ou filtro) a pasta aparece aberta mesmo fora de `expandedIds`, e inverter o conjunto ali
	// gravaria "abrir" para quem clicou em fechar — a pasta voltaria como a única aberta
	// quando a busca fosse limpa.
	const toggleExpand = (folderId: string) => {
		const showsExpanded = autoExpand || expandedIds.has(folderId)
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (showsExpanded) next.delete(folderId)
			else next.add(folderId)
			return next
		})
	}
	const expandAll = () => setExpandedIds(allRecipeFolderIds(folders))
	const collapseAll = () => setExpandedIds(new Set())

	const tree = useMemo(
		() =>
			buildRecipeTree({
				folders,
				recipes: filteredRecipes,
				filterText: urlSearch,
				sensitivity: { caseSensitive: searchCaseSensitive, accentSensitive: searchAccentSensitive },
				sortDirection,
				collapsedIds,
				autoExpand,
				hideEmptyFolders,
			}),
		[folders, filteredRecipes, urlSearch, searchCaseSensitive, searchAccentSensitive, sortDirection, collapsedIds, autoExpand, hideEmptyFolders]
	)

	// Enquanto o filtro de pendentes está ativo e o mapa de revisões carrega (1ª visita, sem
	// cache), exibe loading em vez de uma lista transitoriamente incorreta.
	const showLoading = isLoading || (onlyNotReviewed && reviewsLoading)

	const clearSelection = () => setSelected(new Map())

	const exitSelectionMode = () => {
		setSelectionMode(false)
		clearSelection()
	}

	const toggleSelect = (recipe: (typeof filteredRecipes)[number], checked: boolean) => {
		setSelected((prev) => {
			const next = new Map(prev)
			if (checked) next.set(recipe.id, { id: recipe.id, name: recipe.name, kitchenId: recipe.kitchen_id, deleted: recipe.deleted_at != null })
			else next.delete(recipe.id)
			return next
		})
	}

	// "Visíveis" = o que está renderizado na árvore. Preparação dentro de pasta recolhida
	// fica de fora — a ação em massa nunca deve alcançar o que a tela não mostra. Com a tela
	// abrindo recolhida, isso pode ser ZERO: daí a contagem no rótulo e o botão desabilitado,
	// em vez de um clique que não seleciona nada e não explica por quê.
	const visibleRecipeCount = useMemo(() => tree.nodes.reduce((count, node) => count + (node.type === "recipe" ? 1 : 0), 0), [tree])

	const selectAllVisible = () => {
		setSelected((prev) => {
			const next = new Map(prev)
			for (const node of tree.nodes) {
				if (node.type !== "recipe") continue
				const r = node.data
				next.set(r.id, { id: r.id, name: r.name, kitchenId: r.kitchen_id, deleted: r.deleted_at != null })
			}
			return next
		})
	}

	// Conta o que sobrou de TODOS os filtros, texto incluso — por isso vem da árvore, e não
	// de `filteredRecipes`, que ainda não passou pela busca.
	const stats = useMemo(() => {
		const total = tree.matched.length
		const global = tree.matched.filter((r) => !r.kitchen_id).length
		return { total, global, local: total - global }
	}, [tree])

	// Exporta o mesmo recorte que a contagem acima: todos os filtros aplicados, pastas
	// recolhidas incluídas — o CSV não depende de quais pastas estão abertas na tela. A árvore
	// é remontada toda aberta só no clique, com a mesma ordem e agrupamento da listagem.
	const exportCsv = () => {
		// Plano semanal, revisão e pastas viram colunas: exportar antes de chegarem (ou com erro)
		// sairia com "Não", data vazia e tudo em "Sem pasta" sem aviso nenhum.
		const sources = [recipesQuery, menuUsageQuery, reviewsQuery, foldersQuery]
		if (sources.some((q) => q.isLoading)) {
			toast.error("Aguarde o carregamento das preparações")
			return
		}
		if (sources.some((q) => q.isError)) {
			toast.error("Não foi possível carregar todos os dados da listagem. Recarregue a página e tente de novo.")
			return
		}
		if (tree.matched.length === 0) {
			toast.error("Nenhuma preparação para exportar com os filtros atuais")
			return
		}
		const { nodes } = buildRecipeTree({
			folders,
			recipes: filteredRecipes,
			filterText: urlSearch,
			sensitivity: { caseSensitive: searchCaseSensitive, accentSensitive: searchAccentSensitive },
			sortDirection,
			autoExpand: true,
			hideEmptyFolders: true,
		})
		downloadCsv(
			datedCsvFilename(kitchenId ? `preparacoes_cozinha_${kitchenId}` : "preparacoes_globais"),
			buildRecipesCsv({ nodes, menuUsageIds, reviewedAtById })
		)
		toast.success(pluralize(tree.matched.length, "preparação exportada", "preparações exportadas"))
	}
	// O handle é estável; o clique lê o `exportCsv` do render mais recente.
	const exportCsvRef = useRef(exportCsv)
	exportCsvRef.current = exportCsv
	useImperativeHandle(ref, () => ({ openFoldersDialog: () => setFoldersDialogOpen(true), exportCsv: () => exportCsvRef.current() }), [])

	function setOrigin(value: "all" | "global" | "local") {
		// biome-ignore lint/suspicious/noExplicitAny: shared component, navigate has no from context
		navigate({ search: { search: urlSearch || undefined, type: value === "all" ? undefined : value } as any, replace: true })
	}

	function navigateToRecipe(recipeId: string) {
		if (kitchenId) {
			navigate({ to: "/kitchen/$kitchenId/recipes/$recipeId", params: { kitchenId, recipeId } })
		} else {
			navigate({ to: "/global/recipes/$recipeId", params: { recipeId } })
		}
	}

	const virtualizer = useVirtualizer({
		count: tree.nodes.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
		getItemKey: (index) => tree.nodes[index]?.id ?? index,
		// Restaura o offset salvo ao remontar (ex: voltar de uma página de detalhe).
		initialOffset: () => getStoredScrollOffset(scrollKey),
	})

	// Persiste o offset de scroll continuamente.
	usePersistScrollOffset(scrollKey, parentRef, !isLoading && tree.nodes.length > 0)

	const renderRows = () => (
		<div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
			{virtualizer.getVirtualItems().map((vRow) => {
				const node = tree.nodes[vRow.index]
				if (!node) return null
				const rowStyle = {
					position: "absolute" as const,
					top: 0,
					left: 0,
					width: "100%",
					height: `${vRow.size}px`,
					transform: `translateY(${vRow.start}px)`,
				}

				if (node.type === "folder") {
					return (
						<div key={vRow.key} style={rowStyle}>
							<RecipeFolderRow node={node} onToggle={() => toggleExpand(node.id)} />
						</div>
					)
				}

				const recipe = node.data
				return (
					<div key={vRow.key} style={rowStyle}>
						<RecipeLeafRow
							recipe={recipe}
							kitchenId={kitchenId}
							showOrigin={kitchenIdNum != null}
							selectionMode={selectionMode}
							isSelected={selected.has(recipe.id)}
							isInWeeklyMenu={menuUsageIds.has(recipe.id)}
							reviewedAt={reviewedAtById.get(recipe.id)}
							onSelectChange={(checked) => toggleSelect(recipe, checked)}
							onActivate={() => navigateToRecipe(recipe.id)}
						/>
					</div>
				)
			})}
		</div>
	)

	return (
		<div className="space-y-6">
			{/* Toolbar. Só vira uma linha quando as duas metades cabem de fato: busca (~320px)
			    + as quatro ações (~700px). Com a sidebar fixa isso acontece por volta de 1400px
			    de viewport — em `lg` (1024) a busca era espremida a 215px e o placeholder cortava. */}
			<Card className="flex-col min-[1400px]:flex-row min-[1400px]:items-center gap-3 p-4 overflow-visible">
				{/* Busca + opções de busca (esquerda). No modo linha, `basis-80 min-w-80` reserva o
				    par campo+Opções: sem piso, o flex encolhia este bloco e o botão saía por baixo
				    das ações. As três utilidades ficam no breakpoint porque `basis` no eixo coluna
				    vira ALTURA — solto, inflava o card em 320px. */}
				<div className="flex items-center gap-2 min-[1400px]:flex-1 min-[1400px]:basis-80 min-[1400px]:min-w-80">
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

					<SearchOptionsPopover
						options={[
							{ id: searchCaseId, label: "Diferenciar maiúsculas", checked: searchCaseSensitive, onCheckedChange: setSearchCaseSensitive },
							{ id: searchAccentId, label: "Diferenciar acentos", checked: searchAccentSensitive, onCheckedChange: setSearchAccentSensitive },
							{ id: onlyWeeklyMenuId, label: "Apenas em plano semanal", checked: onlyWeeklyMenu, onCheckedChange: setOnlyWeeklyMenu },
							{ id: onlyNotReviewedId, label: "Somente não revisadas", checked: onlyNotReviewed, onCheckedChange: setOnlyNotReviewed },
						]}
					/>
				</div>

				{/* Ações (direita) — `min-w-0` deixa o bloco encolher e quebrar em duas linhas
				    em vez de transbordar por cima da busca. */}
				<div className="flex flex-wrap items-center gap-2 min-w-0 min-[1400px]:justify-end">
					<RecipesToolbarActions
						selectionMode={selectionMode}
						visibleRecipeCount={visibleRecipeCount}
						onSelectAllVisible={selectAllVisible}
						onExitSelectionMode={exitSelectionMode}
						sortDirection={sortDirection}
						onToggleSort={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
						onExpandAll={expandAll}
						onCollapseAll={collapseAll}
						onOpenFindReplace={() => setFindReplaceOpen(true)}
						onEnterSelectionMode={() => setSelectionMode(true)}
					/>
				</div>
			</Card>

			{/* Árvore Virtualizada */}
			<Card>
				<div ref={parentRef} className="h-150 overflow-auto" role="tree" aria-label="Árvore de preparações">
					<RecipesTreeBody
						showLoading={showLoading}
						isEmpty={tree.nodes.length === 0}
						emptyHint={pickEmptyRecipesHint({ onlyNotReviewed, onlyWeeklyMenu, urlSearch })}
						renderRows={renderRows}
					/>
				</div>
				<RecipesFooter
					folderCount={tree.folderCount}
					stats={stats}
					type={type}
					onOriginChange={setOrigin}
					showDeleted={showDeleted}
					onShowDeletedChange={setShowDeleted}
				/>
			</Card>

			{/* Localizar e substituir */}
			<RecipesFindReplaceDialog isOpen={findReplaceOpen} onClose={() => setFindReplaceOpen(false)} kitchenId={kitchenIdNum} />

			{/* Catálogo de pastas (criar / renomear / excluir) — aberto pelo PageHeader da rota. */}
			<RecipeFoldersDialog open={foldersDialogOpen} onOpenChange={setFoldersDialogOpen} />

			{/* Barra de ações em massa */}
			{selectionMode && selectedRecipes.length > 0 && (
				<RecipesBulkActionsBar
					selectedRecipes={selectedRecipes}
					kitchenId={kitchenIdNum}
					showDeleted={showDeleted}
					onClear={clearSelection}
					onDone={clearSelection}
				/>
			)}
		</div>
	)
}

/** Ações da barra (direita): as de seleção em massa ou as de navegação/edição da árvore. */
function RecipesToolbarActions({
	selectionMode,
	visibleRecipeCount,
	onSelectAllVisible,
	onExitSelectionMode,
	sortDirection,
	onToggleSort,
	onExpandAll,
	onCollapseAll,
	onOpenFindReplace,
	onEnterSelectionMode,
}: {
	selectionMode: boolean
	visibleRecipeCount: number
	onSelectAllVisible: () => void
	onExitSelectionMode: () => void
	sortDirection: "asc" | "desc"
	onToggleSort: () => void
	onExpandAll: () => void
	onCollapseAll: () => void
	onOpenFindReplace: () => void
	onEnterSelectionMode: () => void
}) {
	if (selectionMode) {
		const { ariaLabel, countSuffix } = describeSelectVisible(visibleRecipeCount)
		return (
			<>
				<Button variant="outline" size="sm" onClick={onSelectAllVisible} disabled={visibleRecipeCount === 0} aria-label={ariaLabel}>
					Selecionar Visíveis{countSuffix}
				</Button>
				<Button variant="outline" size="sm" onClick={onExitSelectionMode} aria-label="Sair do modo de seleção">
					<X className="size-4 mr-2" />
					Concluir Seleção
				</Button>
			</>
		)
	}
	return (
		<>
			<Button variant="outline" size="sm" onClick={onToggleSort} aria-label={sortDirection === "asc" ? "Ordenar de Z a A" : "Ordenar de A a Z"}>
				{sortDirection === "asc" ? <ArrowDownAZ className="size-4 mr-2" /> : <ArrowDownZA className="size-4 mr-2" />}
				<span className="hidden sm:inline">{sortDirection === "asc" ? "A-Z" : "Z-A"}</span>
			</Button>

			<ButtonGroup>
				<Button variant="outline" size="sm" onClick={onExpandAll} aria-label="Expandir tudo">
					Expandir Tudo
				</Button>
				<Button variant="outline" size="sm" onClick={onCollapseAll} aria-label="Recolher tudo">
					Recolher Tudo
				</Button>
			</ButtonGroup>

			<Button variant="outline" size="sm" onClick={onOpenFindReplace} aria-label="Localizar e substituir">
				<Replace className="size-4 mr-2" />
				<span className="hidden sm:inline">Localizar e Substituir</span>
				<span className="sm:hidden">Substituir</span>
			</Button>
			<Button variant="outline" size="sm" onClick={onEnterSelectionMode} aria-label="Selecionar itens">
				<SquareCheckBig className="size-4 mr-2" />
				<span className="hidden sm:inline">Selecionar Itens</span>
				<span className="sm:hidden">Selecionar</span>
			</Button>
		</>
	)
}

/** Conteúdo do card da árvore: carga, estado vazio ou as linhas virtualizadas (`renderRows`, só chamado quando aparecem). */
function RecipesTreeBody({
	showLoading,
	isEmpty,
	emptyHint,
	renderRows,
}: {
	showLoading: boolean
	isEmpty: boolean
	emptyHint: string | null
	renderRows: () => ReactNode
}) {
	if (showLoading) {
		return <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Carregando preparações...</div>
	}
	if (isEmpty) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
				<p className="font-sans">Nenhuma preparação encontrada</p>
				{emptyHint && <p className="text-sm mt-2">{emptyHint}</p>}
			</div>
		)
	}
	return renderRows()
}

/** Linha de pasta da árvore de preparações. */
function RecipeFolderRow({ node, onToggle }: { node: Extract<RecipeTreeNode, { type: "folder" }>; onToggle: () => void }) {
	return (
		<TreeRow
			level={0}
			hasChildren={node.hasChildren}
			isExpanded={node.isExpanded}
			onToggle={onToggle}
			icon={FolderIcon}
			// "Sem pasta" não é uma pasta do catálogo: fica em tom neutro.
			tone={node.isUnfiled ? TREE_MUTED_TONE : treeFolderTone(0)}
			label={node.label}
			onActivate={node.hasChildren ? onToggle : undefined}
		>
			<span className={cn("text-sm truncate leading-normal font-bold uppercase tracking-wide", node.isUnfiled && "text-muted-foreground")}>{node.label}</span>
			<Badge variant="outline" className="shrink-0 text-muted-foreground">
				{node.recipeCount} {node.recipeCount === 1 ? "preparação" : "preparações"}
			</Badge>
		</TreeRow>
	)
}

/** Fork só existe para preparação global: é a cópia local dela. */
function ForkRecipeAction({ recipeId, kitchenId }: { recipeId: string; kitchenId: string | null }) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label="Criar cópia local"
						nativeButton={false}
						className="hover:bg-accent/10 transition-all"
						render={
							kitchenId ? (
								<Link to="/kitchen/$kitchenId/recipes/new" params={{ kitchenId }} search={{ forkFrom: recipeId }} onClick={(e) => e.stopPropagation()}>
									<GitFork className="size-3.5" />
								</Link>
							) : (
								<Link to="/global/recipes/new" search={{ forkFrom: recipeId }} onClick={(e) => e.stopPropagation()}>
									<GitFork className="size-3.5" />
								</Link>
							)
						}
					/>
				}
			/>
			<TooltipContent>Criar cópia local</TooltipContent>
		</Tooltip>
	)
}

/** Badge de conferência da preparação (não aparece em preparação excluída). */
function RecipeReviewBadge({ reviewedAt }: { reviewedAt: string | undefined }) {
	if (reviewedAt) {
		return (
			<Tooltip>
				<TooltipTrigger
					render={
						<Badge variant="outline" className="text-muted-foreground shrink-0">
							<CalendarCheck className="size-3" />
							<span className="hidden sm:inline">Revisada {formatReviewDate(reviewedAt)}</span>
						</Badge>
					}
				/>
				<TooltipContent>Última revisão em {formatReviewDate(reviewedAt)}</TooltipContent>
			</Tooltip>
		)
	}
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Badge variant="warning" className="shrink-0">
						Não revisada
					</Badge>
				}
			/>
			<TooltipContent>Preparação ainda não revisada</TooltipContent>
		</Tooltip>
	)
}

/** Linha de preparação da árvore. */
function RecipeLeafRow({
	recipe,
	kitchenId,
	showOrigin,
	selectionMode,
	isSelected,
	isInWeeklyMenu,
	reviewedAt,
	onSelectChange,
	onActivate,
}: {
	recipe: RecipeSummary
	kitchenId: string | null
	/** Na listagem de uma cozinha: distingue global de cópia local. */
	showOrigin: boolean
	selectionMode: boolean
	isSelected: boolean
	isInWeeklyMenu: boolean
	reviewedAt: string | undefined
	onSelectChange: (checked: boolean) => void
	onActivate: () => void
}) {
	const isDeleted = !!recipe.deleted_at
	return (
		<TreeRow
			level={1}
			icon={recipe.kitchen_id ? ChefHat : Globe}
			tone={recipe.kitchen_id ? TREE_MUTED_TONE : TREE_LEAF_TONE}
			label={recipe.name}
			selectionMode={selectionMode}
			selected={isSelected}
			onSelectChange={onSelectChange}
			onActivate={onActivate}
			// Rendimento é leitura: fica no `meta` para não sumir junto com as ações
			// quando o modo de seleção em massa liga.
			meta={recipe.portion_yield != null ? <span className="text-sm text-muted-foreground font-mono">{recipe.portion_yield} porções</span> : undefined}
			actions={
				// Fork só existe para preparação global: é a cópia local dela.
				!recipe.kitchen_id ? <ForkRecipeAction recipeId={recipe.id} kitchenId={kitchenId} /> : undefined
			}
		>
			<HoverCard>
				<HoverCardTrigger
					render={<span className={cn("text-sm truncate font-normal cursor-default", isDeleted && "line-through text-muted-foreground")}>{recipe.name}</span>}
				/>
				<HoverCardContent side="right" align="start">
					<RecipeHoverContent recipeId={recipe.id} summary={recipe} />
				</HoverCardContent>
			</HoverCard>
			{isDeleted && <Badge variant="destructive">Excluída</Badge>}
			{isInWeeklyMenu && (
				<Tooltip>
					<TooltipTrigger
						render={
							<Badge variant="accent" className="shrink-0">
								<CalendarCheck />
								<span className="hidden sm:inline">Plano semanal</span>
							</Badge>
						}
					/>
					<TooltipContent>Usada em plano semanal — priorize a revisão</TooltipContent>
				</Tooltip>
			)}
			{!isDeleted && <RecipeReviewBadge reviewedAt={reviewedAt} />}
			{recipe.version > 1 && (
				<Badge variant="secondary" className="rounded-full py-0 font-mono shrink-0">
					v{recipe.version}
				</Badge>
			)}
			{/* Na listagem de uma cozinha convivem as preparações globais (catálogo da SDAB)
			    e as cópias locais dela. `base_recipe_id` NÃO distingue as duas: toda versão a
			    partir da segunda o carrega, seja global ou local. O sinal correto é kitchen_id. */}
			{showOrigin && (
				<Badge variant={recipe.kitchen_id == null ? "outline" : "secondary"} className="text-xs shrink-0">
					{recipe.kitchen_id == null ? "Global" : "Cópia local"}
				</Badge>
			)}
		</TreeRow>
	)
}

/** Rodapé: contagem do recorte + origem e "Excluídas". */
function RecipesFooter({
	folderCount,
	stats,
	type,
	onOriginChange,
	showDeleted,
	onShowDeletedChange,
}: {
	folderCount: number
	stats: { total: number; global: number; local: number }
	type: "all" | "global" | "local"
	onOriginChange: (value: "all" | "global" | "local") => void
	showDeleted: boolean
	onShowDeletedChange: (value: boolean) => void
}) {
	return (
		<CardFooter className="flex-col items-stretch gap-3 text-xs text-muted-foreground select-none sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-3">
				<span>
					{folderCount} {folderCount === 1 ? "pasta" : "pastas"}
				</span>
				<span aria-hidden>·</span>
				<span>
					{stats.total} {stats.total === 1 ? "preparação" : "preparações"}
				</span>
				{type === "all" && stats.total > 0 && (
					<>
						<span aria-hidden>·</span>
						<span>
							{stats.global} {stats.global === 1 ? "global" : "globais"}
						</span>
						<span aria-hidden>·</span>
						<span>
							{stats.local} {stats.local === 1 ? "local" : "locais"}
						</span>
					</>
				)}
			</div>

			{/* Recortes de visualização — mesmo lugar dos chips da árvore de insumos.
			    A origem saiu da barra de busca: com ela lá, a barra não cabia em 1440. */}
			<div className="flex items-center gap-2 flex-wrap sm:justify-end">
				<span className="font-medium mr-0.5">Origem</span>
				<ToggleGroup
					value={[type]}
					// Base UI devolve array mesmo em seleção única; desmarcar volta para "Todas".
					onValueChange={(value) => onOriginChange((value[0] as "all" | "global" | "local") ?? "all")}
					variant="outline"
					size="sm"
					spacing={1}
					aria-label="Origem da preparação"
				>
					<ToggleGroupItem value="all" aria-label="Todas as origens">
						Todas
					</ToggleGroupItem>
					<ToggleGroupItem value="global" aria-label="Globais (SDAB)">
						Globais (SDAB)
					</ToggleGroupItem>
					<ToggleGroupItem value="local" aria-label="Locais">
						Locais
					</ToggleGroupItem>
				</ToggleGroup>
				<span className="font-medium ml-2 mr-0.5">Mostrar</span>
				<ToggleGroup
					value={showDeleted ? ["excluidas"] : []}
					onValueChange={(value) => onShowDeletedChange(value.includes("excluidas"))}
					multiple
					variant="outline"
					size="sm"
					spacing={1}
					aria-label="Filtros rápidos de busca"
				>
					<ToggleGroupItem value="excluidas" aria-label="Excluídas">
						Excluídas
					</ToggleGroupItem>
				</ToggleGroup>
			</div>
		</CardFooter>
	)
}
