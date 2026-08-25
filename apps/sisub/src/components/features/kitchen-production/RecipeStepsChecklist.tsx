import { Clock, ListChecks, Timer } from "lucide-react"
import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useRecipeFlow } from "@/hooks/data/useRecipeFlow"
import { cn } from "@/lib/cn"
import { type FetchedStep, orderStepsForExecution } from "@/lib/recipe-flow/transform"

interface RecipeStepsChecklistProps {
	recipeId: string | null
	/** Modo de preparo em texto livre — fallback quando a receita não tem fluxo estruturado. */
	fallbackText: string | null
	/**
	 * Pré-preparo da ficha (higienizar, dessalgar, cortar, descongelar). Aparece SEMPRE que
	 * existe, inclusive com fluxo estruturado: é o que precisa acontecer antes do turno, e
	 * escondê-lo atrás do texto livre faria a cozinha descobrir o dessalgue no dia.
	 */
	prePreparationText: string | null
}

/**
 * Modo de preparo no painel de produção. Quando a receita tem Fluxo de Produção
 * estruturado (DAG), renderiza as etapas em ordem de execução como checklist do
 * turno (estado local, não persistido); senão, cai no texto livre da ficha.
 */
export function RecipeStepsChecklist({ recipeId, fallbackText, prePreparationText }: RecipeStepsChecklistProps) {
	const { data: flow } = useRecipeFlow(recipeId ?? undefined)
	const [checked, setChecked] = useState<Set<string>>(new Set())
	const [prevRecipeId, setPrevRecipeId] = useState(recipeId)

	// Zera o checklist ao trocar de preparação (ajuste durante render, não em effect).
	if (prevRecipeId !== recipeId) {
		setPrevRecipeId(recipeId)
		setChecked(new Set())
	}

	const steps = flow?.steps && flow.steps.length > 0 ? orderStepsForExecution(flow.steps as unknown as FetchedStep[]) : null

	if (!steps && !fallbackText && !prePreparationText) return null

	const toggle = (stepId: string) => {
		setChecked((prev) => {
			const next = new Set(prev)
			if (next.has(stepId)) next.delete(stepId)
			else next.add(stepId)
			return next
		})
	}

	return (
		<div className="px-4 pb-4 space-y-2">
			{prePreparationText && (
				<>
					<h3 className="text-subheading text-foreground flex items-center gap-2">
						<Clock className="size-4 text-muted-foreground" />
						Pré-preparo
					</h3>
					<div className="rounded-md border border-border bg-muted/30 p-3">
						<pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{prePreparationText}</pre>
					</div>
				</>
			)}
			{(steps || fallbackText) && (
				<h3 className="text-subheading text-foreground flex items-center gap-2">
					{steps ? <ListChecks className="size-4 text-muted-foreground" /> : <Clock className="size-4 text-muted-foreground" />}
					Modo de Preparo
					{steps && (
						<span className="text-hint text-muted-foreground">
							({checked.size}/{steps.length} etapas)
						</span>
					)}
				</h3>
			)}
			{steps ? (
				<div className="rounded-md border border-border overflow-hidden divide-y divide-border">
					{steps.map((s, index) => {
						const done = checked.has(s.id)
						return (
							<div key={s.id} className={cn("flex items-start gap-3 p-3", done && "bg-muted/40")}>
								<Checkbox id={`step-${s.id}`} checked={done} onCheckedChange={() => toggle(s.id)} className="mt-0.5" />
								<Label htmlFor={`step-${s.id}`} className="flex-1 cursor-pointer space-y-0.5 font-normal">
									<span className={cn("text-sm block", done && "line-through text-muted-foreground")}>
										{index + 1}. {s.label ?? "Etapa sem nome"}
									</span>
									{s.description && <span className={cn("text-xs text-muted-foreground block", done && "line-through")}>{s.description}</span>}
									{s.duration_minutes != null && (
										<span className="text-xs text-muted-foreground flex items-center gap-1">
											<Timer className="size-3" />
											{s.duration_minutes} min
										</span>
									)}
								</Label>
							</div>
						)
					})}
				</div>
			) : fallbackText ? (
				<div className="rounded-md border border-border bg-muted/30 p-3">
					<pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{fallbackText}</pre>
				</div>
			) : null}
		</div>
	)
}
