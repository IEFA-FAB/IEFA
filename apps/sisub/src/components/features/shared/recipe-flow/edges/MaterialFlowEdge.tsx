import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react"
import { memo } from "react"
import type { MaterialEdgeData } from "@/types/domain/recipe-flow"

function MaterialFlowEdgeComponent({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps) {
	const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
	const edge = data as MaterialEdgeData | undefined
	const qty = edge?.quantity

	return (
		<>
			<BaseEdge id={id} path={path} style={{ stroke: selected ? "var(--color-ring)" : "var(--color-border)", strokeWidth: selected ? 2 : 1.5 }} />
			{qty != null && (
				<EdgeLabelRenderer>
					<div
						className="nodrag nopan absolute rounded border border-border bg-card px-1.5 py-0.5 text-caption text-muted-foreground"
						style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
					>
						{qty}
						{edge?.measureUnit ?? ""}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	)
}

export const MaterialFlowEdge = memo(MaterialFlowEdgeComponent)
