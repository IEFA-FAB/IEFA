import { Badge, Card, CardContent, CardHeader, CardTitle } from "@iefa/ui";
import type { RecipeWithIngredients } from "@/types/domain/recipes";

interface RecipeDiffViewerProps {
	oldVersion: RecipeWithIngredients | null;
	newVersion: RecipeWithIngredients | null;
}

export function RecipeDiffViewer({
	oldVersion,
	newVersion,
}: RecipeDiffViewerProps) {
	if (!oldVersion || !newVersion) return null;

	// Helper to find ingredient in a list
	const findIngredient = (
		list: typeof oldVersion.ingredients,
		productId: string,
	) => list.find((i) => i.product_id === productId);

	// Collect all unique product IDs
	const allProductIds = Array.from(
		new Set([
			...oldVersion.ingredients.map((i) => i.product_id),
			...newVersion.ingredients.map((i) => i.product_id),
		]),
	);

	return (
		<div className="grid grid-cols-2 gap-4">
			{/* Old Version Column */}
			<Card className="border-muted">
				<CardHeader>
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Versão {oldVersion.version} (Atual)
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<span className="text-xs text-muted-foreground">Nome</span>
						<p>{oldVersion.name}</p>
					</div>
					<div>
						<span className="text-xs text-muted-foreground">
							Modo de Preparo
						</span>
						<p className="text-sm grayscale">{oldVersion.preparation_method}</p>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div>
							<span className="text-xs text-muted-foreground">Rendimento</span>
							<p>{oldVersion.portion_yield} porções</p>
						</div>
						<div>
							<span className="text-xs text-muted-foreground">
								Fator Cocção
							</span>
							<p>{oldVersion.cooking_factor ?? "-"}</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* New Version Column */}
			<Card className="border-primary">
				<CardHeader>
					<CardTitle className="text-sm font-medium text-primary">
						Versão {newVersion.version} (Nova)
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<span className="text-xs text-muted-foreground">Nome</span>
						<p
							className={
								oldVersion.name !== newVersion.name
									? "text-primary font-medium"
									: ""
							}
						>
							{newVersion.name}
						</p>
					</div>
					<div>
						<span className="text-xs text-muted-foreground">
							Modo de Preparo
						</span>
						<p
							className={`text-sm ${oldVersion.preparation_method !== newVersion.preparation_method ? "text-primary" : ""}`}
						>
							{newVersion.preparation_method}
						</p>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div>
							<span className="text-xs text-muted-foreground">Rendimento</span>
							<p
								className={
									oldVersion.portion_yield !== newVersion.portion_yield
										? "text-primary"
										: ""
								}
							>
								{newVersion.portion_yield} porções
							</p>
						</div>
						<div>
							<span className="text-xs text-muted-foreground">
								Fator Cocção
							</span>
							<p
								className={
									oldVersion.cooking_factor !== newVersion.cooking_factor
										? "text-primary"
										: ""
								}
							>
								{newVersion.cooking_factor ?? "-"}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Ingredients Comparison (Full Width) */}
			<div className="col-span-2 mt-4">
				<h3 className="text-sm font-medium mb-2">
					Comparativo de Ingredientes
				</h3>
				<div className="border rounded-md divide-y">
					{allProductIds.map((productId) => {
						const oldIng = findIngredient(oldVersion.ingredients, productId);
						const newIng = findIngredient(newVersion.ingredients, productId);

						// Unchanged?
						if (
							oldIng &&
							newIng &&
							oldIng.net_quantity === newIng.net_quantity
						) {
							return (
								<div
									key={productId}
									className="grid grid-cols-2 p-2 text-sm text-muted-foreground/70 bg-muted/20"
								>
									<div>
										{oldIng.product?.description} - {oldIng.net_quantity}{" "}
										{oldIng.product?.measure_unit}
									</div>
									<div>
										{newIng.product?.description} - {newIng.net_quantity}{" "}
										{newIng.product?.measure_unit}
									</div>
								</div>
							);
						}

						// Modified?
						if (
							oldIng &&
							newIng &&
							oldIng.net_quantity !== newIng.net_quantity
						) {
							return (
								<div
									key={productId}
									className="grid grid-cols-2 p-2 text-sm bg-yellow-500/10 dark:bg-yellow-500/20"
								>
									<div className="text-yellow-700 dark:text-yellow-400">
										{oldIng.product?.description} - {oldIng.net_quantity}{" "}
										{oldIng.product?.measure_unit}
									</div>
									<div className="font-medium text-yellow-700 dark:text-yellow-400">
										{newIng.product?.description} - {newIng.net_quantity}{" "}
										{newIng.product?.measure_unit}
										<Badge
											variant="outline"
											className="ml-2 border-yellow-500 text-yellow-600"
										>
											Alterado
										</Badge>
									</div>
								</div>
							);
						}

						// Removed?
						if (oldIng && !newIng) {
							return (
								<div
									key={productId}
									className="grid grid-cols-2 p-2 text-sm bg-destructive/10"
								>
									<div className="text-destructive font-medium line-through">
										{oldIng.product?.description} - {oldIng.net_quantity}{" "}
										{oldIng.product?.measure_unit}
										<Badge
											variant="outline"
											className="ml-2 border-destructive text-destructive"
										>
											Removido
										</Badge>
									</div>
									<div className="text-muted-foreground">-</div>
								</div>
							);
						}

						// Added?
						if (!oldIng && newIng) {
							return (
								<div
									key={productId}
									className="grid grid-cols-2 p-2 text-sm bg-green-500/10 dark:bg-green-500/20"
								>
									<div className="text-muted-foreground">-</div>
									<div className="text-green-700 dark:text-green-400 font-medium">
										{newIng.product?.description} - {newIng.net_quantity}{" "}
										{newIng.product?.measure_unit}
										<Badge
											variant="outline"
											className="ml-2 border-green-500 text-green-600"
										>
											Novo
										</Badge>
									</div>
								</div>
							);
						}

						return null;
					})}
				</div>
			</div>
		</div>
	);
}
