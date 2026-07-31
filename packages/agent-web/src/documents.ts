/**
 * Renderizadores dos documentos de descoberta. Todos são funções puras sobre o
 * `SiteCatalog` do app mais os dados dinâmicos que ele quiser injetar.
 */

import { absoluteUrl, indexablePages, pagesBySection, type SiteCatalog } from "./catalog"

// ─── llms.txt ─────────────────────────────────────────────────────────────────

export interface LlmsLink {
	title: string
	url: string
	summary: string
}

export interface LlmsSection {
	heading: string
	links: LlmsLink[]
}

export interface RenderLlmsTxtOptions {
	/** Parágrafos livres entre o resumo e as seções. */
	notes?: string[]
	/** Seções extras (apps do banco, posts do CMS…), anexadas depois das do catálogo. */
	sections?: LlmsSection[]
	/** Seção final "Opcional", conforme a convenção do llms.txt. */
	optional?: LlmsLink[]
}

/**
 * Títulos e resumos vêm de banco e CMS. Um `]` ou uma quebra de linha no título
 * quebra a sintaxe `[texto](url)` e chega a associar o rótulo à URL errada.
 */
function escapeLinkText(value: string): string {
	return value
		.replace(/\s+/g, " ")
		.replace(/[[\]\\]/g, "\\$&")
		.trim()
}

/** Espaço e parênteses num destino de link também quebram a sintaxe. */
function escapeLinkUrl(value: string): string {
	return value.replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
}

/** Resumo é texto solto; só não pode quebrar a linha do item. */
function escapeSummary(value: string): string {
	return value.replace(/\s+/g, " ").trim()
}

function renderSection(section: LlmsSection): string {
	if (section.links.length === 0) return ""
	const body = section.links.map((link) => `- [${escapeLinkText(link.title)}](${escapeLinkUrl(link.url)}): ${escapeSummary(link.summary)}`).join("\n")
	return `## ${section.heading}\n\n${body}\n`
}

export function renderLlmsTxt(catalog: SiteCatalog, options: RenderLlmsTxtOptions = {}): string {
	const summary = catalog.longDescription ? `${catalog.description} ${catalog.longDescription}` : catalog.description

	// Cada entrada de `notes` é uma linha, não um parágrafo: quem escreve controla
	// os parágrafos com entradas vazias. Emitir um branco após cada linha quebraria
	// qualquer nota escrita em várias linhas.
	const notes = options.notes ?? []
	const header = [`# ${catalog.name}`, "", `> ${summary}`, "", ...(notes.length > 0 ? [...notes, ""] : [])].join("\n")

	const catalogSections: LlmsSection[] = pagesBySection(catalog).map(({ section, pages }) => ({
		heading: section,
		links: pages.map((page) => ({
			title: page.title,
			url: absoluteUrl(catalog, page.path),
			summary: page.summary,
		})),
	}))

	const sections = [...catalogSections, ...(options.sections ?? [])]
	if (options.optional?.length) sections.push({ heading: "Opcional", links: options.optional })

	return `${header}\n${sections.map(renderSection).filter(Boolean).join("\n")}`
}

// ─── sitemap.xml ──────────────────────────────────────────────────────────────

export interface SitemapEntry {
	loc: string
	/** `YYYY-MM-DD`. Omita quando não houver data real — inventar é pior. */
	lastmod?: string
	changefreq?: string
	priority?: number
}

function escapeXml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

/** Entradas do catálogo. Páginas com `noindex` ficam de fora. */
export function catalogSitemapEntries(catalog: SiteCatalog): SitemapEntry[] {
	return indexablePages(catalog).map((page) => ({
		loc: absoluteUrl(catalog, page.path),
		changefreq: page.changefreq,
		priority: page.priority,
	}))
}

export function renderSitemap(entries: readonly SitemapEntry[]): string {
	const urls = entries
		.map((entry) => {
			const parts = [`\t\t<loc>${escapeXml(entry.loc)}</loc>`]
			if (entry.lastmod) parts.push(`\t\t<lastmod>${entry.lastmod}</lastmod>`)
			if (entry.changefreq) parts.push(`\t\t<changefreq>${entry.changefreq}</changefreq>`)
			if (entry.priority !== undefined) parts.push(`\t\t<priority>${entry.priority.toFixed(1)}</priority>`)
			return `\t<url>\n${parts.join("\n")}\n\t</url>`
		})
		.join("\n")

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

// ─── /.well-known/api-catalog (RFC 9727) ──────────────────────────────────────

export interface ApiCatalogLink {
	href: string
	type: string
	title?: string
}

export interface ApiCatalogEntry {
	/** URL base da API. */
	anchor: string
	/** Especificação legível por máquina (OpenAPI). */
	serviceDesc?: ApiCatalogLink[]
	/** Documentação para humanos. */
	serviceDoc?: ApiCatalogLink[]
	status?: ApiCatalogLink[]
	describedby?: ApiCatalogLink[]
}

export function renderApiCatalog(entries: readonly ApiCatalogEntry[]): string {
	const linkset = entries.map((entry) => {
		const item: Record<string, unknown> = { anchor: entry.anchor }
		if (entry.serviceDesc?.length) item["service-desc"] = entry.serviceDesc
		if (entry.serviceDoc?.length) item["service-doc"] = entry.serviceDoc
		if (entry.status?.length) item.status = entry.status
		if (entry.describedby?.length) item.describedby = entry.describedby
		return item
	})

	return JSON.stringify({ linkset }, null, 2)
}

// ─── robots.txt ───────────────────────────────────────────────────────────────

export interface ContentSignal {
	search: "yes" | "no"
	aiInput: "yes" | "no"
	aiTrain: "yes" | "no"
}

export function formatContentSignal(signal: ContentSignal): string {
	return `Content-Signal: search=${signal.search}, ai-input=${signal.aiInput}, ai-train=${signal.aiTrain}`
}

/**
 * Coletores que buscam conteúdo sob demanda para responder a uma pessoa. Tratados
 * como buscadores.
 */
export const ASSISTANT_USER_AGENTS = [
	"ChatGPT-User",
	"OAI-SearchBot",
	"Claude-User",
	"Claude-SearchBot",
	"PerplexityBot",
	"Perplexity-User",
	"DuckAssistBot",
	"Applebot-Extended",
	"Google-Extended",
] as const

/** Coletores voltados a montar corpus de treinamento. */
export const TRAINING_USER_AGENTS = [
	"GPTBot",
	"ClaudeBot",
	"anthropic-ai",
	"CCBot",
	"Bytespider",
	"meta-externalagent",
	"Amazonbot",
	"cohere-ai",
	"Diffbot",
	"omgili",
] as const
