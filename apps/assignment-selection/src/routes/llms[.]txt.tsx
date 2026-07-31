import { renderLlmsTxt } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { CATALOG } from "@/lib/agent-discovery"

const NOTES = [
	"**App de evento, sem conteúdo público.** O telão e o controle são operados ao vivo",
	"durante a sessão de escolha de vagas, por pessoal autorizado com sessão iniciada.",
	"",
	"Não há API aberta nem credencial para agente. Os dados da sessão (classificação,",
	"vagas, escolhas) são institucionais e não são publicados aqui.",
]

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () =>
				new Response(renderLlmsTxt(CATALOG, { notes: NOTES }), {
					headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
				}),
		},
	},
})
