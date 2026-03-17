import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from "@xyflow/react"
import { memo } from "react"
import { RELATION_LABELS } from "@/lib/places-graph/validate"
import type { PlacesEdgeData, RelationType } from "@/types/domain/places"

const RELATION_COLORS: Record<RelationType, string> = {
	"kitchen.unit_id": "var(--color-chart-1)",
	"kitchen.purchase_unit_id": "var(--color-chart-4)",
	"kitchen.kitchen_id": "var(--color-chart-2)",
	"mess_halls.unit_id": "var(--color-chart-3)",
	"mess_halls.kitchen_id": "var(--color-chart-5)",
}

// EdgeProps generic expects the full Edge type in ReactFlow v12.
// Use untyped EdgeProps and cast data internally.
function RelationEdgeComponent({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data: rawData, selected }: EdgeProps) {
	const data = rawData as PlacesEdgeData | undefined

	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	})

	if (!data) return null

	const relationType = data.relationType
	const baseColor = RELATION_COLORS[relationType] ?? "var(--color-muted-foreground)"
	const strokeColor = data.isDirty ? "var(--color-warning)" : baseColor
	const strokeWidth = selected ? 2.5 : 1.5
	const strokeOpacity = selected ? 1 : 0.7
	const label = RELATION_LABELS[relationType]

	return (
		<>
			<BaseEdge
				id={id}
				path={edgePath}
				style={{
					stroke: strokeColor,
					strokeWidth,
					strokeOpacity,
					strokeDasharray: data.isDirty ? "5 3" : undefined,
				}}
			/>

			<EdgeLabelRenderer>
				<div
					style={{
						position: "absolute",
						transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
						pointerEvents: "none",
					}}
					className="nodrag nopan"
				>
					<span
						className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-background border text-muted-foreground leading-none"
						style={{
							color: data.isDirty ? "var(--color-warning)" : strokeColor,
							borderColor: data.isDirty ? "color-mix(in oklch, var(--color-warning) 40%, transparent)" : "var(--color-border)",
							opacity: 0.9,
						}}
					>
						{data.isDirty ? `${label} *` : label}
					</span>
				</div>
			</EdgeLabelRenderer>
		</>
	)
}

export const RelationEdge = memo(RelationEdgeComponent)
