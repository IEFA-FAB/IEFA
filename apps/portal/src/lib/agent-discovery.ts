/**
 * Catálogo canônico do portal para consumo por agentes e crawlers.
 *
 * Fonte única de verdade para `sitemap.xml`, `llms.txt` e os documentos em
 * `/.well-known/*`. Rotas em `_pt/` são redirects 301 para os caminhos
 * canônicos listados aqui — só o destino do redirect entra no catálogo.
 */

export const SITE_NAME = "Portal IEFA"

export const SITE_DESCRIPTION = "Portal do Instituto de Economia, Finanças e Administração da Aeronáutica."

export const ORGANIZATION_DESCRIPTION =
	"O IEFA é uma organização do Comando da Aeronáutica (COMAER) e Instituição Científica, " +
	"Tecnológica e de Inovação (ICT) reconhecida pelo DCTA. Atua em três frentes: ensino " +
	"(capacitação de gestores e agentes da administração), pesquisa e inovação, e suporte " +
	"técnico à SEFA e seus sistemas corporativos."

const CANONICAL_URL = "https://portal.iefa.com.br"

/** URL absoluta do portal, sem barra final. */
export function siteUrl(): string {
	const configured = import.meta.env.VITE_PUBLIC_URL
	const base = typeof configured === "string" && configured.length > 0 ? configured : CANONICAL_URL
	return base.replace(/\/+$/, "")
}

/** Resolve um caminho iniciado por `/` em URL absoluta. */
export function absoluteUrl(path: string): string {
	return `${siteUrl()}${path}`
}

export type ChangeFreq = "daily" | "weekly" | "monthly" | "yearly"

export interface PublicPage {
	/** Caminho canônico, sem barra final (`/facilities/` responde 307 para `/facilities`). */
	path: string
	title: string
	summary: string
	/** Agrupamento usado no `llms.txt`. */
	section: "Institucional" | "Facilidades" | "Revista SEIVA" | "Conteúdo" | "Legal"
	changefreq: ChangeFreq
	priority: number
}

/**
 * Páginas públicas indexáveis. Rotas autenticadas (`/journal/editorial/*`,
 * `/journal/submissions/*`, `/journal/review/*`, `/journal/profile`) e a tela de
 * login ficam de fora de propósito — não há conteúdo útil para um agente anônimo.
 */
export const PUBLIC_PAGES: readonly PublicPage[] = [
	{
		path: "/",
		title: "Início",
		summary: "Página inicial do portal: pilares institucionais e atalhos para a suíte de aplicações.",
		section: "Institucional",
		changefreq: "weekly",
		priority: 1.0,
	},
	{
		path: "/about",
		title: "Sobre o IEFA",
		summary: "Histórico, missão e estrutura do Instituto de Economia, Finanças e Administração da Aeronáutica.",
		section: "Institucional",
		changefreq: "monthly",
		priority: 0.8,
	},
	{
		path: "/research",
		title: "Pesquisa & Inovação",
		summary: "Linhas de pesquisa, áreas temáticas e banco de temas do IEFA como ICT do COMAER.",
		section: "Institucional",
		changefreq: "monthly",
		priority: 0.8,
	},
	{
		path: "/innovation-policy",
		title: "Política de Inovação",
		summary: "Política de Inovação do IEFA: propriedade intelectual, parcerias e transferência de tecnologia.",
		section: "Institucional",
		changefreq: "yearly",
		priority: 0.7,
	},
	{
		path: "/roadmap",
		title: "Roteiro",
		summary: "Roadmap público das aplicações do portal e seu estágio de desenvolvimento.",
		section: "Institucional",
		changefreq: "monthly",
		priority: 0.6,
	},
	{
		path: "/facilities",
		title: "Facilidades",
		summary: "Suíte de soluções e utilitários mantidos pelo IEFA para o COMAER.",
		section: "Facilidades",
		changefreq: "weekly",
		priority: 0.8,
	},
	{
		path: "/facilities/pregoeiro",
		title: "Pregoeiro",
		summary: "Biblioteca de frases e apoio ao pregoeiro em sessões públicas de licitação.",
		section: "Facilidades",
		changefreq: "monthly",
		priority: 0.7,
	},
	{
		path: "/chatRada",
		title: "Chat RADA",
		summary: "Consulta assistida por IA ao acervo documental do RADA.",
		section: "Facilidades",
		changefreq: "monthly",
		priority: 0.7,
	},
	{
		path: "/overseerDashboard",
		title: "Overseer Dashboard",
		summary: "Painel operacional de acompanhamento fiscal de contratos.",
		section: "Facilidades",
		changefreq: "monthly",
		priority: 0.6,
	},
	{
		path: "/posts",
		title: "Blog & Artigos",
		summary: "Conteúdo editorial e atualizações do portal. Cada post fica em /posts/{slug}.",
		section: "Conteúdo",
		changefreq: "weekly",
		priority: 0.8,
	},
	{
		path: "/journal",
		title: "Revista SEIVA",
		summary: "Entrada do sistema de gestão de publicações científicas do IEFA.",
		section: "Revista SEIVA",
		changefreq: "weekly",
		priority: 0.8,
	},
	{
		path: "/journal/about",
		title: "Sobre a revista SEIVA",
		summary: "Escopo, políticas editoriais, processo de avaliação por pares e equipe da revista.",
		section: "Revista SEIVA",
		changefreq: "monthly",
		priority: 0.7,
	},
	{
		path: "/journal/articles",
		title: "Artigos publicados",
		summary: "Catálogo dos artigos científicos publicados. Cada artigo fica em /journal/articles/{id}.",
		section: "Revista SEIVA",
		changefreq: "weekly",
		priority: 0.8,
	},
	{
		path: "/politica-de-privacidade",
		title: "Política de Privacidade",
		summary: "Tratamento de dados pessoais em toda a suíte, conforme a LGPD — coleta, retenção e exclusão manual por iefa@fab.mil.br em até 7 dias.",
		section: "Legal",
		changefreq: "yearly",
		priority: 0.3,
	},
	{
		path: "/termos-de-uso",
		title: "Termos de Uso",
		summary: "Condições de uso do portal e das aplicações da suíte.",
		section: "Legal",
		changefreq: "yearly",
		priority: 0.3,
	},
	{
		path: "/politica-de-cookies",
		title: "Política de Cookies",
		summary: "Cookies e armazenamento local usados pela suíte — inventário, finalidade e como recusar.",
		section: "Legal",
		changefreq: "yearly",
		priority: 0.3,
	},
]

/**
 * Documentos de descoberta servidos para agentes. Usados no `Link` header e no
 * `llms.txt`. Os títulos são ASCII de propósito: valores de header HTTP não
 * carregam UTF-8 e sairiam corrompidos.
 */
export const DISCOVERY_DOCUMENTS = [
	{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Portal guide for agents" },
	{ path: "/.well-known/api-catalog", rel: "api-catalog", type: "application/linkset+json", title: "API catalog" },
	{ path: "/.well-known/agent-skills/index.json", rel: "describedby", type: "application/json", title: "Agent Skills index" },
	{ path: "/auth.md", rel: "service-doc", type: "text/markdown", title: "Authentication for agents" },
	{ path: "/sitemap.xml", rel: "sitemap", type: "application/xml", title: "Sitemap" },
] as const

/**
 * API pública do ecossistema IEFA. Serve tanto o `/.well-known/api-catalog`
 * quanto o `llms.txt`. Não inclui endpoints que exigem `x-admin-secret`.
 */
export const PUBLIC_API = {
	name: "Sisub API",
	description: "API pública de consulta a dados do sistema de subsistência (alimentos, preços, opiniões).",
	base: "https://api.iefa.com.br",
	openapi: "https://api.iefa.com.br/doc",
	docs: "https://api.iefa.com.br/",
} as const
