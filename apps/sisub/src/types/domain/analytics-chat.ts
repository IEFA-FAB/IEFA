export type ChartType = "bar" | "line" | "area" | "pie" | "table"

export interface ChartSpec {
	type: ChartType
	title: string
	description?: string
	xAxisKey: string
	series: { key: string; label: string; color?: string }[]
	data: Record<string, string | number | boolean | null>[]
}

export interface ChatMessage {
	id: string
	role: "user" | "assistant"
	/** Markdown text content */
	content: string
	chart?: ChartSpec
	isStreaming?: boolean
	error?: string
	createdAt: Date
}

export type StreamEvent =
	| { type: "text_delta"; delta: string }
	| { type: "chart_spec"; spec: ChartSpec }
	| { type: "done" }
	| { type: "error"; message: string }
