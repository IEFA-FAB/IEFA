import { CheckCircle2, ChefHat, Clock, UtensilsCrossed } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from "@/components/ui/progress"
import type { ProductionItem } from "@/types/domain/production"

interface ProductionSummaryProps {
	items: ProductionItem[]
}

export function ProductionSummary({ items }: ProductionSummaryProps) {
	const total = items.length
	const pending = items.filter((i) => i.task.status === "PENDING").length
	const inProgress = items.filter((i) => i.task.status === "IN_PROGRESS").length
	const done = items.filter((i) => i.task.status === "DONE").length
	const progressValue = total > 0 ? Math.round((done / total) * 100) : 0

	if (total === 0) return null

	return (
		<div className="rounded-lg border border-border bg-card px-4 py-3 space-y-3">
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-1.5 text-sm text-muted-foreground">
					<UtensilsCrossed className="h-4 w-4" />
					<span className="font-medium text-foreground">{total}</span>
					<span>preparações</span>
				</div>

				<div className="h-3.5 w-px bg-border" />

				<div className="flex items-center gap-1.5 text-sm">
					<Clock className="h-3.5 w-3.5 text-muted-foreground" />
					<Badge variant="outline" className="font-mono text-xs">
						{pending}
					</Badge>
					<span className="text-muted-foreground">pendentes</span>
				</div>

				<div className="flex items-center gap-1.5 text-sm">
					<ChefHat className="h-3.5 w-3.5 text-warning" />
					<Badge variant="warning" className="font-mono text-xs">
						{inProgress}
					</Badge>
					<span className="text-muted-foreground">em andamento</span>
				</div>

				<div className="flex items-center gap-1.5 text-sm">
					<CheckCircle2 className="h-3.5 w-3.5 text-success" />
					<Badge variant="success" className="font-mono text-xs">
						{done}
					</Badge>
					<span className="text-muted-foreground">concluídas</span>
				</div>
			</div>

			<Progress value={progressValue}>
				<ProgressLabel className="text-xs text-muted-foreground">Progresso do turno</ProgressLabel>
				<ProgressValue className="text-xs" />
				<ProgressTrack>
					<ProgressIndicator className="bg-success" />
				</ProgressTrack>
			</Progress>
		</div>
	)
}
