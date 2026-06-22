import {
	Background,
	BackgroundVariant,
	type Connection,
	Controls,
	type Edge,
	type EdgeChange,
	type EdgeTypes,
	type IsValidConnection,
	MiniMap,
	type Node,
	type NodeChange,
	type NodeTypes,
	ReactFlow,
} from "@xyflow/react"
import type { FlowNode, MaterialEdge } from "@/types/domain/recipe-flow"
import { MaterialFlowEdge } from "./edges/MaterialFlowEdge"
import { IngredientSourceNode } from "./nodes/IngredientSourceNode"
import { StepNode } from "./nodes/StepNode"

// Fora do componente — evita recriar a cada render.
const nodeTypes = {
	step: StepNode,
	ingredient: IngredientSourceNode,
} satisfies Record<string, React.ComponentType<never>>

const edgeTypes = {
	material: MaterialFlowEdge,
} satisfies Record<string, React.ComponentType<never>>

const defaultEdgeOptions = { type: "material" }

interface RecipeFlowCanvasProps {
	nodes: FlowNode[]
	edges: MaterialEdge[]
	onNodesChange: (changes: NodeChange<FlowNode>[]) => void
	onEdgesChange: (changes: EdgeChange<MaterialEdge>[]) => void
	onConnect: (conn: Connection) => void
	onNodeClick: (event: React.MouseEvent, node: Node) => void
	onEdgeClick: (event: React.MouseEvent, edge: Edge) => void
	onPaneClick: () => void
	isValidConnection: (conn: Connection) => boolean
}

export function RecipeFlowCanvas({
	nodes,
	edges,
	onNodesChange,
	onEdgesChange,
	onConnect,
	onNodeClick,
	onEdgeClick,
	onPaneClick,
	isValidConnection,
}: RecipeFlowCanvasProps) {
	return (
		<div className="size-full rounded-md border border-border overflow-hidden bg-background">
			<ReactFlow
				nodes={nodes as Node[]}
				edges={edges as Edge[]}
				nodeTypes={nodeTypes as NodeTypes}
				edgeTypes={edgeTypes as EdgeTypes}
				defaultEdgeOptions={defaultEdgeOptions}
				onNodesChange={onNodesChange as (changes: NodeChange[]) => void}
				onEdgesChange={onEdgesChange as (changes: EdgeChange[]) => void}
				onConnect={onConnect}
				onNodeClick={onNodeClick}
				onEdgeClick={onEdgeClick}
				onPaneClick={onPaneClick}
				isValidConnection={isValidConnection as IsValidConnection}
				nodesDraggable
				nodesConnectable
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
				<MiniMap
					nodeColor={(node) => (node.type === "ingredient" ? "var(--color-chart-3)" : "var(--color-chart-1)")}
					maskColor="color-mix(in oklch, var(--color-background) 80%, transparent)"
					className="!bg-card !border-border !rounded-md"
				/>
			</ReactFlow>
		</div>
	)
}
