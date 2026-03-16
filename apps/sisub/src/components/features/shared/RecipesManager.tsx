import { Link, useParams } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChefHat, GitFork, Search } from "lucide-react"
import { useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRecipes } from "@/hooks/data/useRecipes"

const ROW_HEIGHT = 52

export function RecipesManager() {
	"use no memo"
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = kitchenIdStr ?? null

	const [search, setSearch] = useState("")
	const [filter, setFilter] = useState<"all" | "global" | "local">("all")
	const parentRef = useRef<HTMLDivElement>(null)

	const { data: recipes, isLoading } = useRecipes({
		search: search || undefined,
		global_only: filter === "global",
	})

	const filteredRecipes =
		recipes?.filter((r) => {
			if (filter === "local") return r.kitchen_id !== null
			return true
		}) ?? []

	const virtualizer = useVirtualizer({
		count: filteredRecipes.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
	})

	return (
		<div className="space-y-6">
			{/* Search & Filters */}
			<div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center bg-gradient-to-br from-card to-muted/10 p-5 rounded-xl border border-border/50 shadow-sm">
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Buscar Preparação..."
						className="pl-10 transition-all focus:ring-2 focus:ring-primary/50"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
				<div className="flex gap-2">
					<Button
						variant={filter === "all" ? "secondary" : "ghost"}
						onClick={() => setFilter("all")}
						size="sm"
					>
						Todas
					</Button>
					<Button
						variant={filter === "global" ? "secondary" : "ghost"}
						onClick={() => setFilter("global")}
						size="sm"
					>
						Globais (SDAB)
					</Button>
					<Button
						variant={filter === "local" ? "secondary" : "ghost"}
						onClick={() => setFilter("local")}
						size="sm"
					>
						Locais
					</Button>
				</div>
			</div>

			{/* Virtualized Table */}
			<div className="rounded-xl border border-border/50 bg-gradient-to-br from-card to-muted/5 shadow-sm overflow-hidden">
				{/* Header row */}
				<div className="grid grid-cols-[1fr_80px_110px_120px_190px] border-b border-border/50 bg-muted/30 text-sm font-sans font-semibold text-muted-foreground">
					<div className="px-6 py-3">Nome</div>
					<div className="py-3">Versão</div>
					<div className="py-3">Origem</div>
					<div className="py-3">Rendimento</div>
					<div className="py-3 pr-6 text-right">Ações</div>
				</div>

				{isLoading ? (
					<div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
						Carregando Preparações...
					</div>
				) : filteredRecipes.length === 0 ? (
					<div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
						Nenhuma Preparação encontrada.
					</div>
				) : (
					<div
						ref={parentRef}
						className="overflow-y-auto"
						style={{ height: Math.min(filteredRecipes.length * ROW_HEIGHT, 600) }}
					>
						<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
							{virtualizer.getVirtualItems().map((vRow) => {
								const recipe = filteredRecipes[vRow.index]
								return (
									<div
										key={recipe.id}
										className="grid grid-cols-[1fr_80px_110px_120px_190px] items-center border-b border-border/30 hover:bg-muted/30 transition-colors absolute inset-x-0"
										style={{ top: vRow.start, height: ROW_HEIGHT }}
									>
										<div className="px-6 font-sans font-medium text-sm truncate">
											{recipe.name}
											{recipe.base_recipe_id && (
												<Badge variant="outline" className="ml-2 text-xs font-sans shrink-0">
													Fork
												</Badge>
											)}
										</div>
										<div>
											<Badge
												variant="secondary"
												className="rounded-full px-2.5 py-0.5 font-mono text-xs"
											>
												v{recipe.version}
											</Badge>
										</div>
										<div>
											{recipe.kitchen_id ? (
												<span className="flex items-center text-muted-foreground text-sm font-sans">
													<ChefHat className="w-3.5 h-3.5 mr-1.5" /> Local
												</span>
											) : (
												<span className="flex items-center text-primary text-sm font-medium">
													<span className="w-2 h-2 rounded-full bg-primary mr-2" /> Global
												</span>
											)}
										</div>
										<div className="font-mono text-sm">{recipe.portion_yield} porções</div>
										<div className="flex items-center justify-end gap-2 pr-6">
											{kitchenId ? (
												<Link
													to="/kitchen/$kitchenId/recipes/$recipeId"
													params={{ kitchenId, recipeId: recipe.id }}
												>
													<Button
														variant="ghost"
														size="sm"
														className="hover:bg-primary/10 hover:text-primary transition-all"
													>
														Detalhes
													</Button>
												</Link>
											) : (
												<Link to="/global/recipes/$recipeId" params={{ recipeId: recipe.id }}>
													<Button
														variant="ghost"
														size="sm"
														className="hover:bg-primary/10 hover:text-primary transition-all"
													>
														Detalhes
													</Button>
												</Link>
											)}
											{!recipe.kitchen_id &&
												(kitchenId ? (
													<Link
														to="/kitchen/$kitchenId/recipes/new"
														params={{ kitchenId }}
														search={{ forkFrom: recipe.id }}
													>
														<Button
															variant="outline"
															size="sm"
															title="Criar cópia local"
															className="hover:bg-accent/10 hover:border-accent/30 transition-all"
														>
															<GitFork className="w-3.5 h-3.5 mr-1.5" />
															Personalizar
														</Button>
													</Link>
												) : (
													<Link to="/global/recipes/new" search={{ forkFrom: recipe.id }}>
														<Button
															variant="outline"
															size="sm"
															title="Criar cópia local"
															className="hover:bg-accent/10 hover:border-accent/30 transition-all"
														>
															<GitFork className="w-3.5 h-3.5 mr-1.5" />
															Personalizar
														</Button>
													</Link>
												))}
										</div>
									</div>
								)
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
