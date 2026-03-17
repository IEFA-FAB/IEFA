import { Handle, type NodeProps, Position } from "@xyflow/react"
import { Building2 } from "lucide-react"
import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { NODE_DIMENSIONS } from "@/lib/places-graph/layout"
import type { UnitNodeData } from "@/types/domain/places"

const UNIT_TYPE_LABEL: Record<string, string> = {
	consumption: "Consumo",
	purchase: "Compra",
}
const UNIT_TYPE_VARIANT: Record<string, "secondary" | "outline"> = {
	consumption: "secondary",
	purchase: "outline",
}

// NodeProps generic in ReactFlow v12 expects the full Node type, not the data type.
// Use untyped NodeProps and cast data internally to avoid complex generic constraints.
function UnitNodeComponent({ data, selected }: NodeProps) {
	const { record } = data as UnitNodeData
	const typeLabel = record.type ? UNIT_TYPE_LABEL[record.type] : null
	const typeVariant = record.type ? UNIT_TYPE_VARIANT[record.type] : "outline"

	return (
		<div
			className={cn(
				"bg-card border border-border rounded-md flex items-center gap-2.5 px-3 overflow-hidden transition-shadow",
				selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
			)}
			style={{
				width: NODE_DIMENSIONS.unit.width,
				height: NODE_DIMENSIONS.unit.height,
				borderTopWidth: "3px",
				borderTopColor: "var(--color-chart-1)",
			}}
		>
			<div className="flex-shrink-0 flex items-center justify-center size-7 rounded bg-chart-1/10">
				<Building2 className="size-4 text-chart-1" />
			</div>

			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate leading-tight">{record.display_name ?? record.code}</p>
				<div className="flex items-center gap-1 mt-0.5">
					<span className="text-xs text-muted-foreground font-mono">{record.code}</span>
					{typeLabel && (
						<Badge variant={typeVariant} className="text-[10px] h-4 px-1.5">
							{typeLabel}
						</Badge>
					)}
				</div>
			</div>

			<Handle id="target" type="target" position={Position.Bottom} className="!w-2 !h-2 !bg-muted-foreground/40 !border-border" />
		</div>
	)
}

export const UnitNode = memo(UnitNodeComponent)
