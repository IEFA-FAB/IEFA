import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { cors } from "hono/cors"
import { api } from "./api/routes.js"
import { env } from "./env.ts"

const app = new OpenAPIHono()

// CORS deve ser chamado antes das rotas
app.use(
	"/api/*",
	cors({
		origin: "*",
		allowMethods: ["GET", "OPTIONS"],
		allowHeaders: ["Content-Type"],
		maxAge: 300,
	})
)

// Coloque a API sob /api
app.route("/api", api)

// Healthcheck — retorna 503 se a memória RSS ultrapassar 90% do limite do container
const API_MEMORY_LIMIT_BYTES = 460 * 1024 * 1024 // 460MB — 90% de 512MB

app.get("/health", (c) => {
	const mem = process.memoryUsage()
	const rss = mem.rss

	if (rss > API_MEMORY_LIMIT_BYTES) {
		return c.json(
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

	return c.json({
		status: "ok",
		service: "sisub-api",
		rss_mb: Math.round(rss / 1024 / 1024),
	})
})

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
			url: "http://localhost:3000",
			description: "Servidor local",
		},
	],
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

app.get(
	"/",
	Scalar(() => ({
		url: "/doc",
		pageTitle: "Sisub API - Documentação",
		theme: "kepler",
		// Proxy para desenvolvimento (se necessário)
		// proxyUrl: c.env.ENVIRONMENT === "development" ? "https://proxy.scalar.com" : undefined,
	})) as any // Cast necessário devido a conflito de versões do Hono no @scalar/hono-api-reference
)

const port = env.API_PORT

export default {
	port,
	fetch: app.fetch,
}

console.log(`🚀 Server running on http://localhost:${port}`)
console.log(`📚 API Docs on http://localhost:${port}/`)
console.log(`📄 OpenAPI Spec on http://localhost:${port}/doc`)
