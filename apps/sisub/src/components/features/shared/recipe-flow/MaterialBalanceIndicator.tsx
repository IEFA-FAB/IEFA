import { type DeclaredIngredient, validateFlow } from "@iefa/sisub-domain"
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react"
import { useMemo } from "react"
import { cn } from "@/lib/cn"
import { toGraphSteps } from "@/lib/recipe-flow/transform"
import type { FlowNode, MaterialEdge, RecipeIngredientSource } from "@/types/domain/recipe-flow"

interface MaterialBalanceIndicatorProps {
	nodes: FlowNode[]
	edges: MaterialEdge[]
	ingredients: RecipeIngredientSource[]
}

const STATUS_STYLE: Record<string, { bar: string; text: string }> = {
	ok: { bar: "bg-success", text: "text-success" },
	under: { bar: "bg-warning", text: "text-warning" },
	over: { bar: "bg-destructive", text: "text-destructive" },
	unconsumed: { bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
}

export function MaterialBalanceIndicator({ nodes, edges, ingredients }: MaterialBalanceIndicatorProps) {
	const { balance, errors, warnings } = useMemo(() => {
		const declared: DeclaredIngredient[] = ingredients.map((i) => ({
			recipeIngredientId: i.recipeIngredientId,
			netQuantity: i.netQuantity,
			isOptional: i.isOptional,
		}))
		return validateFlow(toGraphSteps(nodes, edges), declared)
	}, [nodes, edges, ingredients])

	const nameById = useMemo(() => new Map(ingredients.map((i) => [i.recipeIngredientId, i])), [ingredients])

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				{errors.length > 0 ? (
					<span className="inline-flex items-center gap-1.5 text-caption text-destructive">
						<CircleAlert className="size-3.5" /> {errors.length} bloqueio(s)
					</span>
				) : warnings.length > 0 ? (
					<span className="inline-flex items-center gap-1.5 text-caption text-warning">
						<AlertTriangle className="size-3.5" /> {warnings.length} aviso(s)
					</span>
				) : (
					<span className="inline-flex items-center gap-1.5 text-caption text-success">
						<CheckCircle2 className="size-3.5" /> Balanço consistente
					</span>
				)}
			</div>

			{errors.length > 0 && (
				<ul className="space-y-1">
					{errors.map((e) => (
						<li key={e} className="text-caption text-destructive">
							• {e}
						</li>
					))}
				</ul>
			)}

			<div className="space-y-2">
				{balance.map((b) => {
					const ing = nameById.get(b.recipeIngredientId)
					const pct = b.declared > 0 ? Math.min(100, (b.consumed / b.declared) * 100) : 0
					const style = STATUS_STYLE[b.status] ?? STATUS_STYLE.unconsumed
					return (
						<div key={b.recipeIngredientId} className="space-y-1">
							<div className="flex items-center justify-between gap-2">
								<span className="text-caption text-foreground truncate">{ing?.name ?? b.recipeIngredientId}</span>
								<span className={cn("text-caption shrink-0", style.text)}>
									{b.consumed}/{b.declared}
									{ing?.measureUnit ?? ""}
								</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
								<div className={cn("h-full rounded-full transition-all", style.bar)} style={{ width: `${b.status === "over" ? 100 : pct}%` }} />
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
