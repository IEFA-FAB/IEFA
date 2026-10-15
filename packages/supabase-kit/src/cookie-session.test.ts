import { describe, expect, it } from "bun:test"
import { createChunks, stringToBase64URL } from "@supabase/ssr"

import { readSessionAccessToken, resolveCookieSessionUser, sessionCookieName } from "./cookie-session.ts"

const URL_ = "https://abcdref.supabase.co"
const COOKIE = sessionCookieName(URL_)

/** Header `Cookie` como o `@supabase/ssr` grava: `base64-` + base64url do JSON, em chunks se passar do teto. */
function sessionCookieHeader(session: object, chunkSize?: number): string {
	const value = `base64-${stringToBase64URL(JSON.stringify(session))}`
	return createChunks(COOKIE, value, chunkSize)
		.map(({ name, value: v }) => `${name}=${v}`)
		.join("; ")
}

type Call = { url: string; authorization: string | null }

function fakeFetch(respond: (url: string) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
	const calls: Call[] = []
	const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		calls.push({ url, authorization: new Headers(init?.headers).get("authorization") })
		return respond(url)
	}) as typeof fetch
	return { fetch: impl, calls }
}

const json = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

// Access token VENCIDO de propósito: é o caso em que `getUser()` sem argumento renovaria a sessão.
const EXPIRED_SESSION = { access_token: "header.payload.sig", refresh_token: "rt-1", expires_at: 1, token_type: "bearer", user: { id: "u-1" } }

describe("sessionCookieName", () => {
	it("segue o padrão do supabase-js: sb-<primeiro rótulo do host>-auth-token", () => {
		expect(COOKIE).toBe("sb-abcdref-auth-token")
	})
})

describe("readSessionAccessToken", () => {
	it("junta os chunks e decodifica o base64url", async () => {
		const header = sessionCookieHeader({ ...EXPIRED_SESSION, padding: "x".repeat(400) }, 100)
		expect(header).toContain(`${COOKIE}.1=`)
		expect(await readSessionAccessToken(URL_, `outro=1; ${header}`)).toBe("header.payload.sig")
	})

	it("aceita o valor legado sem base64 (JSON com encodeURIComponent)", async () => {
		const header = `${COOKIE}=${encodeURIComponent(JSON.stringify(EXPIRED_SESSION))}`
		expect(await readSessionAccessToken(URL_, header)).toBe("header.payload.sig")
	})

	it("sem cookie, ou com chunks que não formam JSON, é sem sessão", async () => {
		expect(await readSessionAccessToken(URL_, undefined)).toBeNull()
		expect(await readSessionAccessToken(URL_, "a=1")).toBeNull()
		expect(await readSessionAccessToken(URL_, `${COOKIE}=base64-${stringToBase64URL("{meio")}`)).toBeNull()
		expect(await readSessionAccessToken(URL_, sessionCookieHeader({ refresh_token: "rt" }))).toBeNull()
	})
})

describe("resolveCookieSessionUser", () => {
	it("valida o token do cookie em /user e NUNCA chama o refresh", async () => {
		const { fetch, calls } = fakeFetch(() => json(200, { id: "u-1", aud: "authenticated" }))
		const result = await resolveCookieSessionUser({ url: URL_, publishableKey: "pk", cookieHeader: sessionCookieHeader(EXPIRED_SESSION), fetch })

		expect(result).toMatchObject({ ok: true, user: { id: "u-1" } })
		expect(calls).toHaveLength(1)
		expect(calls[0]?.url).toBe(`${URL_}/auth/v1/user`)
		expect(calls[0]?.authorization).toBe("Bearer header.payload.sig")
		expect(calls.some((c) => c.url.includes("/token"))).toBe(false)
	})

	it("sem cookie é 401 sem ir ao GoTrue", async () => {
		const { fetch, calls } = fakeFetch(() => json(200, {}))
		expect(await resolveCookieSessionUser({ url: URL_, publishableKey: "pk", cookieHeader: undefined, fetch })).toMatchObject({ ok: false, status: 401 })
		expect(calls).toHaveLength(0)
	})

	it("token recusado pelo GoTrue é 401", async () => {
		const { fetch } = fakeFetch(() => json(403, { code: "bad_jwt", msg: "token is expired" }))
		expect(await resolveCookieSessionUser({ url: URL_, publishableKey: "pk", cookieHeader: sessionCookieHeader(EXPIRED_SESSION), fetch })).toMatchObject({
			ok: false,
			status: 401,
		})
	})

	it("sessão encerrada (session_not_found) é 401", async () => {
		const { fetch } = fakeFetch(() => json(403, { code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" }))
		expect(await resolveCookieSessionUser({ url: URL_, publishableKey: "pk", cookieHeader: sessionCookieHeader(EXPIRED_SESSION), fetch })).toMatchObject({
			ok: false,
			status: 401,
		})
	})

	it("deadline estourado ou GoTrue fora é 503, não 401", async () => {
		const timeout = fakeFetch(() => Promise.reject(new Error("Supabase request timed out after 5000ms")))
		expect(
			await resolveCookieSessionUser({ url: URL_, publishableKey: "pk", cookieHeader: sessionCookieHeader(EXPIRED_SESSION), fetch: timeout.fetch })
		).toMatchObject({ ok: false, status: 503 })

		const badGateway = fakeFetch(() => new Response("<html>502</html>", { status: 502 }))
		expect(
			await resolveCookieSessionUser({ url: URL_, publishableKey: "pk", cookieHeader: sessionCookieHeader(EXPIRED_SESSION), fetch: badGateway.fetch })
		).toMatchObject({ ok: false, status: 503 })
	})
})
