// ── Session & History ────────────────────────────────────────────────────────

export interface ChatSession {
	id: string
	user_id: string
	title: string
	created_at: string
	updated_at: string
}

// ── Chart & Message ──────────────────────────────────────────────────────────

export type ChartType = "bar" | "line" | "area" | "pie" | "table"

export interface ChartSpec {
	type: ChartType
	title: string
	description?: string
	xAxisKey: string
	series: { key: string; label: string; color?: string }[]
	data: Record<string, string | number | boolean | null>[]
	/** Validated SQL that produced `data`. Stored for replay/refresh; never displayed to user. */
	sql?: string
}

export interface ChatMessage {
	id: string
	role: "user" | "assistant"
	/** Markdown text content */
	content: string
	chart?: ChartSpec
	/** User-selected chart type override (persisted to DB) */
	chartTypeOverride?: ChartType
	isStreaming?: boolean
	error?: string
	createdAt: Date
}

export type StreamEvent =
	| { type: "text_delta"; delta: string }
	| { type: "chart_spec"; spec: ChartSpec }
	| { type: "done" }
	| { type: "error"; message: string }
