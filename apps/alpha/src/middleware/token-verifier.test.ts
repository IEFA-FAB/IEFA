import { describe, expect, it } from "bun:test"
import type { User } from "@supabase/supabase-js"
import { createTokenVerifier, isPlausibleAccessToken, TOKEN_CACHE_TTL_MS } from "./token-verifier.ts"

const NOW = 1_800_000_000_000

/** JWT com assinatura qualquer: o filtro local não a confere (quem confere é o GoTrue). */
function token(claims: Record<string, unknown>): string {
	const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
	return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.assinatura`
}

const VALID = token({ sub: "user-1", exp: NOW / 1000 + 3600 })

function goTrue(users: Record<string, Partial<User> | null>) {
	const calls: string[] = []
	const getUser = async (jwt: string) => {
		calls.push(jwt)
		const user = users[jwt]
		return user ? { data: { user: user as User }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } }
	}
	return { getUser, calls }
}

describe("isPlausibleAccessToken", () => {
	it("recusa sem rede o que não é JWT, o que não tem sub e o vencido", () => {
		expect(isPlausibleAccessToken("lixo", NOW)).toBe(false)
		expect(isPlausibleAccessToken(token({ exp: NOW / 1000 + 60 }), NOW)).toBe(false)
		expect(isPlausibleAccessToken(token({ sub: "u", exp: NOW / 1000 - 1 }), NOW)).toBe(false)
		expect(isPlausibleAccessToken(VALID, NOW)).toBe(true)
	})
})

describe("createTokenVerifier", () => {
	it("token vencido ou malformado não chega ao GoTrue", async () => {
		const { getUser, calls } = goTrue({})
		const verifier = createTokenVerifier(getUser, { now: () => NOW })
		expect(await verifier.verify("lixo")).toEqual({ ok: false, reason: "INVALID_TOKEN" })
		expect(await verifier.verify(token({ sub: "u", exp: NOW / 1000 - 1 }))).toEqual({ ok: false, reason: "INVALID_TOKEN" })
		expect(calls).toEqual([])
	})

	it("valida no GoTrue uma vez e reusa por até TOKEN_CACHE_TTL_MS; depois, confere de novo (revogação)", async () => {
		let now = NOW
		const { getUser, calls } = goTrue({ [VALID]: { id: "user-1" } })
		const verifier = createTokenVerifier(getUser, { now: () => now })

		const [first, second] = await Promise.all([verifier.verify(VALID), verifier.verify(VALID)])
		expect(first).toMatchObject({ ok: true, user: { id: "user-1" } })
		expect(second).toMatchObject({ ok: true })
		expect(calls).toHaveLength(1)

		now += TOKEN_CACHE_TTL_MS + 1
		await verifier.verify(VALID)
		expect(calls).toHaveLength(2)
	})

	it("o cache nunca passa do exp do token", async () => {
		let now = NOW
		const shortLived = token({ sub: "user-1", exp: NOW / 1000 + 5 })
		const { getUser, calls } = goTrue({ [shortLived]: { id: "user-1" } })
		const verifier = createTokenVerifier(getUser, { now: () => now })
		await verifier.verify(shortLived)
		now += 6_000
		expect(await verifier.verify(shortLived)).toEqual({ ok: false, reason: "INVALID_TOKEN" })
		expect(calls).toHaveLength(1)
	})

	it("recusa não fica em cache: o GoTrue instável não recusa o token pelo minuto seguinte", async () => {
		const users: Record<string, Partial<User> | null> = {}
		const { getUser, calls } = goTrue(users)
		const verifier = createTokenVerifier(getUser, { now: () => NOW })
		expect(await verifier.verify(VALID)).toEqual({ ok: false, reason: "INVALID_TOKEN" })

		users[VALID] = { id: "user-1" }
		expect(await verifier.verify(VALID)).toMatchObject({ ok: true })
		expect(calls).toHaveLength(2)
	})

	it("falha de rede do GoTrue vira recusa, sem exceção para quem espera", async () => {
		const verifier = createTokenVerifier(
			async () => {
				throw new Error("ECONNRESET")
			},
			{ now: () => NOW }
		)
		expect(await verifier.verify(VALID)).toEqual({ ok: false, reason: "INVALID_TOKEN" })
		expect(verifier.size()).toBe(0)
	})

	it("usuário anônimo do Supabase é recusado", async () => {
		const { getUser } = goTrue({ [VALID]: { id: "anon", is_anonymous: true } })
		const verifier = createTokenVerifier(getUser, { now: () => NOW })
		expect(await verifier.verify(VALID)).toEqual({ ok: false, reason: "ANONYMOUS_USER" })
	})

	it("o cache tem teto de entradas", async () => {
		const tokens = [1, 2, 3].map((n) => token({ sub: `user-${n}`, exp: NOW / 1000 + 3600 }))
		const { getUser } = goTrue(Object.fromEntries(tokens.map((jwt, n) => [jwt, { id: `user-${n}` }])))
		const verifier = createTokenVerifier(getUser, { now: () => NOW, maxEntries: 2 })
		for (const jwt of tokens) await verifier.verify(jwt)
		expect(verifier.size()).toBe(2)
	})
})
