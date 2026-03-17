import { Handle, type NodeProps, Position } from "@xyflow/react"
import { Utensils } from "lucide-react"
import { memo } from "react"
import { cn } from "@/lib/cn"
import { NODE_DIMENSIONS } from "@/lib/places-graph/layout"
import type { MessHallNodeData } from "@/types/domain/places"

function MessHallNodeComponent({ data, selected }: NodeProps) {
	const { record } = data as MessHallNodeData

	return (
		<div
			className={cn(
				"bg-card border border-border rounded-md flex items-center gap-2.5 px-3 overflow-hidden transition-shadow",
				selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
			)}
			style={{
				width: NODE_DIMENSIONS.mess_hall.width,
				height: NODE_DIMENSIONS.mess_hall.height,
				borderTopWidth: "3px",
				borderTopColor: "var(--color-chart-3)",
			}}
		>
			<div className="flex-shrink-0 flex items-center justify-center size-7 rounded bg-chart-3/10">
				<Utensils className="size-4 text-chart-3" />
			</div>

			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate leading-tight">{record.display_name ?? record.code}</p>
				<p className="text-xs text-muted-foreground font-mono mt-0.5">{record.code}</p>
			</div>

			<Handle id="source" type="source" position={Position.Top} className="!w-2 !h-2 !bg-muted-foreground/40 !border-border" />
		</div>
	)
}

export const MessHallNode = memo(MessHallNodeComponent)
