import { renderLlmsTxt } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { CATALOG, siteUrl } from "@/lib/agent-discovery"

const NOTES = [
	"A Plataforma ACI (`/aci`), a verificação de documentos e o console técnico (`/alpha/*`)",
	"exigem sessão de usuário do COMAER e perfil concedido — não são listados aqui.",
	"",
	"Qualquer página pública é servida em Markdown: envie `Accept: text/markdown`.",
]

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () => {
				const body = renderLlmsTxt(CATALOG, {
					notes: NOTES,
					optional: [
						{
							title: "Agent Skills",
							url: `${siteUrl()}/.well-known/agent-skills/index.json`,
							summary: "Skill com o escopo do copiloto e as regras de uso.",
						},
						{ title: "Sitemap", url: `${siteUrl()}/sitemap.xml`, summary: "URLs públicas indexáveis." },
					],
				})

				return new Response(body, {
					headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
				})
			},
		},
	},
})
