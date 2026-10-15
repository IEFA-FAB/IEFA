import { afterEach, describe, expect, mock, test } from "bun:test"

import { installHangingFetch } from "./testing/hanging-fetch.ts"
import { createTimeoutFetch } from "./timeout-fetch.ts"

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

describe("createTimeoutFetch", () => {
	test("aborta o request depois do deadline", async () => {
		installHangingFetch()
		const timeoutFetch = createTimeoutFetch(20)

		await expect(timeoutFetch("https://example.test")).rejects.toThrow(/timed out after 20ms/)
	})

	// O postgrest-js não repete rejeição com nome `AbortError`/`code` `ABORT_ERR`; com um `Error`
	// comum o deadline era repetido como falha de rede (4 tentativas, ~47 s com 10 s).
	test("o motivo do deadline é um AbortError, que o postgrest-js não repete", async () => {
		installHangingFetch()
		const timeoutFetch = createTimeoutFetch(20)

		const reason = await timeoutFetch("https://example.test").catch((error: unknown) => error)
		expect(reason).toBeInstanceOf(DOMException)
		expect((reason as DOMException).name).toBe("AbortError")
		expect((reason as DOMException).code).toBe(DOMException.ABORT_ERR)
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
