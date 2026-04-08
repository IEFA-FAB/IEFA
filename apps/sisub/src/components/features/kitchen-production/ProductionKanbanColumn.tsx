import { CheckCircle2, ChefHat, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ProductionItem, ProductionTaskStatus } from "@/types/domain/production"
import { ProductionTaskCard } from "./ProductionTaskCard"

// ---------------------------------------------------------------------------
// Column config
// ---------------------------------------------------------------------------

const COLUMN_CONFIG: Record<
	ProductionTaskStatus,
	{
		label: string
		icon: React.ComponentType<{ className?: string }>
		headerClass: string
		dotClass: string
	}
> = {
	PENDING: {
		label: "Pendente",
		icon: Clock,
		headerClass: "bg-muted/60 border-border",
		dotClass: "bg-muted-foreground",
	},
	IN_PROGRESS: {
		label: "Em Preparo",
		icon: ChefHat,
		headerClass: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50",
		dotClass: "bg-warning",
	},
	DONE: {
		label: "Pronto",
		icon: CheckCircle2,
		headerClass: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800/50",
		dotClass: "bg-success",
	},
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProductionKanbanColumnProps {
	status: ProductionTaskStatus
	items: ProductionItem[]
	onSelectItem: (item: ProductionItem) => void
	onUpdateStatus: (taskId: string, status: ProductionTaskStatus) => void
	isUpdating?: boolean
}

export function ProductionKanbanColumn({ status, items, onSelectItem, onUpdateStatus, isUpdating }: ProductionKanbanColumnProps) {
	const config = COLUMN_CONFIG[status]
	const Icon = config.icon

	return (
		<div className="flex flex-col rounded-lg border border-border overflow-hidden min-h-0">
			{/* Column Header */}
			<div className={cn("flex items-center justify-between px-3 py-2.5 border-b", config.headerClass)}>
				<div className="flex items-center gap-2">
					<span className={cn("h-2 w-2 rounded-full", config.dotClass)} />
					<Icon className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-medium text-foreground">{config.label}</span>
				</div>
				<Badge variant="secondary" className="font-mono text-xs">
					{items.length}
				</Badge>
			</div>

			{/* Card List */}
			<div className="flex-1 overflow-y-auto p-2 space-y-2 bg-muted/20">
				{items.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-8 text-center">
						<Icon className="h-8 w-8 text-muted-foreground/40 mb-2" />
						<p className="text-xs text-muted-foreground">
							{status === "PENDING" && "Nenhuma preparação pendente"}
							{status === "IN_PROGRESS" && "Nenhuma em andamento"}
							{status === "DONE" && "Nenhuma concluída ainda"}
						</p>
					</div>
				) : (
					items.map((item) => (
						<ProductionTaskCard key={item.task.id} item={item} onSelect={onSelectItem} onUpdateStatus={onUpdateStatus} isUpdating={isUpdating} />
					))
				)}
			</div>
		</div>
	)
}
