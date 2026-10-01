import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import {
	createModuleChatSessionFn,
	deleteModuleChatSessionFn,
	getModuleChatMessagesFn,
	listModuleChatSessionsFn,
	renameModuleChatSessionFn,
	saveModuleChatMessageFn,
} from "@/server/module-chat.fn"
import { describeChatActionFn } from "@/server/module-chat-action.fn"
import type { ChatModule, ModuleChatSession } from "@/types/domain/module-chat"

// ── Sessions ────────────────────────────────────────────────────────────────

export function useModuleChatSessions(module: ChatModule, scopeId?: number) {
	return useQuery({
		queryKey: queryKeys.sisub.moduleSessions(module, scopeId),
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
			qc.invalidateQueries({ queryKey: queryKeys.sisub.moduleSessions(module, scopeId) })
		},
	})
}

export function useRenameModuleChatSession(module: ChatModule, scopeId?: number) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (vars: { sessionId: string; title: string }) => renameModuleChatSessionFn({ data: vars }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.sisub.moduleSessions(module, scopeId) })
		},
	})
}

export function useDeleteModuleChatSession(module: ChatModule, scopeId?: number) {
	const qc = useQueryClient()
	return useMutation({
		mutationFn: (sessionId: string) => deleteModuleChatSessionFn({ data: { sessionId } }),
		onSuccess: (_data, sessionId) => {
			qc.invalidateQueries({ queryKey: queryKeys.sisub.moduleSessions(module, scopeId) })
			qc.removeQueries({ queryKey: queryKeys.sisub.moduleMessages(sessionId) })
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
		queryKey: queryKeys.sisub.moduleMessages(sessionId ?? ""),
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
			model?: string
			latencyMs?: number
			inputTokens?: number
			outputTokens?: number
		}) => saveModuleChatMessageFn({ data: vars }),
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: queryKeys.sisub.moduleMessages(vars.sessionId) })
			qc.invalidateQueries({ queryKey: queryKeys.sisub.moduleSessions(module, scopeId) })
		},
		onError: (_err: unknown, _vars) => {},
	})
}

// ── Aprovação de ação ───────────────────────────────────────────────────────

/**
 * O que a ação de escrita vai tocar, descrito pelo servidor (nome, data, refeição), para o
 * cartão de Confirmar/Recusar. A chave é a call: os argumentos dela não mudam; a linha que
 * eles apontam pode mudar, por isso o dado não fica eterno.
 */
export function useChatActionDescription(input: {
	module: ChatModule
	scopeId?: number
	toolCallId: string
	toolName: string
	args: Record<string, unknown> | null
	enabled: boolean
}) {
	const { module, scopeId, toolCallId, toolName, args, enabled } = input
	return useQuery({
		queryKey: queryKeys.sisub.moduleChatAction(module, scopeId, toolCallId),
		queryFn: () => describeChatActionFn({ data: { module, scopeId, toolName, args: args ?? {} } }),
		enabled: enabled && args !== null,
		// O cartão pode ficar aberto enquanto o dado muda; ao voltar à aba, a descrição se refaz.
		staleTime: 30_000,
		retry: 1,
	})
}
