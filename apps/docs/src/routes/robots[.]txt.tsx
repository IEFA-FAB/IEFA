import { ASSISTANT_USER_AGENTS, formatContentSignal, TRAINING_USER_AGENTS } from "@iefa/agent-web"
import { createFileRoute } from "@tanstack/react-router"
import { absoluteUrl } from "@/lib/agent-discovery"

/**
 * `robots.txt` como rota para ser materializado no prerender junto com o resto
 * do site — não há servidor em runtime para gerá-lo depois.
 */
const PUBLIC_SIGNAL = formatContentSignal({ search: "yes", aiInput: "yes", aiTrain: "no" })
const TRAINING_SIGNAL = formatContentSignal({ search: "no", aiInput: "no", aiTrain: "no" })

function group(userAgents: readonly string[], signal: string, rules: string[]): string {
	return [...userAgents.map((agent) => `User-agent: ${agent}`), signal, ...rules].join("\n")
}

function renderRobots(): string {
	// `/api/*` são artefatos de build (índice do site, índice de busca), não conteúdo.
	const rules = ["Allow: /", "Disallow: /api/"]

	return [
		"# https://www.robotstxt.org/robotstxt.html",
		"#",
		"# Documentação pública da suíte IEFA. O conteúdo completo em Markdown está em",
		"# /llms-full.txt — preferir isso a rastrear o HTML página a página.",
		"#",
		"# Content-Signal (https://contentsignals.org): alterar esses valores é decisão",
		"# institucional, não técnica.",
		"",
		group(["*"], PUBLIC_SIGNAL, rules),
		"",
		"# --- Assistentes de IA e buscadores com IA -------------------------------",
		"",
		group(ASSISTANT_USER_AGENTS, PUBLIC_SIGNAL, rules),
		"",
		"# --- Coletores voltados a treinamento de modelos -------------------------",
		"",
		group(TRAINING_USER_AGENTS, TRAINING_SIGNAL, ["Disallow: /"]),
		"",
		`Sitemap: ${absoluteUrl("/sitemap.xml")}`,
		"",
	].join("\n")
}

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: () => new Response(renderRobots(), { headers: { "content-type": "text/plain; charset=utf-8" } }),
		},
	},
})
