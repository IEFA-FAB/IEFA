import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { adminAttemptGuard, clientIpFromForwardedFor, FailedAttemptLimiter, isAdminSecretPath } from "./admin-attempt-limit.ts"

const RESTRICTED = ["/user-data", "/opinion"] as const

describe("clientIpFromForwardedFor", () => {
	test("lê o valor da DIREITA — o que o ALB acrescentou", () => {
		expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.9")).toBe("203.0.113.9")
		expect(clientIpFromForwardedFor(" 203.0.113.9 ")).toBe("203.0.113.9")
		expect(clientIpFromForwardedFor("")).toBeNull()
		expect(clientIpFromForwardedFor(null)).toBeNull()
	})
})

describe("isAdminSecretPath", () => {
	test("admin e dado pessoal sim; catálogo público não", () => {
		expect(isAdminSecretPath("/api/admin/compras/sync", RESTRICTED)).toBe(true)
		expect(isAdminSecretPath("/api/user-data", RESTRICTED)).toBe(true)
		expect(isAdminSecretPath("/api/units", RESTRICTED)).toBe(false)
		expect(isAdminSecretPath("/api/administrativo", RESTRICTED)).toBe(false)
	})
})

describe("FailedAttemptLimiter", () => {
	test("barra depois do teto e libera quando a janela vence", () => {
		let now = 0
		const limiter = new FailedAttemptLimiter(3, 1_000, () => now)
		for (let i = 0; i < 3; i++) limiter.recordFailure("a")

		expect(limiter.assess("a")).toEqual({ allowed: false, retryAfterSeconds: 1 })
		expect(limiter.assess("b")).toEqual({ allowed: true })

		now = 1_000
		expect(limiter.assess("a")).toEqual({ allowed: true })
	})

	test("não cresce além do teto de origens", () => {
		const limiter = new FailedAttemptLimiter(1, 60_000, () => 0, 2)
		limiter.recordFailure("a")
		limiter.recordFailure("b")
		limiter.recordFailure("c")

		// "a", o mais antigo, saiu para caber "c".
		expect(limiter.assess("a")).toEqual({ allowed: true })
		expect(limiter.assess("c").allowed).toBe(false)
	})
})

describe("adminAttemptGuard", () => {
	function app(limiter: FailedAttemptLimiter) {
		return new Hono()
			.use(
				"*",
				adminAttemptGuard({ limiter, restrictedPaths: RESTRICTED, clientIp: (c) => clientIpFromForwardedFor(c.req.header("x-forwarded-for")) ?? "unknown" })
			)
			.get("/api/user-data", (c) => (c.req.header("x-admin-secret") === "certo" ? c.json([]) : c.json({ error: "Unauthorized" }, 401)))
			.get("/api/units", (c) => c.json([]))
	}

	test("erros seguidos do mesmo IP viram 429 — inclusive com o segredo certo", async () => {
		const guarded = app(new FailedAttemptLimiter(2, 60_000))
		const as = (secret: string, xff = "1.1.1.1, 203.0.113.9") =>
			guarded.request("/api/user-data", { headers: { "x-admin-secret": secret, "x-forwarded-for": xff } })

		expect((await as("errado")).status).toBe(401)
		expect((await as("errado")).status).toBe(401)
		const blocked = await as("certo")
		expect(blocked.status).toBe(429)
		expect(blocked.headers.get("retry-after")).toBe("60")

		// Trocar o valor forjável da esquerda não troca de balde.
		expect((await as("certo", "9.9.9.9, 203.0.113.9")).status).toBe(429)
		// Outro IP (visto pelo ALB) segue livre.
		expect((await as("certo", "203.0.113.10")).status).toBe(200)
	})

	test("rota pública não conta nem é barrada", async () => {
		const limiter = new FailedAttemptLimiter(1, 60_000)
		limiter.recordFailure("203.0.113.9")
		const res = await app(limiter).request("/api/units", { headers: { "x-forwarded-for": "203.0.113.9" } })
		expect(res.status).toBe(200)
	})
})
