import { describe, expect, it } from "bun:test"
import { Hono } from "hono"
import { ALLOWED_ORIGINS } from "./cors.ts"
import { createHealthRoutes } from "./health.ts"

const ORIGIN = "https://portal.iefa.com.br"

function app() {
	return createHealthRoutes()
}

describe("GET /health", () => {
	it("responde ao browser com o cabeçalho de origem", async () => {
		// Regressão: o CORS ficava preso a `/api/v1/*` e esta rota vinha sem
		// `Access-Control-Allow-Origin`. O ChatRADA lia a rejeição do `fetch` como
		// serviço fora e desabilitava o envio com o α no ar.
		const res = await app().request("/health", { headers: { Origin: ORIGIN } })

		expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN)
	})

	it("leva o CORS junto ao ser montada, que é como o `index.ts` a usa", async () => {
		// `app.route("/", createHealthRoutes(...))`: middleware de sub-app se perde em
		// algumas composições, e o defeito só apareceria em produção.
		const mounted = new Hono().route("/", app())

		const res = await mounted.request("/health", { headers: { Origin: ORIGIN } })

		expect(res.status).toBe(200)
		expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN)
	})

	it("mantém a origem do portal na allow-list", () => {
		expect(ALLOWED_ORIGINS).toContain(ORIGIN)
	})

	it("aceita o contrate, onde moram a Plataforma ACI e o console", async () => {
		// Origem fora da lista cai em `ALLOWED_ORIGINS[0]`: o browser bloquearia em
		// silêncio, com "Failed to fetch" e nenhum erro no α.
		const contrate = "https://contrate.iefa.com.br"
		const res = await app().request("/health", { headers: { Origin: contrate } })

		expect(res.headers.get("access-control-allow-origin")).toBe(contrate)
	})

	it("responde o estado do processo, que é o que o ALB consome", async () => {
		const res = await app().request("/health")

		expect(res.status).toBe(200)
		expect(await res.json()).toMatchObject({ status: "ok", service: "alpha" })
	})
})
