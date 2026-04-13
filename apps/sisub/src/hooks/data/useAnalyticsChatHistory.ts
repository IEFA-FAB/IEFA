import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
	createChatSessionFn,
	deleteChatSessionFn,
	getChatMessagesFn,
	listChatSessionsFn,
	renameChatSessionFn,
	saveChatMessageFn,
	updateMessageChartTypeFn,
} from "@/server/analytics-chat.fn"
import type { ChartType, ChatSession } from "@/types/domain/analytics-chat"

const SESSIONS_KEY = ["sisub", "analytics-chat-sessions"] as const
const messagesKey = (sessionId: string) => ["sisub", "analytics-chat-messages", sessionId] as const

// ── Sessions ─────────────────────────────────────────────────────────────────

export function useChatSessions() {
	return useQuery<ChatSession[]>({
		queryKey: SESSIONS_KEY,
		queryFn: () => listChatSessionsFn(),
		staleTime: 60_000,
		refetchOnWindowFocus: false,
	})
}

export function useCreateChatSession() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (title: string) => createChatSessionFn({ data: { title } }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: SESSIONS_KEY })
		},
	})
}

export function useRenameChatSession() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: { sessionId: string; title: string }) => renameChatSessionFn({ data: vars }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: SESSIONS_KEY })
		},
	})
}

export function useDeleteChatSession() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (sessionId: string) => deleteChatSessionFn({ data: { sessionId } }),
		onSuccess: (_data, sessionId) => {
			qc.invalidateQueries({ queryKey: SESSIONS_KEY })
			qc.removeQueries({ queryKey: messagesKey(sessionId) })
		},
	})
}

// ── Messages ─────────────────────────────────────────────────────────────────

export function useChatMessages(sessionId: string | undefined) {
	return useQuery({
		queryKey: messagesKey(sessionId ?? ""),
		queryFn: () => getChatMessagesFn({ data: { sessionId: sessionId ?? "" } }),
		enabled: !!sessionId,
		staleTime: 10_000,
		refetchOnWindowFocus: false,
	})
}

export function useSaveChatMessage() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: { sessionId: string; role: "user" | "assistant"; content: string; chart?: unknown; chartTypeOverride?: ChartType; error?: string }) =>
			saveChatMessageFn({ data: vars }),
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: messagesKey(vars.sessionId) })
			// Refresh sessions list so updated_at reorders sidebar
			qc.invalidateQueries({ queryKey: SESSIONS_KEY })
		},
		onError: (err: unknown, vars) => {
			console.error("[analytics-chat] Failed to save message in session", vars.sessionId, err)
		},
	})
}

export function useUpdateMessageChartType() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: { messageId: string; sessionId: string; chartTypeOverride: ChartType }) =>
			updateMessageChartTypeFn({
				data: { messageId: vars.messageId, chartTypeOverride: vars.chartTypeOverride },
			}),
		// Optimistic update — reflect the change in cache immediately so the
		// DB-sync effect in ChatInterface doesn't flash the old value on next load.
		onMutate: async (vars) => {
			await qc.cancelQueries({ queryKey: messagesKey(vars.sessionId) })
			const snapshot = qc.getQueryData(messagesKey(vars.sessionId))
			qc.setQueryData(messagesKey(vars.sessionId), (old: unknown) => {
				if (!Array.isArray(old)) return old
				return old.map((m: { id: string; chart_type_override?: string | null }) =>
					m.id === vars.messageId ? { ...m, chart_type_override: vars.chartTypeOverride } : m
				)
			})
			return { snapshot }
		},
		onError: (err: unknown, vars, context) => {
			// Roll back the optimistic update
			if (context?.snapshot !== undefined) {
				qc.setQueryData(messagesKey(vars.sessionId), context.snapshot)
			}
			console.error("[analytics-chat] Failed to update chart type for message", vars.messageId, err)
		},
		onSettled: (_data, _err, vars) => {
			qc.invalidateQueries({ queryKey: messagesKey(vars.sessionId) })
		},
	})
}
