import type { ComponentType } from "react"

// ── Module identifiers ──────────────────────────────────────────────────────

export const CHAT_MODULES = ["global", "kitchen", "unit"] as const
export type ChatModule = (typeof CHAT_MODULES)[number]

// ── Session ─────────────────────────────────────────────────────────────────

export interface ModuleChatSession {
	id: string
	user_id: string
	module: ChatModule
	scope_id: number | null
	title: string
	created_at: string
	updated_at: string
}

// ── Tool calls ──────────────────────────────────────────────────────────────

export interface ToolCall {
	id: string
	name: string
	arguments: string
	status: "calling" | "done" | "error"
	result?: unknown
	isError?: boolean
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface ModuleChatMessage {
	id: string
	role: "user" | "assistant" | "tool"
	content: string
	toolCalls?: ToolCall[]
	toolCallId?: string
	toolName?: string
	toolResult?: unknown
	isStreaming?: boolean
	error?: string
	createdAt: Date
}

// ── Stream events ───────────────────────────────────────────────────────────

/** Observability metadata carried on every terminal SSE event (done / error). */
export interface StreamMeta {
	model: string
	latency_ms: number
	input_tokens?: number
	output_tokens?: number
}

export type ModuleStreamEvent =
	| { type: "text_delta"; delta: string }
	| { type: "tool_call_start"; id: string; name: string }
	| { type: "tool_call_delta"; id: string; arguments_delta: string }
	| { type: "tool_call_done"; id: string; name: string; arguments: Record<string, unknown> }
	| { type: "tool_result"; id: string; name: string; result: unknown; isError?: boolean }
	| { type: "done"; meta: StreamMeta }
	| { type: "error"; message: string; meta?: StreamMeta }

// ── Config ──────────────────────────────────────────────────────────────────

export interface SuggestedPrompt {
	text: string
	description: string
	Icon: ComponentType<{ className?: string }>
}

export interface ModuleChatConfig {
	module: ChatModule
	scopeId?: number
	persona: {
		name: string
		description: string
		icon: ComponentType<{ className?: string }>
	}
	suggestedPrompts: SuggestedPrompt[]
	disclaimer: string
	placeholder: string
}
