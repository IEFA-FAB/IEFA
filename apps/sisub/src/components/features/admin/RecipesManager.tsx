import {
	Badge,
	Button,
	Input,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@iefa/ui";
import { Link } from "@tanstack/react-router";
import { ChefHat, GitFork, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useRecipes } from "@/hooks/data/useRecipes";

export function RecipesManager() {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<"all" | "global" | "local">("all");

	const { data: recipes, isLoading } = useRecipes({
		search: search || undefined,
		// If filter is 'global', pass global_only=true
		// If filter is 'local', pass kitchen_id (if user has one, otherwise logic is handled client-side or we need to know user's kitchen)
		global_only: filter === "global",
		// We assume for now 'local' means recipes with ANY kitchen_id != null
	});

	// Client-side filtering for 'local' since backend hook is simple
	const filteredRecipes = recipes?.filter((r) => {
		if (filter === "local") return r.kitchen_id !== null;
		return true;
	});

	return (
		<div className="space-y-6">
			{/* Header - Enhanced with Industrial-Technical aesthetic */}
			<div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/30 via-background to-muted/20 p-6 border border-border/50">
				{/* Dot pattern overlay */}
				<div className="absolute inset-0 bg-dot-pattern opacity-[0.03] -z-10" />

				<div className="relative flex justify-between items-center">
					<div>
						<h2 className="text-2xl md:text-3xl font-sans font-bold tracking-tight text-foreground">
							Receitas
						</h2>
						<p className="text-sm md:text-base text-muted-foreground mt-1 font-sans">
							Gerencie o catálogo de receitas, versionamento e fichas técnicas.
						</p>
					</div>
					<Link to="/admin/recipes/new">
						<Button className="gap-2 transition-all hover:scale-105">
							<Plus className="w-4 h-4" />
							Nova Receita
						</Button>
					</Link>
				</div>
			</div>

			{/* Search & Filters - Enhanced */}
			<div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center bg-gradient-to-br from-card to-muted/10 p-5 rounded-xl border border-border/50 shadow-sm">
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-transform group-focus-within:scale-110" />
					<Input
						placeholder="Buscar receita..."
						className="pl-10 group transition-all focus:ring-2 focus:ring-primary/50"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
				<div className="flex gap-2">
					<Button
						variant={filter === "all" ? "secondary" : "ghost"}
						onClick={() => setFilter("all")}
						size="sm"
						className="transition-all"
					>
						Todas
					</Button>
					<Button
						variant={filter === "global" ? "secondary" : "ghost"}
						onClick={() => setFilter("global")}
						size="sm"
						className="transition-all"
					>
						Globais (SDAB)
					</Button>
					<Button
						variant={filter === "local" ? "secondary" : "ghost"}
						onClick={() => setFilter("local")}
						size="sm"
						className="transition-all"
					>
						Locais
					</Button>
				</div>
			</div>

			{/* Table - Enhanced */}
			<div className="rounded-xl border border-border/50 bg-gradient-to-br from-card to-muted/5 shadow-sm overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="border-b border-border/50 bg-muted/30">
							<TableHead className="font-sans font-semibold pl-6">
								Nome
							</TableHead>
							<TableHead className="font-sans font-semibold">Versão</TableHead>
							<TableHead className="font-sans font-semibold">Origem</TableHead>
							<TableHead className="font-sans font-semibold">
								Rendimento
							</TableHead>
							<TableHead className="text-right font-sans font-semibold pr-6">
								Ações
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell colSpan={5} className="h-24 text-center">
									Carregando receitas...
								</TableCell>
							</TableRow>
						) : filteredRecipes?.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={5}
									className="h-24 text-center text-muted-foreground"
								>
									Nenhuma receita encontrada.
								</TableCell>
							</TableRow>
						) : (
							filteredRecipes?.map((recipe) => (
								<TableRow
									key={recipe.id}
									className="transition-all hover:bg-muted/30 border-b border-border/30"
								>
									<TableCell className="font-sans font-medium pl-6">
										{recipe.name}
										{recipe.base_recipe_id && (
											<Badge
												variant="outline"
												className="ml-2 text-xs font-sans"
											>
												Fork
											</Badge>
										)}
									</TableCell>
									<TableCell>
										<Badge
											variant="secondary"
											className="rounded-full px-2.5 py-0.5 font-mono text-xs"
										>
											v{recipe.version}
										</Badge>
									</TableCell>
									<TableCell>
										{recipe.kitchen_id ? (
											<span className="flex items-center text-muted-foreground text-sm font-sans">
												<ChefHat className="w-3.5 h-3.5 mr-1.5" /> Local
											</span>
										) : (
											<span className="flex items-center text-primary text-sm font-medium">
												<span className="w-2 h-2 rounded-full bg-primary mr-2" />{" "}
												Global
											</span>
										)}
									</TableCell>
									<TableCell className="font-mono text-sm">
										{recipe.portion_yield} porções
									</TableCell>
									<TableCell className="text-right space-x-2 pr-6">
										{/* Visualizar / Editar */}
										<Link to={`/admin/recipes/${recipe.id}` as any}>
											<Button
												variant="ghost"
												size="sm"
												className="hover:bg-primary/10 hover:text-primary transition-all"
											>
												Detalhes
											</Button>
										</Link>

										{/* Fork Button if Global and User is Admin/Manager (has kitchen context usually) */}
										{!recipe.kitchen_id && (
											<Link
												to={`/admin/recipes/new`}
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
										)}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
