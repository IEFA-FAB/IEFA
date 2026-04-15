import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	createModuleChatSessionFn,
	deleteModuleChatSessionFn,
	getModuleChatMessagesFn,
	listModuleChatSessionsFn,
	renameModuleChatSessionFn,
	saveModuleChatMessageFn,
} from "@/server/module-chat.fn"
import type { ChatModule, ModuleChatSession } from "@/types/domain/module-chat"

// ── Query keys ──────────────────────────────────────────────────────────────

const sessionsKey = (module: ChatModule, scopeId?: number) => ["sisub", "module-chat-sessions", module, scopeId ?? "global"] as const
const messagesKey = (sessionId: string) => ["sisub", "module-chat-messages", sessionId] as const

// ── Sessions ────────────────────────────────────────────────────────────────

export function useModuleChatSessions(module: ChatModule, scopeId?: number) {
	return useQuery({
		queryKey: sessionsKey(module, scopeId),
		queryFn: async () => {
			const data = await listModuleChatSessionsFn({ data: { module, scopeId } })
			return data as unknown as ModuleChatSession[]
		},
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	})
}

export function useCreateModuleChatSession(module: ChatModule, scopeId?: number) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: async (title: string) => {
			const data = await createModuleChatSessionFn({ data: { title, module, scopeId } })
			return data as unknown as ModuleChatSession
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: sessionsKey(module, scopeId) })
		},
	})
}

export function useRenameModuleChatSession(module: ChatModule, scopeId?: number) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: { sessionId: string; title: string }) => renameModuleChatSessionFn({ data: vars }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: sessionsKey(module, scopeId) })
		},
	})
}

export function useDeleteModuleChatSession(module: ChatModule, scopeId?: number) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (sessionId: string) => deleteModuleChatSessionFn({ data: { sessionId } }),
		onSuccess: (_data, sessionId) => {
			qc.invalidateQueries({ queryKey: sessionsKey(module, scopeId) })
			qc.removeQueries({ queryKey: messagesKey(sessionId) })
		},
	})
}

// ── Messages ────────────────────────────────────────────────────────────────

interface ModuleChatMessageRow {
	id: string
	session_id: string
	role: string
	content: string
	tool_calls: unknown
	tool_call_id: string | null
	tool_name: string | null
	tool_result: unknown
	error: string | null
	created_at: string
}

export function useModuleChatMessages(sessionId: string | undefined) {
	return useQuery({
		queryKey: messagesKey(sessionId ?? ""),
		queryFn: async () => {
			const data = await getModuleChatMessagesFn({ data: { sessionId: sessionId ?? "" } })
			return data as unknown as ModuleChatMessageRow[]
		},
		enabled: !!sessionId,
		staleTime: 10_000,
		refetchOnWindowFocus: false,
	})
}

export function useSaveModuleChatMessage(module: ChatModule, scopeId?: number) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: {
			sessionId: string
			role: "user" | "assistant" | "tool"
			content: string
			toolCalls?: unknown
			toolCallId?: string
			toolName?: string
			toolResult?: unknown
			error?: string
		}) => saveModuleChatMessageFn({ data: vars }),
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: messagesKey(vars.sessionId) })
			qc.invalidateQueries({ queryKey: sessionsKey(module, scopeId) })
		},
		onError: (_err: unknown, _vars) => {},
	})
}
