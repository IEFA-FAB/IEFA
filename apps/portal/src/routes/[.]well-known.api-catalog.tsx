import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl, PUBLIC_API } from "@/lib/agent-discovery"

/**
 * Catálogo de APIs no formato linkset (RFC 9727 / RFC 9264).
 *
 * Lista apenas APIs de leitura pública. Endpoints administrativos da Sisub API
 * exigem `x-admin-secret` e ficam fora do catálogo de propósito.
 */
const CATALOG = {
	linkset: [
		{
			anchor: PUBLIC_API.base,
			"service-desc": [{ href: PUBLIC_API.openapi, type: "application/json", title: `${PUBLIC_API.name} — OpenAPI 3.0` }],
			"service-doc": [{ href: PUBLIC_API.docs, type: "text/html", title: `${PUBLIC_API.name} — referência` }],
			status: [{ href: `${PUBLIC_API.base}/health`, type: "application/json", title: "Health check" }],
			describedby: [{ href: absoluteUrl("/llms.txt"), type: "text/plain", title: "Guia do portal para agentes" }],
		},
	],
}

export const Route = createFileRoute("/.well-known/api-catalog")({
	server: {
		handlers: {
			GET: () =>
				new Response(JSON.stringify(CATALOG, null, 2), {
					headers: {
						"content-type": "application/linkset+json; charset=utf-8",
						"cache-control": "public, max-age=86400",
					},
				}),
		},
	},
})
