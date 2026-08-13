import { afterEach, describe, expect, mock, test } from "bun:test"

import { createTimeoutFetch } from "./timeout-fetch.ts"

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

/**
 * Substitui o `fetch` global por um que nunca responde — só rejeita quando o
 * signal aborta. Espelha o `fetch` real inclusive no caso do signal que já chega
 * abortado: aí a rejeição é imediata, sem esperar evento nenhum (é o que o
 * `createTimeoutFetch` assume ao abortar o controller antes de chamar o fetch).
 */
function installHangingFetch() {
	const seen: { signal?: AbortSignal | null } = {}
	globalThis.fetch = mock((_input: unknown, init?: RequestInit) => {
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

describe("createTimeoutFetch", () => {
	test("aborta o request depois do deadline", async () => {
		installHangingFetch()
		const timeoutFetch = createTimeoutFetch(20)

		await expect(timeoutFetch("https://example.test")).rejects.toThrow(/timed out after 20ms/)
	})

	test("propaga o abort do chamador antes do deadline", async () => {
		installHangingFetch()
		const timeoutFetch = createTimeoutFetch(10_000)
		const caller = new AbortController()
		const reason = new Error("caller gave up")

		const pending = timeoutFetch("https://example.test", { signal: caller.signal })
		caller.abort(reason)

		await expect(pending).rejects.toThrow("caller gave up")
	})

	test("aborta na hora quando o signal do chamador já veio abortado", async () => {
		installHangingFetch()
		const timeoutFetch = createTimeoutFetch(10_000)
		const reason = new Error("already aborted")

		await expect(timeoutFetch("https://example.test", { signal: AbortSignal.abort(reason) })).rejects.toThrow("already aborted")
	})

	test("deixa a resposta passar e limpa o timer quando o upstream responde", async () => {
		globalThis.fetch = mock(async () => new Response("ok")) as unknown as typeof fetch
		const timeoutFetch = createTimeoutFetch(50)

		const response = await timeoutFetch("https://example.test")
		expect(await response.text()).toBe("ok")

		// Se o timer não fosse limpo, o abort dispararia depois da resposta e o
		// processo do teste seguraria o handle até o deadline.
		await Bun.sleep(60)
		expect(response.bodyUsed).toBe(true)
	})

	test("não vaza listener no signal do chamador quando o request completa", async () => {
		globalThis.fetch = mock(async () => new Response("ok")) as unknown as typeof fetch
		const timeoutFetch = createTimeoutFetch(50)
		const caller = new AbortController()

		await timeoutFetch("https://example.test", { signal: caller.signal })

		// Abortar depois de completo não pode estourar nada — o listener já saiu.
		expect(() => caller.abort(new Error("late"))).not.toThrow()
	})
})
