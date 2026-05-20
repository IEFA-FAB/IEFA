import { type Connection, type Edge, type Node, useEdgesState, useNodesState } from "@xyflow/react"
import { useCallback, useEffect, useMemo, useReducer } from "react"
import { PageHeader } from "@/components/layout/PageHeader"
import { useApplyPlacesDiff, usePlacesGraph } from "@/hooks/data/usePlaces"
import { buildDiffFromReconnection } from "@/lib/places-graph/diff"
import { applyManualPositions, computeElkLayout, loadSavedPositions, savePositions } from "@/lib/places-graph/layout"
import { transformToGraph } from "@/lib/places-graph/transform"
import type { PlacesDiff, PlacesEdge, PlacesEdgeData, PlacesEditorMode, PlacesFilterState, PlacesNode, PlacesSelection } from "@/types/domain/places"
import { GraphToolbar } from "./canvas/GraphToolbar"
import { PlacesCanvas } from "./canvas/PlacesCanvas"
import { DirtyChangesBar } from "./DirtyChangesBar"
import { EntityInspectorSheet } from "./inspector/EntityInspectorSheet"

// ─── Filter logic (pure, outside component) ───────────────────────────────────

function applyFilters(nodes: PlacesNode[], filters: PlacesFilterState): PlacesNode[] {
	return nodes.filter((n) => {
		const { entityType } = n.data

		if (entityType === "unit" && !filters.showUnits) return false
		if (entityType === "kitchen" && !filters.showKitchens) return false
		if (entityType === "mess_hall" && !filters.showMessHalls) return false

		if (filters.search.trim()) {
			const q = filters.search.toLowerCase()
			const record = n.data.record
			const name = record.display_name?.toLowerCase() ?? ""
			const code = "code" in record ? (record.code as string).toLowerCase() : ""
			return name.includes(q) || code.includes(q)
		}

		return true
	})
}

function applyEdgeFilters(edges: PlacesEdge[], visibleNodeIds: Set<string>): PlacesEdge[] {
	return edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function GraphLoadingSkeleton() {
	return (
		<div className="size-full flex items-center justify-center bg-muted/20 rounded-md border border-border">
			<div className="flex flex-col items-center gap-3">
				<div className="size-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
				<p className="text-sm text-muted-foreground">Carregando grafo...</p>
			</div>
		</div>
	)
}

function GraphEmptyState() {
	return (
		<div className="size-full flex items-center justify-center bg-muted/20 rounded-md border border-border">
			<div className="flex flex-col items-center gap-2 text-center max-w-xs">
				<p className="text-subheading text-foreground">Nenhum dado encontrado</p>
				<p className="text-xs text-muted-foreground">Cadastre unidades, cozinhas e refeitórios para visualizar o grafo.</p>
			</div>
		</div>
	)
}

function GraphErrorState() {
	return (
		<div className="size-full flex items-center justify-center bg-destructive/5 rounded-md border border-destructive/20">
			<p className="text-sm text-destructive">Erro ao carregar os dados. Recarregue a página.</p>
		</div>
	)
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type PlacesManagerState = {
	editorMode: PlacesEditorMode
	selection: PlacesSelection
	pendingDiffs: Map<string, PlacesDiff>
	isLayouting: boolean
	showMinimap: boolean
	mounted: boolean
	filters: PlacesFilterState
}

type PlacesManagerAction =
	| { type: "SET_EDITOR_MODE"; value: PlacesEditorMode }
	| { type: "SET_SELECTION"; value: PlacesSelection }
	| { type: "SET_PENDING_DIFFS"; value: Map<string, PlacesDiff> }
	| { type: "SET_LAYOUTING"; value: boolean }
	| { type: "TOGGLE_MINIMAP" }
	| { type: "SET_MOUNTED" }
	| { type: "SET_FILTERS"; value: PlacesFilterState }

const initialPlacesManagerState: PlacesManagerState = {
	editorMode: "view",
	selection: null,
	pendingDiffs: new Map(),
	isLayouting: false,
	showMinimap: false,
	mounted: false,
	filters: { showUnits: true, showKitchens: true, showMessHalls: true, search: "" },
}

function placesManagerReducer(state: PlacesManagerState, action: PlacesManagerAction): PlacesManagerState {
	switch (action.type) {
		case "SET_EDITOR_MODE":
			return { ...state, editorMode: action.value }
		case "SET_SELECTION":
			return { ...state, selection: action.value }
		case "SET_PENDING_DIFFS":
			return { ...state, pendingDiffs: action.value }
		case "SET_LAYOUTING":
			return { ...state, isLayouting: action.value }
		case "TOGGLE_MINIMAP":
			return { ...state, showMinimap: !state.showMinimap }
		case "SET_MOUNTED":
			return { ...state, mounted: true }
		case "SET_FILTERS":
			return { ...state, filters: action.value }
		default:
			return state
	}
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function PlacesManagerPage() {
	// ── Data ──────────────────────────────────────────────────────────────────
	const { data, isLoading, isError } = usePlacesGraph()
	const applyDiffMutation = useApplyPlacesDiff()

	// ── Graph state (ReactFlow) ───────────────────────────────────────────────
	const [nodes, setNodes, onNodesChange] = useNodesState<PlacesNode>([])
	const [edges, setEdges, onEdgesChange] = useEdgesState<PlacesEdge>([])

	// ── App state ─────────────────────────────────────────────────────────────
	const [pmState, dispatch] = useReducer(placesManagerReducer, initialPlacesManagerState)
	const { editorMode, selection, pendingDiffs, isLayouting, showMinimap, mounted, filters } = pmState

	// ── Client-side mount guard (prevents SSR hydration issues with ReactFlow) ─
	useEffect(() => {
		dispatch({ type: "SET_MOUNTED" })
	}, [])

	// ── Initial layout when data arrives ─────────────────────────────────────
	useEffect(() => {
		if (!data) return

		const { nodes: rawNodes, edges: rawEdges } = transformToGraph(data)
		const savedPositions = loadSavedPositions()
		const hasManualPositions = Object.keys(savedPositions).length > 0

		dispatch({ type: "SET_LAYOUTING", value: true })
		computeElkLayout(rawNodes, rawEdges)
			.then((layoutedNodes) => {
				// Manual positions override ELK positions for nodes the user has dragged
				const finalNodes = hasManualPositions ? applyManualPositions(layoutedNodes, savedPositions) : layoutedNodes

				setNodes(finalNodes)
				setEdges(rawEdges)
			})
			.finally(() => dispatch({ type: "SET_LAYOUTING", value: false }))
	}, [data, setEdges, setNodes]) // intentionally only on data change (not setNodes/setEdges)

	// ── Filtered nodes/edges for rendering ────────────────────────────────────
	const filteredNodes = useMemo(() => applyFilters(nodes, filters), [nodes, filters])
	const filteredEdges = useMemo(() => {
		const visibleIds = new Set(filteredNodes.map((n) => n.id))
		return applyEdgeFilters(edges, visibleIds)
	}, [edges, filteredNodes])

	// ── Save node positions after dragging ────────────────────────────────────
	const handleNodesChange = useCallback(
		(changes: Parameters<typeof onNodesChange>[0]) => {
			onNodesChange(changes)
			// Persist after drag end
			const hasDragEnd = changes.some((c) => c.type === "position" && !c.dragging)
			if (hasDragEnd) {
				// Read latest nodes from the callback to get updated positions
				setNodes((current) => {
					savePositions(current)
					return current
				})
			}
		},
		[onNodesChange, setNodes]
	)

	// ── Node/edge selection ───────────────────────────────────────────────────
	const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
		dispatch({ type: "SET_SELECTION", value: { type: "node", node: node as PlacesNode } })
	}, [])

	const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
		dispatch({ type: "SET_SELECTION", value: { type: "edge", edge: edge as PlacesEdge } })
	}, [])

	// ── Edge reconnection (edit mode only) ────────────────────────────────────
	const handleReconnect = useCallback(
		(oldEdge: PlacesEdge, newConnection: Connection) => {
			if (!newConnection.target) return

			try {
				const diff = buildDiffFromReconnection(oldEdge, newConnection.target, nodes)
				const nextDiffs = new Map(pendingDiffs)
				nextDiffs.set(oldEdge.id, diff)
				dispatch({ type: "SET_PENDING_DIFFS", value: nextDiffs })
				// Mark the edge as dirty
				setEdges((eds) =>
					eds.map((e) => (e.id === oldEdge.id ? { ...e, target: newConnection.target as string, data: { ...(e.data as PlacesEdgeData), isDirty: true } } : e))
				)
			} catch {
				// diff building failed (target node not found) — ignore
			}
		},
		[nodes, pendingDiffs, setEdges]
	)

	// Edge list updater used by PlacesCanvas after reconnectEdge helper runs
	const handleEdgesChangeExternal = useCallback(
		(newEdges: PlacesEdge[]) => {
			setEdges(newEdges)
		},
		[setEdges]
	)

	// ── Auto-layout ───────────────────────────────────────────────────────────
	const handleAutoLayout = useCallback(async () => {
		dispatch({ type: "SET_LAYOUTING", value: true })
		try {
			const layoutedNodes = await computeElkLayout(nodes, edges)
			setNodes(layoutedNodes)
			savePositions(layoutedNodes)
		} finally {
			dispatch({ type: "SET_LAYOUTING", value: false })
		}
	}, [nodes, edges, setNodes])

	// ── Save all pending diffs ────────────────────────────────────────────────
	const handleSaveAll = useCallback(async () => {
		const diffs = Array.from(pendingDiffs.values())
		await applyDiffMutation.mutateAsync(diffs)
		dispatch({ type: "SET_PENDING_DIFFS", value: new Map() })
		// Re-run layout after data re-fetch to reflect any structural changes
	}, [pendingDiffs, applyDiffMutation])

	// ── Discard pending diffs ─────────────────────────────────────────────────
	const handleDiscard = useCallback(() => {
		if (!data) return
		const { edges: rawEdges } = transformToGraph(data)
		setEdges(rawEdges)
		dispatch({ type: "SET_PENDING_DIFFS", value: new Map() })
	}, [data, setEdges])

	// ── Switching to view mode discards pending edits ──────────────────────────
	const handleEditorModeChange = useCallback(
		(mode: PlacesEditorMode) => {
			if (mode === "view" && pendingDiffs.size > 0) {
				// Discard silently when switching back to view
				handleDiscard()
			}
			dispatch({ type: "SET_EDITOR_MODE", value: mode })
		},
		[pendingDiffs, handleDiscard]
	)

	const hasData = !isLoading && !isError && data

	return (
		<div className="flex flex-col gap-4 h-[calc(100vh-8rem)] min-h-[500px]">
			<PageHeader title="Gerenciar Locais" description="Visualize e edite as relações entre unidades, cozinhas e refeitórios." />

			<GraphToolbar
				filters={filters}
				onFiltersChange={(f) => dispatch({ type: "SET_FILTERS", value: f })}
				onAutoLayout={handleAutoLayout}
				onToggleMinimap={() => dispatch({ type: "TOGGLE_MINIMAP" })}
				isLayouting={isLayouting}
				showMinimap={showMinimap}
				editorMode={editorMode}
				onEditorModeChange={handleEditorModeChange}
			/>

			{/* Canvas — takes remaining vertical space */}
			<div className="flex-1 min-h-0">
				{isLoading && <GraphLoadingSkeleton />}
				{isError && <GraphErrorState />}
				{hasData && nodes.length === 0 && !isLayouting && <GraphEmptyState />}
				{mounted && hasData && (
					<PlacesCanvas
						nodes={filteredNodes}
						edges={filteredEdges}
						onNodesChange={handleNodesChange}
						onEdgesChange={onEdgesChange}
						onNodeClick={handleNodeClick}
						onEdgeClick={handleEdgeClick}
						onReconnect={handleReconnect}
						onEdgesChangeExternal={handleEdgesChangeExternal}
						allNodes={nodes}
						editorMode={editorMode}
						showMinimap={showMinimap}
					/>
				)}
			</div>

			{/* Inspector sheet — contextual, opens on node selection */}
			<EntityInspectorSheet
				selection={selection}
				edges={edges}
				nodes={nodes}
				onClose={() => dispatch({ type: "SET_SELECTION", value: null })}
				editorMode={editorMode}
			/>

			{/* Dirty changes bar — appears only in edit mode with pending changes */}
			{editorMode === "edit" && (
				<DirtyChangesBar diffs={Array.from(pendingDiffs.values())} onSave={handleSaveAll} onDiscard={handleDiscard} isSaving={applyDiffMutation.isPending} />
			)}
		</div>
	)
}
