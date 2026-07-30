import { renderApiCatalog } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { PUBLIC_API, siteUrl } from "@/lib/agent-discovery"

/**
 * Catálogo de APIs (RFC 9727). Lista só a API de leitura pública — os endpoints
 * administrativos exigem `x-admin-secret` e ficam de fora de propósito.
 */
export const Route = createFileRoute("/.well-known/api-catalog")({
	server: {
		handlers: {
			GET: () => {
				const body = renderApiCatalog([
					{
						anchor: PUBLIC_API.base,
						serviceDesc: [{ href: PUBLIC_API.openapi, type: "application/json", title: "Sisub API — OpenAPI 3.0" }],
						serviceDoc: [{ href: PUBLIC_API.docs, type: "text/html", title: "Sisub API — referência" }],
						status: [{ href: PUBLIC_API.health, type: "application/json", title: "Health check" }],
						describedby: [{ href: `${siteUrl()}/llms.txt`, type: "text/plain", title: "Guia do SISUB para agentes" }],
					},
				])

				return new Response(body, {
					headers: { "content-type": "application/linkset+json; charset=utf-8", "cache-control": "public, max-age=86400" },
				})
			},
		},
	},
})
