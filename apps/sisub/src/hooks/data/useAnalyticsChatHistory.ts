import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
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

// ── Sessions ─────────────────────────────────────────────────────────────────

export function useChatSessions() {
	return useQuery<ChatSession[]>({
		queryKey: queryKeys.sisub.analyticsSessions(),
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
			qc.invalidateQueries({ queryKey: queryKeys.sisub.analyticsSessions() })
		},
	})
}

export function useRenameChatSession() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: { sessionId: string; title: string }) => renameChatSessionFn({ data: vars }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.sisub.analyticsSessions() })
		},
	})
}

export function useDeleteChatSession() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (sessionId: string) => deleteChatSessionFn({ data: { sessionId } }),
		onSuccess: (_data, sessionId) => {
			qc.invalidateQueries({ queryKey: queryKeys.sisub.analyticsSessions() })
			qc.removeQueries({ queryKey: queryKeys.sisub.analyticsMessages(sessionId) })
		},
	})
}

// ── Messages ─────────────────────────────────────────────────────────────────

export function useChatMessages(sessionId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.sisub.analyticsMessages(sessionId ?? ""),
		queryFn: () => getChatMessagesFn({ data: { sessionId: sessionId ?? "" } }),
		enabled: !!sessionId,
		staleTime: 10_000,
		refetchOnWindowFocus: false,
	})
}

export function useSaveChatMessage() {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: {
			sessionId: string
			role: "user" | "assistant"
			content: string
			chart?: unknown
			chartTypeOverride?: ChartType
			error?: string
			model?: string
			latencyMs?: number
			inputTokens?: number
			outputTokens?: number
		}) => saveChatMessageFn({ data: vars }),
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: queryKeys.sisub.analyticsMessages(vars.sessionId) })
			// Refresh sessions list so updated_at reorders sidebar
			qc.invalidateQueries({ queryKey: queryKeys.sisub.analyticsSessions() })
		},
		onError: (_err: unknown, _vars) => {},
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
			await qc.cancelQueries({ queryKey: queryKeys.sisub.analyticsMessages(vars.sessionId) })
			const snapshot = qc.getQueryData(queryKeys.sisub.analyticsMessages(vars.sessionId))
			qc.setQueryData(queryKeys.sisub.analyticsMessages(vars.sessionId), (old: unknown) => {
				if (!Array.isArray(old)) return old
				return old.map((m: { id: string; chart_type_override?: string | null }) =>
					m.id === vars.messageId ? { ...m, chart_type_override: vars.chartTypeOverride } : m
				)
			})
			return { snapshot }
		},
		onError: (_err: unknown, vars, context) => {
			// Roll back the optimistic update
			if (context?.snapshot !== undefined) {
				qc.setQueryData(queryKeys.sisub.analyticsMessages(vars.sessionId), context.snapshot)
			}
		},
		onSettled: (_data, _err, vars) => {
			qc.invalidateQueries({ queryKey: queryKeys.sisub.analyticsMessages(vars.sessionId) })
		},
	})
}
