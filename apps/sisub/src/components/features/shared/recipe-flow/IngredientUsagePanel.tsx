import type { IngredientBalance } from "@iefa/sisub-domain"
import { Check, Plus } from "lucide-react"
import { cn } from "@/lib/cn"
import type { RecipeIngredientSource } from "@/types/domain/recipe-flow"

/**
 * Insumos da receita + balanço de materiais numa lista única.
 * Cada linha é o item da palette (adicionar ao canvas) somado à sua barra de uso
 * (consumido/declarado), eliminando a duplicação de ter palette e balanço separados.
 */

const STATUS_STYLE: Record<string, { bar: string; text: string }> = {
	ok: { bar: "bg-success", text: "text-success" },
	under: { bar: "bg-warning", text: "text-warning" },
	over: { bar: "bg-destructive", text: "text-destructive" },
	unconsumed: { bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
}

interface IngredientUsagePanelProps {
	ingredients: RecipeIngredientSource[]
	presentIds: Set<string>
	balance: IngredientBalance[]
	errors: string[]
	onAdd: (ingredient: RecipeIngredientSource) => void
}

export function IngredientUsagePanel({ ingredients, presentIds, balance, errors, onAdd }: IngredientUsagePanelProps) {
	const balanceById = new Map(balance.map((b) => [b.recipeIngredientId, b]))

	return (
		<div className="space-y-3">
			{errors.length > 0 && (
				<ul className="space-y-1">
					{errors.map((e) => (
						<li key={e} className="text-caption text-destructive">
							• {e}
						</li>
					))}
				</ul>
			)}

			<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{ingredients.map((ing) => {
					const present = presentIds.has(ing.recipeIngredientId)
					const b = balanceById.get(ing.recipeIngredientId)
					const style = STATUS_STYLE[b?.status ?? "unconsumed"] ?? STATUS_STYLE.unconsumed
					const pct = b && b.declared > 0 ? Math.min(100, (b.consumed / b.declared) * 100) : 0
					return (
						<button
							key={ing.recipeIngredientId}
							type="button"
							disabled={present}
							onClick={() => onAdd(ing)}
							aria-label={present ? `${ing.name} já no fluxo` : `Adicionar ${ing.name} ao fluxo`}
							className={cn(
								"flex w-full flex-col gap-1.5 rounded-md border border-border px-2.5 py-2 text-left transition-colors",
								present ? "cursor-default" : "hover:bg-muted/60"
							)}
						>
							<div className="flex items-center gap-2">
								{present ? <Check className="size-3.5 shrink-0 text-success" /> : <Plus className="size-3.5 shrink-0 text-muted-foreground" />}
								<span className="min-w-0 flex-1 truncate text-caption text-foreground">{ing.name}</span>
								<span className={cn("shrink-0 text-caption", style.text)}>
									{b?.consumed ?? 0}/{ing.netQuantity}
									{ing.measureUnit}
								</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div className={cn("h-full rounded-full transition-all", style.bar)} style={{ width: `${b?.status === "over" ? 100 : pct}%` }} />
							</div>
						</button>
					)
				})}
			</div>
		</div>
	)
}
