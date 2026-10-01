import type { UIMessage } from "@tanstack/ai-client"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCreateModuleChatSession, useModuleChatMessages, useSaveModuleChatMessage } from "@/hooks/data/useModuleChatHistory"
import {
	CLOSED_TURN,
	collectTurnRecord,
	extractText,
	extractToolCalls,
	hasAwaitingApproval,
	hasMessagePayload,
	OPENED_TURN,
	resolveApprovalInterrupt,
	stepTurn,
	type TurnState,
} from "@/lib/module-chat/turn"
import type { ChatModule, ModuleChatMessage, ToolCall } from "@/types/domain/module-chat"

// ── Helpers ───────────────────────────────────────────────────────────────────

function titleFromMessage(msg: string) {
	const trimmed = msg.replace(/\s+/g, " ").trim()
	return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UseModuleChatSessionOptions {
	sessionId: string | undefined
	module: ChatModule
	scopeId?: number
	onSessionCreated: (id: string) => void
}

export interface UseModuleChatSessionReturn {
	messages: ModuleChatMessage[]
	isStreaming: boolean
	loadingMessages: boolean
	/** Falha do turno atual (rede, 4xx/5xx do endpoint, RUN_ERROR do provider). */
	streamError: string | undefined
	/**
	 * Uma ação de escrita espera Confirmar/Recusar. Enquanto `true`, o input fica bloqueado: o
	 * `@tanstack/ai-client` recusa mensagem nova com interrupt pendente.
	 */
	awaitingApproval: boolean
	/** A decisão foi dada, mas o envio dela falhou; só resta descartar a ação pendente. */
	approvalSubmitFailed: boolean
	handleSubmit: (message: string) => void
	handleAbort: () => void
	/** Confirma (`true`) ou recusa (`false`) a ação `approval_<toolCallId>`. */
	handleApprovalDecision: (approvalId: string, approved: boolean) => void
	handleDiscardPendingAction: () => void
}

// ── Connection ────────────────────────────────────────────────────────────────

const MODULE_STREAM_URL = "/api/module-chat/stream"
const MODULE_CONNECTION = fetchServerSentEvents(MODULE_STREAM_URL)

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useModuleChatSession({ sessionId, module, scopeId, onSessionCreated }: UseModuleChatSessionOptions): UseModuleChatSessionReturn {
	// Refs for session management
	const sessionIdRef = useRef<string | undefined>(sessionId)
	const sessionPromiseRef = useRef<Promise<string> | null>(null)
	/** Sessão do turno em aberto — é nela que a resposta é gravada, mesmo se a tela trocar. */
	const turnSessionRef = useRef<string | undefined>(undefined)
	const turnRef = useRef<TurnState>(CLOSED_TURN)

	useEffect(() => {
		sessionIdRef.current = sessionId
	}, [sessionId])

	// ── Persistence hooks ─────────────────────────────────────────────────────

	const { data: loadedMessages, isLoading: loadingMessages } = useModuleChatMessages(sessionId)
	const createSession = useCreateModuleChatSession(module, scopeId)
	const saveMessage = useSaveModuleChatMessage(module, scopeId)

	const saveMessageRef = useRef(saveMessage)
	const createSessionRef = useRef(createSession)
	const onSessionCreatedRef = useRef(onSessionCreated)
	useEffect(() => {
		saveMessageRef.current = saveMessage
	})
	useEffect(() => {
		createSessionRef.current = createSession
	})
	useEffect(() => {
		onSessionCreatedRef.current = onSessionCreated
	})

	// ── Tool calls map (display data from DB load) ──────────────────────────────

	const [toolCallsMap, setToolCallsMap] = useState<Map<string, ToolCall[]>>(new Map())
	const toolCallsMapRef = useRef(toolCallsMap)
	useEffect(() => {
		toolCallsMapRef.current = toolCallsMap
	}, [toolCallsMap])

	// ── useChat ───────────────────────────────────────────────────────────────

	// module/scopeId go in body → forwarded as forwardedProps on the server
	const body = useMemo(() => ({ module, scopeId }), [module, scopeId])
	const {
		messages: uiMessages,
		sendMessage,
		stop,
		isLoading,
		setMessages,
		clear,
		error,
		pendingInterrupts,
		resuming,
		addToolApprovalResponse,
	} = useChat({
		connection: MODULE_CONNECTION,
		body,
	})

	const uiMessagesRef = useRef<UIMessage[]>([])
	uiMessagesRef.current = uiMessages

	const hasUndecidedAction = hasAwaitingApproval(uiMessages)
	const awaitingApproval = !isLoading && (pendingInterrupts.length > 0 || resuming || hasUndecidedAction)
	// A decisão foi dada mas o envio dela falhou (rede, 4xx): o interrupt continua aberto no
	// cliente e não há mais cartão para clicar. Sem uma saída, o input ficaria travado.
	const approvalSubmitFailed = awaitingApproval && !resuming && !hasUndecidedAction

	// ── Gravação do turno ─────────────────────────────────────────────────────
	//
	// Uma vez por turno, quando o stream PARA e nada espera decisão. A parada no interrupt de
	// aprovação não grava: a ação ainda não aconteceu, e uma linha gravada ali apareceria ao
	// recarregar como se tivesse executado (ou ficaria pendente para sempre). A gravação vem
	// depois da decisão, com a ação e a resposta do modelo juntas.

	const persistTurn = useCallback((messages: readonly UIMessage[]) => {
		const record = collectTurnRecord(messages)
		if (!record) return
		void sessionPromiseRef.current
			?.then(async (sid) => {
				const doSave = async (attempt = 0): Promise<void> => {
					try {
						await saveMessageRef.current.mutateAsync({
							sessionId: sid,
							role: "assistant",
							content: record.content,
							toolCalls: record.toolCalls.length > 0 ? record.toolCalls : undefined,
						})
					} catch {
						if (attempt < 3) {
							await new Promise<void>((r) => setTimeout(r, 1000 * 2 ** attempt))
							return doSave(attempt + 1)
						}
					}
				}
				await doSave()
			})
			.catch((_err: unknown) => {})
	}, [])

	useEffect(() => {
		const { turn, persist } = stepTurn(turnRef.current, { isLoading, awaitingApproval })
		turnRef.current = turn
		if (persist) persistTurn(uiMessages)
	}, [isLoading, awaitingApproval, uiMessages, persistTurn])

	// ── DB sync effect ────────────────────────────────────────────────────────

	const restoreFromHistory = useCallback(
		(rows: NonNullable<typeof loadedMessages>) => {
			const newMessages: UIMessage[] = rows
				.filter((m) => m.role === "user" || m.role === "assistant")
				.map((m) => ({
					id: m.id,
					role: m.role as "user" | "assistant",
					parts: [{ type: "text" as const, content: m.content }],
					createdAt: new Date(m.created_at),
				}))

			setMessages(newMessages)

			// Restore tool calls from DB
			const dbToolCalls = new Map<string, ToolCall[]>()
			for (const m of rows) {
				if (m.tool_calls) {
					dbToolCalls.set(m.id, m.tool_calls as unknown as ToolCall[])
				}
			}
			setToolCallsMap(dbToolCalls)
		},
		[setMessages]
	)

	useEffect(() => {
		// Trocar de conversa com uma ação esperando decisão: o interrupt é desta conversa, não
		// da próxima. Sem limpar, o cliente seguiria recusando mensagem nova (interrupt
		// pendente) numa tela sem o cartão para decidir. Nada foi gravado pela ação.
		if (awaitingApproval && sessionId !== turnSessionRef.current) {
			clear()
			turnRef.current = CLOSED_TURN
		}
		if (!sessionId) {
			setMessages([])
			setToolCallsMap(new Map())
			return
		}
		if (!loadedMessages) return
		if (isLoading) return
		const prev = uiMessagesRef.current
		if (prev.length > 0 && prev.length > loadedMessages.length) return

		restoreFromHistory(loadedMessages)
	}, [sessionId, loadedMessages, isLoading, setMessages, awaitingApproval, clear, restoreFromHistory])

	// ── Derived messages ──────────────────────────────────────────────────────

	const lastAssistantIdx = uiMessages.reduce((last, m, i) => (m.role === "assistant" ? i : last), -1)

	// Falha do turno (413 do provider, 401/503 do endpoint, rede). Sem isto o
	// turno que morre deixa só uma bolha vazia — foi assim que o 413 de payload
	// das tools passou despercebido.
	//
	// Fica solto, fora das mensagens, de propósito: quando o turno morre antes de
	// qualquer conteúdo, nenhuma mensagem do assistente chegou a existir, e pendurar
	// o erro na "última" bolha o colaria na RESPOSTA ANTERIOR — que deu certo.
	const streamError = error?.message

	const messages: ModuleChatMessage[] = uiMessages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m, i) => {
			const streamingToolCalls = extractToolCalls(m.parts)
			const storedToolCalls = toolCallsMapRef.current.get(m.id)
			return {
				id: m.id,
				role: m.role as "user" | "assistant",
				content: extractText(m.parts),
				toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : storedToolCalls,
				isStreaming: isLoading && m.role === "assistant" && i === lastAssistantIdx,
				createdAt: m.createdAt ?? new Date(),
			}
		})
		.filter((m) => {
			if (m.role === "user") return true
			if (m.isStreaming) return true
			// A ação esperando decisão tem de aparecer: é nela que ficam Confirmar e Recusar.
			if (m.toolCalls?.some((tc) => tc.status === "awaiting-approval")) return true
			return hasMessagePayload(m.content, m.toolCalls ?? [])
		})

	// ── Action handlers ───────────────────────────────────────────────────────

	const handleAbort = useCallback(() => {
		stop()
	}, [stop])

	const handleSubmit = useCallback(
		(message: string) => {
			// Com ação pendente, nem grava nem envia: o cliente recusaria o envio, e a mensagem
			// gravada ficaria no histórico sem resposta.
			if (awaitingApproval) return

			const sid = sessionIdRef.current
			if (sid) {
				sessionPromiseRef.current = Promise.resolve(sid)
				turnSessionRef.current = sid
				saveMessageRef.current.mutate({ sessionId: sid, role: "user", content: message })
			} else {
				turnSessionRef.current = undefined
				const p = createSessionRef.current.mutateAsync(titleFromMessage(message)).then((newSession) => {
					sessionIdRef.current = newSession.id
					turnSessionRef.current = newSession.id
					onSessionCreatedRef.current(newSession.id)
					saveMessageRef.current.mutate({ sessionId: newSession.id, role: "user", content: message })
					return newSession.id
				})
				sessionPromiseRef.current = p
			}
			turnRef.current = OPENED_TURN
			void sendMessage(message)
		},
		[sendMessage, awaitingApproval]
	)

	const handleApprovalDecision = useCallback(
		(approvalId: string, approved: boolean) => {
			// Primeiro o cartão (o part passa a `approved`, que é o que vai no histórico do turno
			// seguinte); depois a resposta do interrupt, que dispara o run com o `resume`.
			void addToolApprovalResponse({ id: approvalId, approved })
			resolveApprovalInterrupt(pendingInterrupts, approvalId, approved)
		},
		[addToolApprovalResponse, pendingInterrupts]
	)

	/**
	 * Saída do envio de decisão que falhou: descarta a ação pendente (nada foi gravado por ela) e
	 * volta a conversa ao que está no histórico. O modelo não fica sabendo da ação descartada.
	 */
	const handleDiscardPendingAction = useCallback(() => {
		clear()
		turnRef.current = CLOSED_TURN
		if (loadedMessages) restoreFromHistory(loadedMessages)
	}, [clear, loadedMessages, restoreFromHistory])

	return {
		messages,
		isStreaming: isLoading,
		loadingMessages,
		streamError,
		awaitingApproval,
		approvalSubmitFailed,
		handleSubmit,
		handleAbort,
		handleApprovalDecision,
		handleDiscardPendingAction,
	}
}
