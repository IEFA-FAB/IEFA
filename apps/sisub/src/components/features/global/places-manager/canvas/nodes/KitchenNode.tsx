import { Handle, type NodeProps, Position } from "@xyflow/react"
import { ChefHat } from "lucide-react"
import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/cn"
import { NODE_DIMENSIONS } from "@/lib/places-graph/layout"
import type { KitchenNodeData } from "@/types/domain/places"

const KITCHEN_TYPE_LABEL: Record<string, string> = {
	consumption: "Consumo",
	production: "Produção",
}
const KITCHEN_TYPE_VARIANT: Record<string, "success" | "warning"> = {
	production: "success",
	consumption: "warning",
}

function KitchenNodeComponent({ data, selected }: NodeProps) {
	const { record } = data as KitchenNodeData
	const typeLabel = record.type ? KITCHEN_TYPE_LABEL[record.type] : null
	const typeVariant = record.type ? KITCHEN_TYPE_VARIANT[record.type] : "warning"

	return (
		<div
			className={cn(
				"bg-card border border-border rounded-md flex items-center gap-2.5 px-3 overflow-hidden transition-shadow",
				selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
			)}
			style={{
				width: NODE_DIMENSIONS.kitchen.width,
				height: NODE_DIMENSIONS.kitchen.height,
				borderTopWidth: "3px",
				borderTopColor: "var(--color-chart-2)",
			}}
		>
			<div className="flex-shrink-0 flex items-center justify-center size-7 rounded bg-chart-2/10">
				<ChefHat className="size-4 text-chart-2" />
			</div>

			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-foreground truncate leading-tight">{record.display_name ?? `Cozinha #${record.id}`}</p>
				{typeLabel && (
					<Badge variant={typeVariant} className="text-[10px] h-4 px-1.5 mt-0.5">
						{typeLabel}
					</Badge>
				)}
			</div>

			<Handle id="source" type="source" position={Position.Top} className="!w-2 !h-2 !bg-muted-foreground/40 !border-border" />
			<Handle id="target" type="target" position={Position.Bottom} className="!w-2 !h-2 !bg-muted-foreground/40 !border-border" />
		</div>
	)
}

export const KitchenNode = memo(KitchenNodeComponent)
