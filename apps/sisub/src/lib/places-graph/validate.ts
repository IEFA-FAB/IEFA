import type { Connection } from "@xyflow/react"
import type { PlacesNode, PlacesNodeData, RelationType } from "@/types/domain/places"

// ─── Valid connection rules ───────────────────────────────────────────────────

/**
 * Defines which entity types can be connected via which FK relation.
 * "source" is the record that OWNS the FK column; "target" is what it points to.
 */
export const VALID_CONNECTION_RULES: Array<{
	relationType: RelationType
	sourceEntityType: PlacesNodeData["entityType"]
	targetEntityType: PlacesNodeData["entityType"]
	label: string
}> = [
	{
		relationType: "kitchen.unit_id",
		sourceEntityType: "kitchen",
		targetEntityType: "unit",
		label: "pertence a",
	},
	{
		relationType: "kitchen.purchase_unit_id",
		sourceEntityType: "kitchen",
		targetEntityType: "unit",
		label: "compra via",
	},
	{
		relationType: "kitchen.kitchen_id",
		sourceEntityType: "kitchen",
		targetEntityType: "kitchen",
		label: "abastecida por",
	},
	{
		relationType: "mess_halls.unit_id",
		sourceEntityType: "mess_hall",
		targetEntityType: "unit",
		label: "pertence a",
	},
	{
		relationType: "mess_halls.kitchen_id",
		sourceEntityType: "mess_hall",
		targetEntityType: "kitchen",
		label: "operada por",
	},
]

export const RELATION_LABELS: Record<RelationType, string> = Object.fromEntries(VALID_CONNECTION_RULES.map((r) => [r.relationType, r.label])) as Record<
	RelationType,
	string
>

// ─── Runtime validation ───────────────────────────────────────────────────────

/**
 * Returns true if the connection attempt is valid given the entity types involved.
 * Used as ReactFlow's `isValidConnection` prop.
 */
export function isValidPlacesConnection(connection: Connection, nodes: PlacesNode[]): boolean {
	if (!connection.source || !connection.target) return false
	if (connection.source === connection.target) return false

	const sourceNode = nodes.find((n) => n.id === connection.source)
	const targetNode = nodes.find((n) => n.id === connection.target)
	if (!sourceNode || !targetNode) return false

	const srcType = sourceNode.data.entityType
	const tgtType = targetNode.data.entityType

	return VALID_CONNECTION_RULES.some((rule) => rule.sourceEntityType === srcType && rule.targetEntityType === tgtType)
}

/**
 * Infers the most likely RelationType when reconnecting an edge.
 * Prefers matching the existing relationType from the old edge if the entity types still match.
 */
export function inferRelationType(sourceNode: PlacesNode, targetNode: PlacesNode, existingRelationType?: RelationType): RelationType | null {
	const srcType = sourceNode.data.entityType
	const tgtType = targetNode.data.entityType

	// Try to preserve the existing relation type if it still makes sense
	if (existingRelationType) {
		const existingRule = VALID_CONNECTION_RULES.find((r) => r.relationType === existingRelationType)
		if (existingRule && existingRule.sourceEntityType === srcType && existingRule.targetEntityType === tgtType) {
			return existingRelationType
		}
	}

	// Fallback: pick the first matching rule
	const match = VALID_CONNECTION_RULES.find((r) => r.sourceEntityType === srcType && r.targetEntityType === tgtType)
	return match?.relationType ?? null
}
