export type SyncStep = {
	id: number
	sync_id: number
	step_name: string
	status: "pending" | "running" | "success" | "error"
	current_page: number
	total_pages: number | null
	records_upserted: number
	records_deactivated: number
	error_message: string | null
	started_at: string | null
	finished_at: string | null
}

export type SyncLog = {
	id: number
	started_at: string
	finished_at: string | null
	triggered_by: string
	status: "running" | "success" | "partial" | "error"
	total_steps: number
	completed_steps: number
	successful_steps: number
	failed_steps: number
	total_upserted: number
	total_deactivated: number
	error_message: string | null
	steps: SyncStep[]
}
