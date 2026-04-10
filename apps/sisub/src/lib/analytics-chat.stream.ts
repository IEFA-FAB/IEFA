import { useCallback, useRef, useState } from "react"
import type { ChatMessage, StreamEvent } from "@/types/domain/analytics-chat"

interface UseAnalyticsStreamOptions {
	fallbackModel?: string
}

/**
 * Hook that manages an SSE connection to /api/analytics/stream.
 *
 * Usage:
 * ```tsx
 * const { submit, abort, isStreaming } = useAnalyticsStream((event) => {
 *   // handle StreamEvent
 * })
 * ```
 */
export function useAnalyticsStream(onEvent: (event: StreamEvent) => void, options?: UseAnalyticsStreamOptions) {
	const [isStreaming, setIsStreaming] = useState(false)
	const abortControllerRef = useRef<AbortController | null>(null)

	const abort = useCallback(() => {
		abortControllerRef.current?.abort()
		abortControllerRef.current = null
		setIsStreaming(false)
	}, [])

	const submit = useCallback(
		async (message: string, history: ChatMessage[]) => {
			// Cancel any in-flight request
			abortControllerRef.current?.abort()

			const controller = new AbortController()
			abortControllerRef.current = controller
			setIsStreaming(true)

			try {
				const runRequest = async (model?: string) =>
					fetch("/api/analytics/stream", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						signal: controller.signal,
						body: JSON.stringify({
							message,
							model,
							history: history.map((m) => ({ role: m.role, content: m.content })),
						}),
					})

				let res = await runRequest()

				if (res.status === 429 && options?.fallbackModel) {
					res = await runRequest(options.fallbackModel)
				}

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

					// SSE frames are separated by double newline
					const frames = lineBuffer.split("\n\n")
					// Keep last incomplete frame in buffer
					lineBuffer = frames.pop() ?? ""

					for (const frame of frames) {
						for (const line of frame.split("\n")) {
							if (line.startsWith("data: ")) {
								const raw = line.slice(6).trim()
								if (!raw) continue
								try {
									const parsed: StreamEvent = JSON.parse(raw)
									onEvent(parsed)
								} catch {
									// malformed JSON — skip
								}
							}
						}
					}
				}

				if (lineBuffer.trim()) {
					for (const line of lineBuffer.split("\n")) {
						if (!line.startsWith("data: ")) continue
						const raw = line.slice(6).trim()
						if (!raw) continue
						try {
							const parsed: StreamEvent = JSON.parse(raw)
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
		[onEvent, options?.fallbackModel]
	)

	return { submit, abort, isStreaming }
}
