import { Handle, type NodeProps, Position } from "@xyflow/react"
import { Sprout } from "lucide-react"
import { memo } from "react"
import { cn } from "@/lib/cn"
import { INGREDIENT_SOURCE_HANDLE, type IngredientNodeData } from "@/types/domain/recipe-flow"

const NODE_WIDTH = 180

function IngredientSourceNodeComponent({ data, selected }: NodeProps) {
	const ing = data as IngredientNodeData

	return (
		<div
			className={cn(
				"bg-muted/40 border border-border border-dashed rounded-md px-3 py-2 flex items-center gap-2 transition-shadow",
				selected && "ring-2 ring-ring ring-offset-1 ring-offset-background"
			)}
			style={{ width: NODE_WIDTH }}
		>
			<div className="flex size-6 shrink-0 items-center justify-center rounded bg-chart-3/10">
				<Sprout className="size-3.5 text-chart-3" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-body text-foreground truncate leading-tight">{ing.name}</p>
				<p className="text-caption text-muted-foreground">
					{ing.netQuantity}
					{ing.measureUnit} disponível
				</p>
			</div>

			<Handle id={INGREDIENT_SOURCE_HANDLE} type="source" position={Position.Right} className="!size-2.5 !bg-chart-3/60 !border-border" />
		</div>
	)
}

export const IngredientSourceNode = memo(IngredientSourceNodeComponent)
