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
			<div className="flex justify-between items-center">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">Receitas</h2>
					<p className="text-muted-foreground">
						Gerencie o catálogo de receitas, versionamento e fichas técnicas.
					</p>
				</div>
				<Link to="/admin/recipes/new">
					<Button>
						<Plus className="w-4 h-4 mr-2" />
						Nova Receita
					</Button>
				</Link>
			</div>

			<div className="flex gap-4 items-center bg-card p-4 rounded-lg border shadow-sm">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Buscar receita..."
						className="pl-8"
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

			<div className="rounded-md border bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Nome</TableHead>
							<TableHead>Versão</TableHead>
							<TableHead>Origem</TableHead>
							<TableHead>Rendimento</TableHead>
							<TableHead className="text-right">Ações</TableHead>
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
								<TableRow key={recipe.id}>
									<TableCell className="font-medium">
										{recipe.name}
										{recipe.base_recipe_id && (
											<Badge variant="outline" className="ml-2 text-xs">
												Fork
											</Badge>
										)}
									</TableCell>
									<TableCell>
										<Badge variant="secondary" className="rounded-full px-2">
											v{recipe.version}
										</Badge>
									</TableCell>
									<TableCell>
										{recipe.kitchen_id ? (
											<span className="flex items-center text-muted-foreground text-sm">
												<ChefHat className="w-3 h-3 mr-1" /> Local
											</span>
										) : (
											<span className="flex items-center text-primary text-sm font-medium">
												<span className="w-2 h-2 rounded-full bg-primary mr-2" />{" "}
												Global
											</span>
										)}
									</TableCell>
									<TableCell>{recipe.portion_yield} porções</TableCell>
									<TableCell className="text-right space-x-2">
										{/* Visualizar / Editar */}
										<Link to={`/admin/recipes/${recipe.id}`}>
											<Button variant="ghost" size="sm">
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
												>
													<GitFork className="w-3 h-3 mr-1" />
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
