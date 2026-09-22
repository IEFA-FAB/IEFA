import { describe, expect, test } from "bun:test"
import { Glob } from "bun"
import { Hono } from "hono"
import { browserCors } from "./cors.ts"

const app = new Hono().use("*", browserCors).all("/api/v1/x", (c) => c.text("ok"))

function preflight(method: string) {
	return app.request("/api/v1/x", {
		method: "OPTIONS",
		headers: { Origin: "https://contrate.iefa.com.br", "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "authorization" },
	})
}

describe("browserCors", () => {
	test("todo método que uma rota do α registra passa no preflight", async () => {
		// A regressão: o chat do contrate registrou `.delete(...)` e o CORS só liberava
		// GET/POST/PATCH — apagar conversa morria no preflight, sem erro no servidor.
		const methods = new Set<string>()
		for await (const file of new Glob("api/**/*.ts").scan({ cwd: new URL("../", import.meta.url).pathname, absolute: true })) {
			if (file.endsWith(".test.ts")) continue
			for (const match of (await Bun.file(file).text()).matchAll(/\.(get|post|patch|put|delete)\(\s*"\/api\/v1\//g)) methods.add(match[1].toUpperCase())
		}
		expect(methods.has("DELETE")).toBe(true)

		for (const method of methods) {
			const allowed = (await preflight(method)).headers.get("access-control-allow-methods") ?? ""
			expect(allowed.split(",").map((value) => value.trim())).toContain(method)
		}
	})
})
