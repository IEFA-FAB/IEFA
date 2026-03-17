import type { ElkExtendedEdge, ElkNode } from "elkjs"
import type { PlacesEdge, PlacesNode } from "@/types/domain/places"

const POSITIONS_STORAGE_KEY = "places-graph-positions-v1"

// Node dimensions — must match the CSS in each node component exactly
export const NODE_DIMENSIONS = {
	unit: { width: 220, height: 70 },
	kitchen: { width: 240, height: 80 },
	mess_hall: { width: 220, height: 70 },
} as const

const ELK_OPTIONS = {
	"elk.algorithm": "layered",
	// UP direction: sources (dependents) at bottom, targets (dependencies) at top.
	// This puts units at top, mess_halls at bottom — matches the food-supply hierarchy.
	"elk.direction": "UP",
	"elk.layered.spacing.nodeNodeBetweenLayers": "100",
	"elk.spacing.nodeNode": "48",
	"elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
	"elk.edgeRouting": "SPLINES",
	"elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
}

// Lazy singleton — only created client-side (called from useEffect)
let elkInstance: unknown | null = null

async function getElk() {
	if (elkInstance) return elkInstance
	// Dynamic import to avoid SSR issues with the bundled worker
	const { default: ELK } = await import("elkjs/lib/elk.bundled.js" as string)
	elkInstance = new (ELK as new () => unknown)()
	return elkInstance
}

/**
 * Runs ELK layout on the provided nodes/edges and returns nodes with updated positions.
 * Only includes edges whose source AND target are both present in the nodes array
 * (respects active filters).
 */
export async function computeElkLayout(nodes: PlacesNode[], edges: PlacesEdge[]): Promise<PlacesNode[]> {
	if (nodes.length === 0) return nodes

	const nodeIds = new Set(nodes.map((n) => n.id))

	const elkGraph: { id: string; layoutOptions: Record<string, string>; children: ElkNode[]; edges: ElkExtendedEdge[] } = {
		id: "root",
		layoutOptions: ELK_OPTIONS,
		children: nodes.map((n) => ({
			id: n.id,
			width: NODE_DIMENSIONS[n.data.entityType].width,
			height: NODE_DIMENSIONS[n.data.entityType].height,
		})),
		edges: edges
			.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
			.map((e) => ({
				id: e.id,
				sources: [e.source],
				targets: [e.target],
			})),
	}

	const elk = await getElk()
	const layout = await (elk as { layout: (g: unknown) => Promise<{ children?: Array<{ id: string; x?: number; y?: number }> }> }).layout(elkGraph)

	return nodes.map((n) => {
		const child = layout.children?.find((c) => c.id === n.id)
		if (child?.x != null && child?.y != null) {
			return { ...n, position: { x: child.x, y: child.y } }
		}
		return n
	})
}

// ─── Manual position persistence ─────────────────────────────────────────────

type PositionMap = Record<string, { x: number; y: number }>

export function savePositions(nodes: PlacesNode[]): void {
	try {
		const map: PositionMap = {}
		for (const n of nodes) {
			map[n.id] = n.position
		}
		localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(map))
	} catch {
		// localStorage might be unavailable
	}
}

export function loadSavedPositions(): PositionMap {
	try {
		const raw = localStorage.getItem(POSITIONS_STORAGE_KEY)
		return raw ? (JSON.parse(raw) as PositionMap) : {}
	} catch {
		return {}
	}
}

export function applyManualPositions(nodes: PlacesNode[], savedPositions: PositionMap): PlacesNode[] {
	return nodes.map((n) => {
		const saved = savedPositions[n.id]
		return saved ? { ...n, position: saved } : n
	})
}
