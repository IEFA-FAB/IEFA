import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { cors } from "hono/cors"
import { api } from "./api/routes.js"

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

// Healthcheck
app.get("/health", (c) => c.text("ok"))

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

const port = Number(process.env.API_PORT ?? 3000)

export default {
	port,
	fetch: app.fetch,
}

console.log(`🚀 Server running on http://localhost:${port}`)
console.log(`📚 API Docs on http://localhost:${port}/`)
console.log(`📄 OpenAPI Spec on http://localhost:${port}/doc`)
