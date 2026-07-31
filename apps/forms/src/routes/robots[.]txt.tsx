import { ASSISTANT_USER_AGENTS, formatContentSignal, TRAINING_USER_AGENTS } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { siteUrl } from "@/lib/agent-discovery"

/**
 * `robots.txt` como rota, não arquivo estático: a diretiva `Sitemap` exige URL
 * absoluta e este app tem dois deploys em domínios diferentes
 * (`forms.iefa.com.br` e `5s.iefa.com.br`). Um arquivo estático anunciaria o
 * domínio errado em um dos dois.
 */
const PUBLIC_SIGNAL = formatContentSignal({ search: "yes", aiInput: "yes", aiTrain: "no" })
const TRAINING_SIGNAL = formatContentSignal({ search: "no", aiInput: "no", aiTrain: "no" })

// `/respond/*` é público por link, mas não deve ser rastreado: são avaliações em
// aberto, e indexá-las exporia o conteúdo de cada questionário.
const DISALLOWED = ["/auth", "/respond/", "/dashboard", "/questionnaires/", "/responses/", "/health"]

function group(userAgents: readonly string[], signal: string, rules: string[]): string {
	return [...userAgents.map((agent) => `User-agent: ${agent}`), signal, ...rules].join("\n")
}

function renderRobots(): string {
	const allowRules = ["Allow: /", ...DISALLOWED.map((path) => `Disallow: ${path}`)]

	return [
		"# https://www.robotstxt.org/robotstxt.html",
		"#",
		"# Content-Signal (https://contentsignals.org) declara a intenção sobre o uso do",
		"# conteúdo público. Alterar esses valores é decisão institucional, não técnica.",
		"",
		group(["*"], PUBLIC_SIGNAL, allowRules),
		"",
		"# --- Assistentes de IA e buscadores com IA -------------------------------",
		"",
		group(ASSISTANT_USER_AGENTS, PUBLIC_SIGNAL, allowRules),
		"",
		"# --- Coletores voltados a treinamento de modelos -------------------------",
		"",
		group(TRAINING_USER_AGENTS, TRAINING_SIGNAL, ["Disallow: /"]),
		"",
		`Sitemap: ${siteUrl()}/sitemap.xml`,
		"",
	].join("\n")
}

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: () =>
				new Response(renderRobots(), {
					headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
				}),
		},
	},
})
