import { useCallback, useRef, useState } from "react"
import type { ChatModule, ModuleChatMessage, ModuleStreamEvent } from "@/types/domain/module-chat"

interface UseModuleChatStreamOptions {
	module: ChatModule
	scopeId?: number
}

/**
 * Hook that manages an SSE connection to /api/module-chat/stream.
 * Similar to useAnalyticsStream but with tool call events.
 */
export function useModuleChatStream(onEvent: (event: ModuleStreamEvent) => void, options: UseModuleChatStreamOptions) {
	const [isStreaming, setIsStreaming] = useState(false)
	const abortControllerRef = useRef<AbortController | null>(null)

	const abort = useCallback(() => {
		abortControllerRef.current?.abort()
		abortControllerRef.current = null
		setIsStreaming(false)
	}, [])

	const submit = useCallback(
		async (message: string, history: ModuleChatMessage[]) => {
			abortControllerRef.current?.abort()

			const controller = new AbortController()
			abortControllerRef.current = controller
			setIsStreaming(true)

			try {
				const res = await fetch("/api/module-chat/stream", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					signal: controller.signal,
					body: JSON.stringify({
						message,
						module: options.module,
						scopeId: options.scopeId,
						history: history
							.filter((m) => m.role !== "tool")
							.map((m) => ({
								role: m.role,
								content: m.content,
								...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
							})),
					}),
				})

				if (!res.ok) {
					const text = await res.text().catch(() => "Erro desconhecido")
					onEvent({ type: "error", message: `Erro ${res.status}: ${text}` })
					return
				}

				if (!res.body) {
					onEvent({ type: "error", message: "Resposta sem corpo" })
					return
				}

				const reader = res.body.getReader()
				const decoder = new TextDecoder()
				let lineBuffer = ""

				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					lineBuffer += decoder.decode(value, { stream: true })

					const frames = lineBuffer.split("\n\n")
					lineBuffer = frames.pop() ?? ""

					for (const frame of frames) {
						for (const line of frame.split("\n")) {
							if (line.startsWith("data: ")) {
								const raw = line.slice(6).trim()
								if (!raw) continue
								try {
									const parsed: ModuleStreamEvent = JSON.parse(raw)
									onEvent(parsed)
								} catch {
									// malformed JSON — skip
								}
							}
						}
					}
				}

				// Flush remaining buffer
				if (lineBuffer.trim()) {
					for (const line of lineBuffer.split("\n")) {
						if (!line.startsWith("data: ")) continue
						const raw = line.slice(6).trim()
						if (!raw) continue
						try {
							const parsed: ModuleStreamEvent = JSON.parse(raw)
							onEvent(parsed)
						} catch {
							// malformed JSON — skip
						}
					}
				}
			} catch (e) {
				if ((e as Error).name === "AbortError") return
				onEvent({ type: "error", message: (e as Error).message })
			} finally {
				if (!controller.signal.aborted) {
					abortControllerRef.current = null
				}
				setIsStreaming(false)
			}
		},
		[onEvent, options.module, options.scopeId]
	)

	return { submit, abort, isStreaming }
}
