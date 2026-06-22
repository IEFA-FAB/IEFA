import { Handle, type NodeProps, Position } from "@xyflow/react"
import { Clock, Flag, Utensils } from "lucide-react"
import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { STEP_TARGET_HANDLE, type StepNodeData } from "@/types/domain/recipe-flow"

const NODE_WIDTH = 220

function StepNodeComponent({ data, selected }: NodeProps) {
	const step = data as StepNodeData
	const outputs = step.outputs.length > 0 ? step.outputs : [{ clientId: "__none__", label: "(sem saída)", quantity: null, measureUnit: null, isFinal: false }]

	return (
		<div
			className={cn(
				"bg-card border border-border rounded-md overflow-hidden transition-shadow",
				selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
			)}
			style={{ width: NODE_WIDTH, borderTopWidth: "3px", borderTopColor: "var(--color-chart-1)" }}
		>
			{/* Handle único de entrada (todas as edges entram aqui) */}
			<Handle id={STEP_TARGET_HANDLE} type="target" position={Position.Left} className="!size-2.5 !bg-chart-1/50 !border-border" />

			<div className="px-3 py-2 space-y-1.5">
				<div className="flex items-start justify-between gap-2">
					<p className="text-body text-foreground leading-tight">{step.label || "Etapa"}</p>
					{step.durationMinutes != null && step.durationMinutes > 0 && (
						<span className="inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
							<Clock className="size-3" />
							{step.durationMinutes}min
						</span>
					)}
				</div>

				{step.description && <p className="text-caption text-muted-foreground line-clamp-2">{step.description}</p>}

				{step.utensils.length > 0 && (
					<div className="flex flex-wrap items-center gap-1 pt-0.5">
						<Utensils className="size-3 text-muted-foreground" />
						{step.utensils.map((u) => (
							<Badge key={u.id} variant="secondary" className="h-4 px-1.5 text-caption">
								{u.name}
							</Badge>
						))}
					</div>
				)}
			</div>

			{/* Saídas — um handle por produto intermediário */}
			<div className="border-t border-border/60">
				{outputs.map((o) => (
					<div key={o.clientId} className="relative flex items-center justify-end gap-1.5 px-3 py-1">
						{o.isFinal && <Flag className="size-3 text-success" />}
						<span className={cn("text-caption", o.isFinal ? "text-success" : "text-muted-foreground")}>
							{o.label || "saída"}
							{o.quantity != null ? ` · ${o.quantity}${o.measureUnit ?? ""}` : ""}
						</span>
						{o.clientId !== "__none__" && (
							<Handle
								id={o.clientId}
								type="source"
								position={Position.Right}
								className={cn("!size-2.5 !border-border", o.isFinal ? "!bg-success" : "!bg-chart-1/50")}
								style={{ position: "absolute", right: -5 }}
							/>
						)}
					</div>
				))}
			</div>
		</div>
	)
}

export const StepNode = memo(StepNodeComponent)
