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
		// Short staleTime so navigating back to a session refetches fresh data
		// (charts, latest messages) instead of serving a stale cache snapshot.
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
			// Also refresh sessions list so updated_at reorders
			qc.invalidateQueries({ queryKey: SESSIONS_KEY })
		},
		onError: (_err: unknown, _vars) => {
			// mutation error handled by caller via isError / error state
		},
	})
}

export function useUpdateMessageChartType() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: { messageId: string; sessionId: string; chartTypeOverride: ChartType }) =>
			updateMessageChartTypeFn({ data: { messageId: vars.messageId, chartTypeOverride: vars.chartTypeOverride } }),
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: messagesKey(vars.sessionId) })
		},
		onError: (_err: unknown, _vars) => {
			// mutation error handled by caller via isError / error state
		},
	})
}
