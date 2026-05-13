import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { cors } from "hono/cors"
import { comprasAdminRoutes } from "./api/routes/compras-admin.ts"
import { priceResearchRoutes } from "./api/routes/price-research.ts"
import { api } from "./api/routes.js"
import { env } from "./env.ts"
import { startComprasSyncWorker } from "./workers/compras-sync/index.ts"

const app = new OpenAPIHono()

// CORS para rotas públicas da API
app.use(
	"/api/*",
	cors({
		origin: "*",
		allowMethods: ["GET", "OPTIONS"],
		allowHeaders: ["Content-Type"],
		maxAge: 300,
	})
)

// CORS para rotas admin (permite POST + header de autenticação)
app.use(
	"/api/admin/*",
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "OPTIONS"],
		allowHeaders: ["Content-Type", "x-admin-secret"],
		maxAge: 300,
	})
)

// Healthcheck — retorna 503 se a memória RSS ultrapassar 90% do limite do container
const API_MEMORY_LIMIT_BYTES = 460 * 1024 * 1024 // 460MB — 90% de 512MB

type HealthResponse =
	| { status: "ok"; service: string; rss_mb: number }
	| { status: "unhealthy"; service: string; reason: string; rss_mb: number; limit_mb: number }

// Typed chain — all route sub-apps chained for RPC type inference
// At runtime app === typedApp (same object). TypeScript sees merged schema.
const typedApp = app
	.route("/api", api)
	.route("/api/admin/compras", comprasAdminRoutes)
	.route("/api/admin/price-research", priceResearchRoutes)
	.get("/health", (c) => {
		const mem = process.memoryUsage()
		const rss = mem.rss

		if (rss > API_MEMORY_LIMIT_BYTES) {
			return c.json<HealthResponse>(
				{
					status: "unhealthy",
					service: "sisub-api",
					reason: "memory_pressure",
					rss_mb: Math.round(rss / 1024 / 1024),
					limit_mb: 460,
				},
				503
			)
		}

		return c.json<HealthResponse>({
			status: "ok",
			service: "sisub-api",
			rss_mb: Math.round(rss / 1024 / 1024),
		})
	})

// Non-typed additions (docs, UI — don't affect RPC types)

// Documentação OpenAPI
app.doc("/doc", {
	openapi: "3.0.0",
	info: {
		version: "1.0.0",
		title: "Sisub API",
		description: "API para consulta de dados do sistema de subsistência",
	},
	servers: [
		{
			url: "https://iefa-api.fly.dev",
			description: "Produção",
		},
		{
			url: "http://localhost:3000",
			description: "Local",
		},
	],
	components: {
		securitySchemes: {
			AdminSecret: {
				type: "apiKey",
				in: "header",
				name: "x-admin-secret",
				description: "Secret obrigatório para endpoints /api/admin/*. Configurado via env ADMIN_SECRET em iefa-api.fly.dev.",
			},
		},
	},
})

// Interface Scalar para documentação interativa (recomendado: tema 'purple' ou 'moon')
/* app.get(
  "/",
  Scalar({
    url: "/doc",
    pageTitle: "Sisub API - Documentação",
    theme: "kepler",
  })
); */

// Alternativa com configuração dinâmica (útil para diferentes ambientes)

app.get("/favicon.svg", (c) => {
	const file = Bun.file(new URL("../public/favicon.svg", import.meta.url))
	return new Response(file, { headers: { "Content-Type": "image/svg+xml" } })
})

app.get(
	"/",
	Scalar(() => ({
		url: "/doc",
		pageTitle: "Sisub API - Documentação",
		theme: "kepler",
		favicon: "/favicon.svg",
		// Proxy para desenvolvimento (se necessário)
		// proxyUrl: c.env.ENVIRONMENT === "development" ? "https://proxy.scalar.com" : undefined,
	})) as any // Cast necessário devido a conflito de versões do Hono no @scalar/hono-api-reference
)

const port = env.API_PORT

export type AppType = typeof typedApp

export default {
	port,
	fetch: app.fetch,
}

// Worker de sincronização — agendado via Bun.cron
// startComprasSyncWorker é async: faz recovery de syncs presas antes de agendar
startComprasSyncWorker().catch((err) => {
	console.error("[compras-sync] Falha no startup do worker:", err)
})

console.log(`🚀 Server running on http://localhost:${port}`)
console.log(`📚 API Docs on http://localhost:${port}/`)
console.log(`📄 OpenAPI Spec on http://localhost:${port}/doc`)
