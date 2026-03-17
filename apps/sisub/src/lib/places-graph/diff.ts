import type { PlacesDiff, PlacesEdge, PlacesNode } from "@/types/domain/places"
import { RELATION_LABELS } from "./validate"

function getNodeLabel(nodes: PlacesNode[], nodeId: string): string {
	const node = nodes.find((n) => n.id === nodeId)
	if (!node) return nodeId
	const record = node.data.record
	return record.display_name ?? `#${record.id}`
}

/**
 * Builds a PlacesDiff from an edge reconnection.
 * Called when the user drags an edge endpoint to a new target node.
 */
export function buildDiffFromReconnection(edge: PlacesEdge, newTargetNodeId: string, allNodes: PlacesNode[]): PlacesDiff {
	if (!edge.data) throw new Error(`Edge ${edge.id} has no data`)

	const newTargetNode = allNodes.find((n) => n.id === newTargetNodeId)
	if (!newTargetNode) throw new Error(`Target node ${newTargetNodeId} not found`)

	const newTargetId = newTargetNode.data.record.id
	const sourceLabel = getNodeLabel(allNodes, edge.source)
	const originalTargetLabel = getNodeLabel(allNodes, edge.target)
	const newTargetLabel = getNodeLabel(allNodes, newTargetNodeId)
	const relationLabel = RELATION_LABELS[edge.data.relationType] ?? edge.data.fkColumn
	const table = edge.data.relationType.startsWith("kitchen") ? ("kitchen" as const) : ("mess_halls" as const)

	return {
		table,
		recordId: edge.data.sourceRecordId,
		column: edge.data.fkColumn,
		previousValue: edge.data.originalTargetId,
		newValue: newTargetId,
		humanReadable: `${sourceLabel}: ${relationLabel} de "${originalTargetLabel}" → "${newTargetLabel}"`,
	}
}
