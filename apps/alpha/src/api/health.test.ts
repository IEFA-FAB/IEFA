import { describe, expect, it } from "bun:test"
import { Hono } from "hono"
import { ALLOWED_ORIGINS } from "./cors.ts"
import { createHealthRoutes } from "./health.ts"

const ORIGIN = "https://portal.iefa.com.br"

function appWith(database: "ok" | "error") {
	return createHealthRoutes(async () => database)
}

describe("GET /health", () => {
	it("responde ao browser com o cabeçalho de origem", async () => {
		// Regressão: o CORS ficava preso a `/api/v1/*` e esta rota vinha sem
		// `Access-Control-Allow-Origin`. O ChatRADA lia a rejeição do `fetch` como
		// serviço fora e desabilitava o envio com o α no ar.
		const res = await appWith("ok").request("/health", { headers: { Origin: ORIGIN } })

		expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN)
	})

	it("leva o CORS junto ao ser montada, que é como o `index.ts` a usa", async () => {
		// `app.route("/", createHealthRoutes(...))`: middleware de sub-app se perde em
		// algumas composições, e o defeito só apareceria em produção.
		const mounted = new Hono().route("/", appWith("ok"))

		const res = await mounted.request("/health", { headers: { Origin: ORIGIN } })

		expect(res.status).toBe(200)
		expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN)
	})

	it("mantém a origem do portal na allow-list", () => {
		expect(ALLOWED_ORIGINS).toContain(ORIGIN)
	})

	it("não toca no banco sem `deep` — é o caminho que o ALB consome", async () => {
		let probed = false
		const app = createHealthRoutes(async () => {
			probed = true
			return "ok"
		})

		const res = await app.request("/health")

		expect(res.status).toBe(200)
		expect(await res.json()).toMatchObject({ status: "ok", service: "alpha" })
		expect(probed).toBe(false)
	})

	it("com `deep=1` e banco no ar, declara a checagem que fez", async () => {
		const res = await appWith("ok").request("/health?deep=1")

		expect(res.status).toBe(200)
		expect(await res.json()).toMatchObject({ status: "ok", checks: { database: "ok" } })
	})

	it("com `deep=1` e banco fora, responde 503 e diz por quê", async () => {
		// O ponto do nível profundo: sem banco não há sessão para gravar nem trecho
		// para recuperar, então "ok" seria uma promessa que o α não cumpre.
		const res = await appWith("error").request("/health?deep=1")

		expect(res.status).toBe(503)
		expect(await res.json()).toMatchObject({ status: "degraded", reason: "database_unreachable", checks: { database: "error" } })
	})

	it("reaproveita a sonda dentro da janela — a rota é pública", async () => {
		// `authMiddleware` só cobre `/api/v1/*`: sem a janela, qualquer um dispara uma
		// consulta no Supabase compartilhado por requisição.
		let probes = 0
		const app = createHealthRoutes(async () => {
			probes += 1
			return "ok"
		})

		await app.request("/health?deep=1")
		await app.request("/health?deep=1")
		await app.request("/health?deep=1")

		expect(probes).toBe(1)
	})

	it("ignora `deep` com qualquer outro valor", async () => {
		const res = await appWith("error").request("/health?deep=true")

		expect(res.status).toBe(200)
	})
})
