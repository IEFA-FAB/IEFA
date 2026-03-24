import {
	Background,
	BackgroundVariant,
	type Connection,
	Controls,
	type Edge,
	type EdgeChange,
	type IsValidConnection,
	MiniMap,
	type Node,
	type NodeChange,
	type OnReconnect,
	ReactFlow,
	reconnectEdge,
} from "@xyflow/react"
import { useCallback } from "react"

import { isValidPlacesConnection } from "@/lib/places-graph/validate"
import type { PlacesEdge, PlacesEditorMode, PlacesNode } from "@/types/domain/places"
import { RelationEdge } from "./edges/RelationEdge"
import { KitchenNode } from "./nodes/KitchenNode"
import { MessHallNode } from "./nodes/MessHallNode"
import { UnitNode } from "./nodes/UnitNode"

// Defined OUTSIDE the component — prevents React from re-creating nodeTypes/edgeTypes on render
// Cast needed because ReactFlow NodeTypes uses generic Record<string, unknown> for node data
const nodeTypes = {
	unitNode: UnitNode,
	kitchenNode: KitchenNode,
	messHallNode: MessHallNode,
} satisfies Record<string, React.ComponentType<never>>

const edgeTypes = {
	relationEdge: RelationEdge,
} satisfies Record<string, React.ComponentType<never>>

const defaultEdgeOptions = { type: "relationEdge" }

interface PlacesCanvasProps {
	nodes: PlacesNode[]
	edges: PlacesEdge[]
	onNodesChange: (changes: NodeChange<PlacesNode>[]) => void
	onEdgesChange: (changes: EdgeChange<PlacesEdge>[]) => void
	onNodeClick: (event: React.MouseEvent, node: Node) => void
	onEdgeClick: (event: React.MouseEvent, edge: Edge) => void
	onReconnect: (oldEdge: PlacesEdge, newConnection: Connection) => void
	onEdgesChangeExternal: (edges: PlacesEdge[]) => void
	allNodes: PlacesNode[]
	editorMode: PlacesEditorMode
	showMinimap: boolean
}

export function PlacesCanvas({
	nodes,
	edges,
	onNodesChange,
	onEdgesChange,
	onNodeClick,
	onEdgeClick,
	onReconnect,
	onEdgesChangeExternal,
	allNodes,
	editorMode,
	showMinimap,
}: PlacesCanvasProps) {
	const isEditMode = editorMode === "edit"

	const handleReconnect = useCallback<OnReconnect>(
		(oldEdge, newConnection) => {
			if (!newConnection.target) return
			const updated = reconnectEdge(oldEdge, newConnection, edges)
			onEdgesChangeExternal(updated as PlacesEdge[])
			onReconnect(oldEdge as PlacesEdge, newConnection)
		},
		[edges, onEdgesChangeExternal, onReconnect]
	)

	// IsValidConnection receives Connection | Edge — handle both
	const handleIsValidConnection = useCallback<IsValidConnection>(
		(connectionOrEdge) => {
			// When reconnecting, ReactFlow passes the existing edge; extract Connection fields
			const conn: Connection = {
				source: connectionOrEdge.source,
				target: connectionOrEdge.target ?? null,
				sourceHandle: "sourceHandle" in connectionOrEdge ? (connectionOrEdge.sourceHandle ?? null) : null,
				targetHandle: "targetHandle" in connectionOrEdge ? (connectionOrEdge.targetHandle ?? null) : null,
			}
			return isValidPlacesConnection(conn, allNodes)
		},
		[allNodes]
	)

	return (
		<div className="w-full h-full rounded-md border border-border overflow-hidden bg-background">
			<ReactFlow
				nodes={nodes as Node[]}
				edges={edges as Edge[]}
				// biome-ignore lint/suspicious/noExplicitAny: ReactFlow NodeTypes/EdgeTypes require generic cast
				nodeTypes={nodeTypes as any}
				// biome-ignore lint/suspicious/noExplicitAny: ReactFlow NodeTypes/EdgeTypes require generic cast
				edgeTypes={edgeTypes as any}
				defaultEdgeOptions={defaultEdgeOptions}
				onNodesChange={onNodesChange as (changes: NodeChange[]) => void}
				onEdgesChange={onEdgesChange as (changes: EdgeChange[]) => void}
				onNodeClick={onNodeClick}
				onEdgeClick={onEdgeClick}
				onReconnect={isEditMode ? handleReconnect : undefined}
				isValidConnection={handleIsValidConnection}
				nodesDraggable
				nodesConnectable={false}
				edgesReconnectable={isEditMode}
				fitView
				fitViewOptions={{ padding: 0.2, minZoom: 0.4, maxZoom: 1.2 }}
				minZoom={0.2}
				maxZoom={2}
				proOptions={{ hideAttribution: true }}
			>
				<Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border)" />

				<Controls
					showInteractive={false}
					className="!bg-card !border-border !rounded-md [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-muted-foreground"
				/>

				{showMinimap && (
					<MiniMap
						nodeColor={(node) => {
							const entityType = (node.data as { entityType?: string })?.entityType
							if (entityType === "unit") return "var(--color-chart-1)"
							if (entityType === "kitchen") return "var(--color-chart-2)"
							return "var(--color-chart-3)"
						}}
						maskColor="color-mix(in oklch, var(--color-background) 80%, transparent)"
						className="!bg-card !border-border !rounded-md"
					/>
				)}
			</ReactFlow>
		</div>
	)
}
