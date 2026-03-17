import type { Edge, Node } from "@xyflow/react"
import type { Tables } from "@/types/supabase.types"

// ─── Raw DB rows ──────────────────────────────────────────────────────────────

export type DbUnit = Tables<"units">
export type DbKitchen = Tables<"kitchen">
export type DbMessHall = Tables<"mess_halls">

export interface PlacesGraphData {
	units: DbUnit[]
	kitchens: DbKitchen[]
	messHalls: DbMessHall[]
}

// ─── Node data (discriminated union) ─────────────────────────────────────────

export interface UnitNodeData {
	entityType: "unit"
	record: DbUnit
	[key: string]: unknown
}

export interface KitchenNodeData {
	entityType: "kitchen"
	record: DbKitchen
	[key: string]: unknown
}

export interface MessHallNodeData {
	entityType: "mess_hall"
	record: DbMessHall
	[key: string]: unknown
}

export type PlacesNodeData = UnitNodeData | KitchenNodeData | MessHallNodeData
export type PlacesNode = Node<PlacesNodeData>

// ─── Edge data ────────────────────────────────────────────────────────────────

/**
 * Each RelationType maps 1:1 to a FK column in the DB.
 * This is the canonical identifier used throughout the editor.
 */
export type RelationType = "kitchen.unit_id" | "kitchen.purchase_unit_id" | "kitchen.kitchen_id" | "mess_halls.unit_id" | "mess_halls.kitchen_id"

export interface PlacesEdgeData {
	relationType: RelationType
	sourceEntityType: "unit" | "kitchen" | "mess_hall"
	targetEntityType: "unit" | "kitchen" | "mess_hall"
	/** ID of the record that owns the FK (the source entity's DB id) */
	sourceRecordId: number
	/** The FK column name, e.g. "unit_id" */
	fkColumn: string
	/** DB id of the original target — used for rollback */
	originalTargetId: number
	/** True when this edge has been reconnected but not yet saved */
	isDirty: boolean
	[key: string]: unknown
}

export type PlacesEdge = Edge<PlacesEdgeData>

// ─── Diff (pending changes to persist) ───────────────────────────────────────

export interface PlacesDiff {
	table: "kitchen" | "mess_halls"
	recordId: number
	column: string
	previousValue: number
	newValue: number
	/** Shown in DirtyChangesBar for the user to review */
	humanReadable: string
}

// ─── UI state ─────────────────────────────────────────────────────────────────

export type PlacesEditorMode = "view" | "edit"

export interface PlacesFilterState {
	showUnits: boolean
	showKitchens: boolean
	showMessHalls: boolean
	search: string
}

export type PlacesSelection = { type: "node"; node: PlacesNode } | { type: "edge"; edge: PlacesEdge } | null
