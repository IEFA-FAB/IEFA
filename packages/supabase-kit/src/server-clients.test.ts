import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

import { installHangingFetch } from "./testing/hanging-fetch.ts"

// `start.ts` importa o runtime do TanStack Start, que não existe fora de um request. Sem
// request, o `getAll` do cookie devolve lista vazia: client sem sessão.
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
const DEADLINE_MS = 30
/** Esperas do backoff do postgrest-js (`getRetryDelay`): 1, 2 e 4 s. */
const POSTGREST_BACKOFF_MS = new Set([1_000, 2_000, 4_000])

/**
 * Zera só as esperas do backoff do postgrest-js e devolve as que foram pedidas. O deadline do
 * teste fica fora do conjunto, então continua valendo de verdade.
 */
function skipPostgrestBackoff(): number[] {
	const requested: number[] = []
	globalThis.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) => {
		if (ms !== undefined && POSTGREST_BACKOFF_MS.has(ms)) {
			requested.push(ms)
			return realSetTimeout(handler, 0, ...args)
		}
		return realSetTimeout(handler, ms, ...args)
	}) as typeof setTimeout
	return requested
}

type AnyClient = {
	auth: { initialize: () => Promise<unknown> }
	from: (relation: string) => { select: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> }
}

/** Campos privados do GoTrueClient que o teste precisa enxergar. */
type GoTrueInternals = { autoRefreshTicker: unknown; autoRefreshToken: boolean }

function internals(client: AnyClient): GoTrueInternals {
	return client.auth as unknown as GoTrueInternals
}

const realSetInterval = globalThis.setInterval
const realSetTimeout = globalThis.setTimeout
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
	globalThis.setTimeout = realSetTimeout
	globalThis.fetch = realFetch
})

const factories: Record<string, (fetch?: typeof globalThis.fetch) => AnyClient> = {
	createServiceRoleClient: (fetch) => createServiceRoleClient({ url: URL, secretKey: KEY, schema: "sisub", fetch }) as unknown as AnyClient,
	createStatelessAuthClient: (fetch) => createStatelessAuthClient({ url: URL, publishableKey: KEY, fetch }) as unknown as AnyClient,
	createCookieAuthClient: (fetch) => createCookieAuthClient({ url: URL, key: KEY, cookieHeader: undefined, schema: "sisub", fetch }) as unknown as AnyClient,
	createSsrAuthClient: (fetch) => createSsrAuthClient({ url: URL, key: KEY, schema: "sisub", fetch }) as unknown as AnyClient,
}

describe("clients de servidor não armam o auto-refresh do GoTrue", () => {
	// Com o default do supabase-js, cada client armava um `setInterval` de 30 s ao terminar o
	// `initialize()` e ninguém o desarmava: o timer segurava o client, um por request.
	//
	// O `initialize()` é chamado à mão porque os clients do `@supabase/ssr` nascem com
	// `skipAutoInitialize: true`: sem ele a asserção passaria qualquer que fosse a opção. O
	// `_handleVisibilityChange` que arma o timer roda dentro do `initialize()`, chamado pelo
	// construtor (supabase-js) ou na primeira leitura de sessão que o pedir.
	for (const [name, create] of Object.entries(factories)) {
		test(`${name}: ${N} clients inicializados, nenhum timer de auto-refresh`, async () => {
			const clients = Array.from({ length: N }, () => create())
			await Promise.all(clients.map((client) => client.auth.initialize()))
			await Bun.sleep(10)

			expect(refreshIntervals).toBe(0)
			for (const client of clients) {
				expect(internals(client).autoRefreshToken).toBe(false)
				expect(internals(client).autoRefreshTicker).toBeNull()
			}
		})
	}
})

describe("o deadline do fetch vale para a leitura inteira, e a falha rápida ainda é repetida", () => {
	for (const [name, create] of Object.entries(factories)) {
		// O postgrest-js repetia o próprio deadline (motivo `Error` comum) até 3 vezes, com
		// 1 + 2 + 4 s de espera: com o deadline de 10 s, uma leitura chegava a ~47 s.
		test(`${name}: upstream travado custa uma tentativa e um deadline`, async () => {
			const seen = installHangingFetch()
			const client = create(createTimeoutFetch(DEADLINE_MS))

			const startedAt = performance.now()
			const { error } = await client.from("units").select("*")
			const elapsed = performance.now() - startedAt

			expect(error?.message).toBe(`AbortError: Supabase request timed out after ${DEADLINE_MS}ms`)
			expect(seen.calls).toBe(1)
			// Com o retry, a primeira espera sozinha já seria 1 s.
			expect(elapsed).toBeLessThan(900)
		})

		// O retry fica ligado de propósito: socket keep-alive fechado pelo upstream e o 503 do
		// cache de schema (logo depois de migration) se resolvem na tentativa seguinte.
		test(`${name}: ECONNRESET rápido é repetido`, async () => {
			let calls = 0
			globalThis.fetch = mock(async () => {
				calls++
				if (calls === 1) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })
				return Response.json([{ id: 1 }])
			}) as unknown as typeof fetch

			const backoff = skipPostgrestBackoff()

			const { data, error } = await create(createTimeoutFetch(5_000)).from("units").select("*")

			expect(error).toBeNull()
			expect(data).toEqual([{ id: 1 }])
			expect(calls).toBe(2)
			expect(backoff).toEqual([1_000])
		})

		test(`${name}: 503 do cache de schema é repetido`, async () => {
			let calls = 0
			globalThis.fetch = mock(async () => {
				calls++
				if (calls === 1) return new Response("{}", { status: 503, headers: { "Retry-After": "0" } })
				return Response.json([{ id: 1 }])
			}) as unknown as typeof fetch

			const { data, error } = await create(createTimeoutFetch(1_000)).from("units").select("*")

			expect(error).toBeNull()
			expect(data).toEqual([{ id: 1 }])
			expect(calls).toBe(2)
		})
	}
})
