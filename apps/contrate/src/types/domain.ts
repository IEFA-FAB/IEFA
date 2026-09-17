import type { ColumnVisibilityState, SortingState } from "@tanstack/react-table"

export const FACILITIES_QUERY_KEY = ["facilities_pregoeiro"]

export type TableSettings = {
	columnVisibility?: ColumnVisibilityState
	sorting?: SortingState
	pageSize?: number
	titleFilter?: string
}

export const LS_TABLE_SETTINGS_KEY = "pregoeiro_table_settings_v1"

/* ---------------------------------------------------------
   Tipos
--------------------------------------------------------- */

export type Facilidades_pregoeiro = {
	id: string
	created_at: string
	phase: string
	title: string
	content: string
	tags: string[] | null
	owner_id: string | null
	default: boolean | null
}

export interface FacilidadesTableProps {
	OM: string
	Date: string
	Hour: string
	Hour_limit: string
	currentUserId?: string
	onEditRow?: (row: Facilidades_pregoeiro) => void
}

export type TemplateContext = {
	OM: string
	date: string
	hour: string
	hour_limit: string
}
