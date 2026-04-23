import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector"

/**
 * Creates a LangSmith run-collector callback for capturing the root run ID
 * after a LangChain/LangGraph invocation completes.
 *
 * Returns `undefined` when LANGCHAIN_API_KEY is not set so callers can
 * spread it safely without adding conditional guards everywhere:
 *   `graph.invoke(input, { ...(tracer ? { callbacks: tracer.callbacks } : {}) })`
 *
 * @example
 * ```ts
 * const tracer = createRunCollector()
 * const result = await graph.invoke(input, {
 *   configurable: { thread_id: session_id },
 *   ...(tracer ? { callbacks: tracer.callbacks } : {}),
 * })
 * const runId = tracer?.getRunId() ?? null
 * await logQuery(session_id, userId, message, result, latency, runId)
 * ```
 */
export function createRunCollector() {
	if (!process.env.LANGCHAIN_API_KEY) return undefined

	const handler = new RunCollectorCallbackHandler()
	return {
		callbacks: [handler],
		/** Returns the root trace run ID after invocation completes. Null if not yet traced. */
		getRunId: (): string | null => handler.tracedRuns[0]?.id ?? null,
	}
}
