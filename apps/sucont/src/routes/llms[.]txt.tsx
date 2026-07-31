import { renderLlmsTxt } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { CATALOG, siteUrl } from "#/lib/agent-discovery"
import { sucontTools } from "#/lib/data"

const NOTES = [
	"**Este sistema não tem área pública.** Todo acesso exige sessão autenticada e",
	"autorização PBAC no módulo `sucont`. Não há API aberta nem credencial para agente.",
	"",
	"As ferramentas abaixo estão listadas para que se saiba o que existe — não são",
	"endereços acessíveis sem sessão. Um agente que precise de dado daqui deve pedir",
	"a uma pessoa autorizada.",
]

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () => {
				const body = renderLlmsTxt(CATALOG, {
					notes: NOTES,
					sections: [
						{
							heading: "Ferramentas internas (exigem sessão)",
							links: sucontTools.map((tool) => ({
								title: tool.title,
								url: `${siteUrl()}/auth`,
								summary: `${tool.description} — categoria: ${tool.category}.`,
							})),
						},
					],
					optional: [
						{
							title: "Agent Skills",
							url: `${siteUrl()}/.well-known/agent-skills/index.json`,
							summary: "Skill com o vocabulário contábil e o que existe no hub.",
						},
					],
				})

				return new Response(body, {
					headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
				})
			},
		},
	},
})
