import { mock } from "bun:test"

/**
 * Substitui o `fetch` global por um que nunca responde — só rejeita quando o
 * signal aborta. Espelha o `fetch` real inclusive no caso do signal que já chega
 * abortado: aí a rejeição é imediata, sem esperar evento nenhum (é o que o
 * `createTimeoutFetch` assume ao abortar o controller antes de chamar o fetch).
 *
 * Só para teste. Quem chama restaura `globalThis.fetch` no `afterEach`.
 */
export function installHangingFetch() {
	const seen: { signal?: AbortSignal | null; calls: number } = { calls: 0 }
	globalThis.fetch = mock((_input: unknown, init?: RequestInit) => {
		seen.calls++
		seen.signal = init?.signal
		return new Promise<Response>((_resolve, reject) => {
			if (init?.signal?.aborted) {
				reject(init.signal.reason)
				return
			}
			init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
		})
	}) as unknown as typeof fetch
	return seen
}
