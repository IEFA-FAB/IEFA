import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2, Search, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useIngredientsHierarchy } from "@/hooks/data/useIngredientsHierarchy"
import { cn } from "@/lib/cn"
import type { Ingredient } from "@/types/domain/ingredients"

/** Insumo que a lista de destino não aceita — o checkbox fica travado com o motivo ao lado. */
interface ExcludedIngredient {
	/** Motivo, exibido no fim da linha (ex.: "Já adicionado", "Insumo principal"). */
	label: string
	/**
	 * `true` quando o insumo JÁ ESTÁ na lista de destino — aí o travado aparece marcado, porque
	 * marcado é o que ele é. O insumo que está fora da lista e só não pode entrar (o principal,
	 * na tela de substitutos) fica travado e DESMARCADO: marcá-lo diria que "Arroz" é substituto
	 * de si mesmo.
	 */
	checked?: boolean
}

interface IngredientSelectorProps {
	isOpen: boolean
	onClose: () => void
	title?: string
	/** Recebe TODOS os insumos marcados, na ordem em que foram marcados. */
	onSelect: (ingredients: Ingredient[]) => void
	/** Insumos que a lista de destino não aceita, por id. */
	excluded?: ReadonlyMap<string, ExcludedIngredient>
	/** Rótulo do botão de confirmação, recebendo a quantidade marcada. */
	confirmLabel?: (count: number) => string
}

/**
 * Escolha de insumos na árvore do catálogo — SEMPRE por checkbox, com confirmação no rodapé.
 *
 * A seleção era de um por vez e fechava o modal no clique: montar uma ficha com dez insumos,
 * ou cadastrar cinco substitutos de uma linha, significava abrir, buscar e fechar o modal uma
 * vez por item, refazendo a busca do zero a cada volta. Como a marcação guarda o insumo
 * inteiro, e não só o id, ela sobrevive à troca do texto da busca: dá para buscar "feijão",
 * marcar dois, buscar "arroz", marcar mais um e confirmar os três juntos.
 */
export function IngredientSelector({ isOpen, onClose, title = "Selecionar Insumos", onSelect, excluded, confirmLabel }: IngredientSelectorProps) {
	"use no memo"
	const [filterText, setFilterText] = useState("")
	const [checked, setChecked] = useState<ReadonlyMap<string, Ingredient>>(new Map())
	const { flatTree, error } = useIngredientsHierarchy(filterText)

	// Virtualization — callback ref triggers re-render so virtualizer
	// subscribes to the real element instead of stale null from useRef
	const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
	const rowVirtualizer = useVirtualizer({
		count: flatTree?.nodes.length || 0,
		getScrollElement: () => scrollEl,
		estimateSize: () => 48,
		overscan: 10,
		getItemKey: (index) => flatTree?.nodes[index]?.id ?? index,
	})

	const handleClearSearch = () => {
		setFilterText("")
	}

	const handleClose = () => {
		setChecked(new Map())
		onClose()
	}

	const toggle = (ingredient: Ingredient) => {
		setChecked((prev) => {
			const next = new Map(prev)
			if (next.has(ingredient.id)) next.delete(ingredient.id)
			else next.set(ingredient.id, ingredient)
			return next
		})
	}

	const handleConfirm = () => {
		if (checked.size === 0) return
		onSelect([...checked.values()])
		handleClose()
	}

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open, details) => {
				if (open) return
				// Clique fora com marcação em andamento é acidente, não desistência: a confirmação
				// agora é adiada, então um clique no vazio jogaria fora as doze marcas feitas em
				// três buscas diferentes, sem aviso e sem desfazer. Esc e o X seguem fechando —
				// são pedidos explícitos de sair.
				if (details.reason === "outside-press" && checked.size > 0) {
					details.cancel()
					return
				}
				handleClose()
			}}
		>
			<DialogContent
				className="max-w-full sm:max-w-3xl h-screen sm:h-[80vh] flex flex-col p-0 sm:p-6 gap-0 sm:gap-4"
				// Enter confirma de qualquer ponto do modal. Sem isto não havia caminho de teclado:
				// o checkbox do Base UI não reage ao Enter e o input de busca está portalado para
				// fora de qualquer `<form>`, então nada submetia; chegar ao botão pelo Tab exigiria
				// atravessar o catálogo inteiro, já que a lista é virtualizada e monta a linha
				// seguinte a cada foco.
				onKeyDown={(event) => {
					if (event.key !== "Enter" || event.defaultPrevented) return
					// Botão focado age por si (Cancelar, limpar busca, fechar). O checkbox fica de
					// fora da guarda: ele é um `<button>` que ignora o Enter, então ali o atalho vale.
					if ((event.target as HTMLElement).closest('button:not([data-slot="checkbox"])')) return
					event.preventDefault()
					handleConfirm()
				}}
			>
				<DialogHeader className="px-6 pt-6 sm:px-0 sm:pt-0">
					<DialogTitle className="font-sans text-display md:text-2xl">{title}</DialogTitle>
				</DialogHeader>

				{/* Search Bar - Enhanced */}
				<div className="px-6 sm:px-0">
					<div className="relative flex items-center">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground transition-transform group-focus-within:scale-110" />
						<Input
							placeholder="Buscar insumo..."
							value={filterText}
							onChange={(e) => setFilterText(e.target.value)}
							className="pl-10 pr-10 group transition-all focus:ring-2 focus:ring-primary/50"
						/>
						{filterText && (
							<button
								type="button"
								onClick={handleClearSearch}
								className="absolute right-3 top-1/2 -translate-y-1/2 size-5 rounded-full hover:bg-muted transition-colors flex items-center justify-center"
								aria-label="Limpar busca"
							>
								<X className="size-3 text-muted-foreground" />
							</button>
						)}
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-hidden min-h-0 px-6 pb-6 sm:px-0 sm:pb-0">
					{!flatTree && !error ? (
						<div className="flex items-center justify-center h-full">
							<Loader2 className="size-8 animate-spin text-muted-foreground" />
						</div>
					) : error ? (
						<div className="text-destructive text-center p-4">Erro ao carregar insumos</div>
					) : (
						<div ref={setScrollEl} className="h-full overflow-auto border rounded-md bg-card">
							<div
								style={{
									height: `${rowVirtualizer.getTotalSize()}px`,
									width: "100%",
									position: "relative",
								}}
							>
								{rowVirtualizer.getVirtualItems().map((virtualRow) => {
									const node = flatTree?.nodes[virtualRow.index]

									if (!node) return null

									// useIngredientsHierarchy nunca insere ingredient_item na árvore visível
									// (itens de compra vivem em /global/ingredients/$ingredientId)
									const isProduct = node.type === "ingredient"
									const iconBg = node.type === "folder" ? "bg-warning/10 dark:bg-warning/20" : "bg-primary/10 dark:bg-primary/20"
									const iconColor = node.type === "folder" ? "text-warning" : "text-primary"

									const icon = (
										<div
											className={cn(
												"flex items-center justify-center size-7 rounded-md mr-3 border border-border/30 transition-transform",
												iconBg,
												isProduct && "group-hover:scale-110"
											)}
										>
											<span className={cn("text-base", iconColor)}>{node.type === "folder" ? "📁" : "📦"}</span>
										</div>
									)

									const ingredient = isProduct ? (node.data as Ingredient | undefined) : undefined
									const exclusion = ingredient ? excluded?.get(ingredient.id) : undefined

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
											{ingredient ? (
												<label
													htmlFor={`ingredient-pick-${ingredient.id}`}
													className={cn(
														"flex items-center gap-3 p-3 w-full h-full border-b border-border/50 transition-all duration-150",
														exclusion ? "text-muted-foreground" : "hover:bg-primary/5",
														checked.has(ingredient.id) && "bg-primary/5"
													)}
													style={{ paddingLeft: `${node.level * 20 + 12}px` }}
												>
													<Checkbox
														id={`ingredient-pick-${ingredient.id}`}
														checked={exclusion ? exclusion.checked === true : checked.has(ingredient.id)}
														disabled={exclusion != null}
														onCheckedChange={() => toggle(ingredient)}
													/>
													{icon}
													<span className="flex-1 font-sans text-sm text-subheading">{node.label}</span>
													{exclusion && <span className="ml-auto text-xs text-muted-foreground">{exclusion.label}</span>}
												</label>
											) : (
												// Pasta: estrutura da árvore, não é escolhível.
												<div
													className="flex items-center p-3 w-full h-full border-b border-border/50 text-muted-foreground"
													style={{ paddingLeft: `${node.level * 20 + 12}px` }}
												>
													{icon}
													<span className="flex-1 font-sans text-sm">{node.label}</span>
												</div>
											)}
										</div>
									)
								})}
							</div>
						</div>
					)}
				</div>

				<div className="flex items-center justify-between gap-3 px-6 pb-6 sm:px-0 sm:pb-0">
					<span className="text-sm text-muted-foreground" aria-live="polite">
						{checked.size === 0 ? "Nenhum insumo marcado" : checked.size === 1 ? "1 insumo marcado" : `${checked.size} insumos marcados`}
					</span>
					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancelar
						</Button>
						<Button type="button" onClick={handleConfirm} disabled={checked.size === 0}>
							{confirmLabel ? confirmLabel(checked.size) : "Adicionar"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
