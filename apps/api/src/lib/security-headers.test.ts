import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { apiSecureHeaders } from "./security-headers.ts"

describe("apiSecureHeaders", () => {
	const app = new Hono()
		.use("*", apiSecureHeaders)
		.use("/api/*", cors({ origin: "*" }))
		.get("/api/x", (c) => c.json({ ok: true }))
		.get("/", (c) => c.html("<html></html>"))

	test("HSTS, nosniff, frame-options e referrer em toda resposta, sem tirar o CORS", async () => {
		const res = await app.request("/api/x", { headers: { origin: "https://outro.example" } })
		expect(res.headers.get("strict-transport-security")).toContain("max-age=")
		expect(res.headers.get("x-content-type-options")).toBe("nosniff")
		expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN")
		expect(res.headers.get("referrer-policy")).toBe("no-referrer")
		expect(res.headers.get("access-control-allow-origin")).toBe("*")
		expect(res.headers.get("cross-origin-resource-policy")).toBeNull()
	})

	test("a página de documentação não ganha CSP (o Scalar carrega da CDN)", async () => {
		const res = await app.request("/")
		expect(res.headers.get("content-security-policy")).toBeNull()
		expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN")
	})

	test("preflight também leva os cabeçalhos", async () => {
		const res = await app.request("/api/x", { method: "OPTIONS", headers: { origin: "https://outro.example", "access-control-request-method": "GET" } })
		expect(res.status).toBe(204)
		expect(res.headers.get("x-content-type-options")).toBe("nosniff")
	})
})
