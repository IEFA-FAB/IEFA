import { Link, useParams } from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChefHat, GitFork, Globe, Search, TextSearch } from "lucide-react"
import { useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useRecipes } from "@/hooks/data/useRecipes"

const ROW_HEIGHT = 52

export function RecipesManager() {
	"use no memo"
	const { kitchenId: kitchenIdStr } = useParams({ strict: false })
	const kitchenId = kitchenIdStr ?? null

	const [search, setSearch] = useState("")
	const [origin, setOrigin] = useState<"all" | "global" | "local">("all")
	const parentRef = useRef<HTMLDivElement>(null)

	const { data: filteredRecipes = [], isLoading } = useRecipes({
		search: search || undefined,
		origin,
	})

	const virtualizer = useVirtualizer({
		count: filteredRecipes.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 10,
	})

	return (
		<div className="space-y-6">
			{/* Search & Filters */}
			<div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center bg-card p-5 rounded-md border">
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input placeholder="Buscar Preparação..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
				</div>
				<div className="flex gap-2">
					<Button variant={origin === "all" ? "secondary" : "ghost"} onClick={() => setOrigin("all")} size="sm">
						Todas
					</Button>
					<Button variant={origin === "global" ? "secondary" : "ghost"} onClick={() => setOrigin("global")} size="sm">
						Globais (SDAB)
					</Button>
					<Button variant={origin === "local" ? "secondary" : "ghost"} onClick={() => setOrigin("local")} size="sm">
						Locais
					</Button>
				</div>
			</div>

			{/* Virtualized Table */}
			<div className="rounded-md border bg-card overflow-hidden">
				{/* Header row */}
				<div className="grid grid-cols-[1fr_80px_110px_120px_190px] border-b border-border/50 bg-muted/30 text-sm font-sans font-semibold text-muted-foreground">
					<div className="px-6 py-3">Nome</div>
					<div className="py-3">Versão</div>
					<div className="py-3">Origem</div>
					<div className="py-3">Rendimento</div>
					<div className="py-3 pr-6 text-right">Ações</div>
				</div>

				{isLoading ? (
					<div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Carregando Preparações...</div>
				) : filteredRecipes.length === 0 ? (
					<div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Nenhuma Preparação encontrada.</div>
				) : (
					<div ref={parentRef} className="h-[600px] overflow-y-auto">
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
											<Badge variant="secondary" className="rounded-full px-2.5 py-0.5 font-mono text-xs">
												{recipe.version}
											</Badge>
										</div>
										<div>
											{recipe.kitchen_id ? (
												<span className="flex items-center text-muted-foreground text-sm font-sans">
													<ChefHat className="w-3.5 h-3.5 mr-1.5" /> Local
												</span>
											) : (
												<span className="flex items-center text-primary text-sm font-medium">
													<Globe className="w-3.5 h-3.5 mr-1.5" /> Global
												</span>
											)}
										</div>
										<div className="font-mono text-sm">{recipe.portion_yield} porções</div>
										<div className="flex items-center justify-end gap-2 pr-6">
											{kitchenId ? (
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																variant="ghost"
																size="sm"
																nativeButton={false}
																className="hover:bg-primary/10 hover:text-primary transition-all"
																render={
																	<Link to="/kitchen/$kitchenId/recipes/$recipeId" params={{ kitchenId, recipeId: recipe.id }}>
																		<TextSearch />
																	</Link>
																}
															/>
														}
													/>
													<TooltipContent>Ver detalhes</TooltipContent>
												</Tooltip>
											) : (
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																variant="ghost"
																size="sm"
																nativeButton={false}
																className="hover:bg-primary/10 hover:text-primary transition-all"
																render={
																	<Link to="/global/recipes/$recipeId" params={{ recipeId: recipe.id }}>
																		<TextSearch />
																	</Link>
																}
															/>
														}
													/>
													<TooltipContent>Ver detalhes</TooltipContent>
												</Tooltip>
											)}
											{!recipe.kitchen_id &&
												(kitchenId ? (
													<Tooltip>
														<TooltipTrigger
															render={
																<Button
																	variant="outline"
																	size="sm"
																	className="hover:bg-accent/10 hover:border-accent/30 transition-all"
																	nativeButton={false}
																	render={
																		<Link to="/kitchen/$kitchenId/recipes/new" params={{ kitchenId }} search={{ forkFrom: recipe.id }}>
																			<GitFork className="w-3.5 h-3.5 mr-1.5" />
																		</Link>
																	}
																/>
															}
														/>
														<TooltipContent>Criar cópia local</TooltipContent>
													</Tooltip>
												) : (
													<Tooltip>
														<TooltipTrigger
															render={
																<Button
																	variant="outline"
																	size="sm"
																	nativeButton={false}
																	className="hover:bg-accent/10 hover:border-accent/30 transition-all"
																	render={
																		<Link to="/global/recipes/new" search={{ forkFrom: recipe.id }}>
																			<GitFork className="w-3.5 h-3.5" />
																		</Link>
																	}
																/>
															}
														/>
														<TooltipContent>Criar cópia local</TooltipContent>
													</Tooltip>
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
