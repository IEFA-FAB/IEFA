import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

// `start.ts` importa o runtime do TanStack Start, que não existe fora de um request. Os testes
// só constroem o client; nenhum chama `getAll`/`setAll`.
mock.module("@tanstack/react-start/server", () => ({ getRequest: () => undefined, setCookie: () => {} }))

const { createCookieAuthClient } = await import("./cookie-auth-client.ts")
const { createServiceRoleClient } = await import("./service-client.ts")
const { createSsrAuthClient } = await import("./start.ts")
const { createStatelessAuthClient } = await import("./stateless-auth-client.ts")
const { createTimeoutFetch } = await import("./timeout-fetch.ts")

const URL = "https://abcdefghijklmnopqrst.supabase.co"
const KEY = "sb_secret_test"
/** `AUTO_REFRESH_TICK_DURATION_MS` do auth-js: o período do timer de auto-refresh. */
const AUTO_REFRESH_TICK_MS = 30_000
const N = 25

type AnyClient = { auth: unknown; from: (relation: string) => { select: (columns: string) => PromiseLike<{ error: unknown }> } }

/** Campos privados do GoTrueClient que o teste precisa enxergar. */
type GoTrueInternals = { initializePromise: Promise<unknown> | null; autoRefreshTicker: unknown; autoRefreshToken: boolean }

function internals(client: { auth: unknown }): GoTrueInternals {
	return client.auth as GoTrueInternals
}

const realSetInterval = globalThis.setInterval
const realFetch = globalThis.fetch
let refreshIntervals = 0

beforeEach(() => {
	refreshIntervals = 0
	globalThis.setInterval = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
		if (ms === AUTO_REFRESH_TICK_MS) refreshIntervals++
		return realSetInterval(handler, ms, ...args)
	}) as typeof setInterval
})

afterEach(() => {
	globalThis.setInterval = realSetInterval
	globalThis.fetch = realFetch
})

const factories: Record<string, () => AnyClient> = {
	createServiceRoleClient: () => createServiceRoleClient({ url: URL, secretKey: KEY, schema: "sisub" }) as unknown as AnyClient,
	createStatelessAuthClient: () => createStatelessAuthClient({ url: URL, publishableKey: KEY }) as unknown as AnyClient,
	createCookieAuthClient: () => createCookieAuthClient({ url: URL, key: KEY, cookieHeader: undefined, schema: "sisub" }) as unknown as AnyClient,
	createSsrAuthClient: () => createSsrAuthClient({ url: URL, key: KEY, schema: "sisub" }) as unknown as AnyClient,
}

describe("clients de servidor não armam o auto-refresh do GoTrue", () => {
	// Com o default do supabase-js, cada client armava um `setInterval` de 30 s ao terminar o
	// `initialize()` e ninguém o desarmava: o timer segurava o client, um por request.
	for (const [name, create] of Object.entries(factories)) {
		test(`${name}: ${N} clients, nenhum timer de auto-refresh`, async () => {
			const clients = Array.from({ length: N }, create)
			await Promise.all(clients.map((client) => internals(client).initializePromise))
			await Bun.sleep(10)

			expect(refreshIntervals).toBe(0)
			for (const client of clients) {
				expect(internals(client).autoRefreshToken).toBe(false)
				expect(internals(client).autoRefreshTicker).toBeNull()
			}
		})
	}
})

describe("o deadline do fetch vale para a leitura inteira", () => {
	// O postgrest-js repetia GET em erro de rede (o abort do deadline incluído) até 3 vezes,
	// com 1 + 2 + 4 s de espera: com o deadline de 10 s, uma leitura chegava a ~47 s.
	test("createServiceRoleClient: upstream travado custa uma tentativa e um deadline", async () => {
		let attempts = 0
		globalThis.fetch = mock((_input: unknown, init?: RequestInit) => {
			attempts++
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
			})
		}) as unknown as typeof fetch
		const client = createServiceRoleClient({ url: URL, secretKey: KEY, schema: "sisub", fetch: createTimeoutFetch(30) })

		const startedAt = performance.now()
		const { error } = await client.from("units" as never).select("*")
		const elapsed = performance.now() - startedAt

		expect(error?.message).toMatch(/timed out after 30ms/)
		expect(attempts).toBe(1)
		// Com o retry, a primeira espera sozinha já seria 1 s.
		expect(elapsed).toBeLessThan(900)
	})

	for (const [name, create] of Object.entries(factories)) {
		test(`${name}: erro de rede e 503 não são repetidos`, async () => {
			let attempts = 0
			globalThis.fetch = mock(async () => {
				attempts++
				throw new TypeError("fetch failed")
			}) as unknown as typeof fetch
			const networkError = await create().from("units").select("*")
			expect(networkError.error).not.toBeNull()
			expect(attempts).toBe(1)

			attempts = 0
			globalThis.fetch = mock(async () => {
				attempts++
				return new Response("{}", { status: 503, headers: { "Retry-After": "0" } })
			}) as unknown as typeof fetch
			const unavailable = await create().from("units").select("*")
			expect(unavailable.error).not.toBeNull()
			expect(attempts).toBe(1)
		})
	}
})
