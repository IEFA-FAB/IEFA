import type { PlacesEdge, PlacesGraphData, PlacesNode } from "@/types/domain/places"

/**
 * Pure function — converts raw DB rows into ReactFlow nodes and edges.
 * No React, no side effects. Fully testable.
 *
 * All positions start at (0,0) — layout.ts applies ELK coordinates after.
 */
export function transformToGraph(data: PlacesGraphData): {
	nodes: PlacesNode[]
	edges: PlacesEdge[]
} {
	const nodes: PlacesNode[] = [
		...data.units.map(
			(unit): PlacesNode => ({
				id: `unit-${unit.id}`,
				type: "unitNode",
				position: { x: 0, y: 0 },
				data: { entityType: "unit", record: unit },
			})
		),
		...data.kitchens.map(
			(kitchen): PlacesNode => ({
				id: `kitchen-${kitchen.id}`,
				type: "kitchenNode",
				position: { x: 0, y: 0 },
				data: { entityType: "kitchen", record: kitchen },
			})
		),
		...data.messHalls.map(
			(mh): PlacesNode => ({
				id: `mess_hall-${mh.id}`,
				type: "messHallNode",
				position: { x: 0, y: 0 },
				data: { entityType: "mess_hall", record: mh },
			})
		),
	]

	const edges: PlacesEdge[] = []

	for (const kitchen of data.kitchens) {
		if (kitchen.unit_id != null) {
			edges.push({
				id: `kitchen.unit_id-${kitchen.id}`,
				source: `kitchen-${kitchen.id}`,
				target: `unit-${kitchen.unit_id}`,
				sourceHandle: "source",
				targetHandle: "target",
				type: "relationEdge",
				data: {
					relationType: "kitchen.unit_id",
					sourceEntityType: "kitchen",
					targetEntityType: "unit",
					sourceRecordId: kitchen.id,
					fkColumn: "unit_id",
					originalTargetId: kitchen.unit_id,
					isDirty: false,
				},
			})
		}

		if (kitchen.purchase_unit_id != null) {
			edges.push({
				id: `kitchen.purchase_unit_id-${kitchen.id}`,
				source: `kitchen-${kitchen.id}`,
				target: `unit-${kitchen.purchase_unit_id}`,
				sourceHandle: "source",
				targetHandle: "target",
				type: "relationEdge",
				data: {
					relationType: "kitchen.purchase_unit_id",
					sourceEntityType: "kitchen",
					targetEntityType: "unit",
					sourceRecordId: kitchen.id,
					fkColumn: "purchase_unit_id",
					originalTargetId: kitchen.purchase_unit_id,
					isDirty: false,
				},
			})
		}

		if (kitchen.kitchen_id != null) {
			edges.push({
				id: `kitchen.kitchen_id-${kitchen.id}`,
				source: `kitchen-${kitchen.id}`,
				target: `kitchen-${kitchen.kitchen_id}`,
				sourceHandle: "source",
				targetHandle: "target",
				type: "relationEdge",
				data: {
					relationType: "kitchen.kitchen_id",
					sourceEntityType: "kitchen",
					targetEntityType: "kitchen",
					sourceRecordId: kitchen.id,
					fkColumn: "kitchen_id",
					originalTargetId: kitchen.kitchen_id,
					isDirty: false,
				},
			})
		}
	}

	for (const mh of data.messHalls) {
		edges.push({
			id: `mess_halls.unit_id-${mh.id}`,
			source: `mess_hall-${mh.id}`,
			target: `unit-${mh.unit_id}`,
			sourceHandle: "source",
			targetHandle: "target",
			type: "relationEdge",
			data: {
				relationType: "mess_halls.unit_id",
				sourceEntityType: "mess_hall",
				targetEntityType: "unit",
				sourceRecordId: mh.id,
				fkColumn: "unit_id",
				originalTargetId: mh.unit_id,
				isDirty: false,
			},
		})

		if (mh.kitchen_id != null) {
			edges.push({
				id: `mess_halls.kitchen_id-${mh.id}`,
				source: `mess_hall-${mh.id}`,
				target: `kitchen-${mh.kitchen_id}`,
				sourceHandle: "source",
				targetHandle: "target",
				type: "relationEdge",
				data: {
					relationType: "mess_halls.kitchen_id",
					sourceEntityType: "mess_hall",
					targetEntityType: "kitchen",
					sourceRecordId: mh.id,
					fkColumn: "kitchen_id",
					originalTargetId: mh.kitchen_id,
					isDirty: false,
				},
			})
		}
	}

	return { nodes, edges }
}
