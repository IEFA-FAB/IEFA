import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { type LlmsLink, renderLlmsTxt, renderSitemap, type SitemapEntry } from "@iefa/agent-web"
import { absoluteUrl, CATALOG } from "./agent-discovery"
import { source } from "./source"

/**
 * Geração de `llms.txt`, `llms-full.txt` e `sitemap.xml` a partir do conteúdo
 * do fumadocs.
 *
 * Roda **apenas durante o prerender** do Nitro: o site é servido estático por
 * S3 + CloudFront, sem servidor em runtime. Como `collections/server` carrega
 * todo o MDX de forma eager, este módulo nunca pode acabar no bundle do cliente
 * — só é importado por rotas com `server.handlers`, que o prerender materializa
 * em arquivo.
 */

const CONTENT_DIR = "content/docs"

interface DocPage {
	slug: string
	url: string
	title: string
	description: string
	/** Primeiro segmento do slug: agrupa as páginas por sistema documentado. */
	group: string
	sourcePath: string
}

function pageTitle(data: Record<string, unknown>, fallback: string): string {
	return typeof data.title === "string" && data.title.length > 0 ? data.title : fallback
}

function pageDescription(data: Record<string, unknown>): string {
	return typeof data.description === "string" && data.description.length > 0 ? data.description : "Página da documentação do IEFA."
}

function collectPages(): DocPage[] {
	return source
		.getPages()
		.map((page) => {
			const slug = page.slugs.join("/")
			const data = page.data as unknown as Record<string, unknown>
			return {
				slug,
				url: absoluteUrl(page.url),
				title: pageTitle(data, slug || "Início"),
				description: pageDescription(data),
				group: page.slugs[0] ?? "geral",
				sourcePath: page.path,
			}
		})
		.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Rótulo de seção para o primeiro segmento do slug. */
const GROUP_LABELS: Record<string, string> = {
	alpha: "Projeto α",
	pbac: "PBAC — controle de acesso",
	portal: "Portal IEFA",
	sifare: "SIFARE",
	sisub: "SISUB — Subsistência",
}

function groupLabel(group: string): string {
	return GROUP_LABELS[group] ?? group
}

const NOTES = [
	"Documentação interna da suíte de aplicações do IEFA (Instituto de Economia,",
	"Finanças e Administração da Aeronáutica), em português do Brasil.",
	"",
	"`llms-full.txt` traz o conteúdo completo de todas as páginas em um arquivo —",
	"prefira-o a raspar o HTML página a página.",
	"",
	"O site é estático (S3 + CloudFront), então **não há negociação de conteúdo**:",
	"`Accept: text/markdown` não muda a resposta. Use `llms-full.txt`.",
]

export function buildLlmsTxt(): string {
	const pages = collectPages()

	// Páginas na raiz (sem grupo próprio) abrem o documento; o resto agrupa por sistema.
	const bySection = new Map<string, LlmsLink[]>()
	for (const page of pages) {
		const key = page.slug === "" ? "Documentação" : groupLabel(page.group)
		const links = bySection.get(key) ?? []
		links.push({ title: page.title, url: page.url, summary: page.description })
		bySection.set(key, links)
	}

	return renderLlmsTxt(CATALOG, {
		notes: NOTES,
		sections: Array.from(bySection.entries()).map(([heading, links]) => ({ heading, links })),
		optional: [
			{
				title: "llms-full.txt",
				url: absoluteUrl("/llms-full.txt"),
				summary: "Conteúdo completo de toda a documentação em um único arquivo Markdown.",
			},
			{ title: "Sitemap", url: absoluteUrl("/sitemap.xml"), summary: "Todas as URLs da documentação." },
		],
	})
}

/** Remove o frontmatter YAML: título e descrição já entram como cabeçalho. */
function stripFrontmatter(raw: string): string {
	return raw.startsWith("---") ? raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") : raw
}

/**
 * Conteúdo integral da documentação, um arquivo só. A leitura é do MDX em disco:
 * é a fonte real, sem passar por render nem por conversão de HTML.
 *
 * Falha de leitura **propaga de propósito**: isso roda no prerender, que tem
 * `failOnError: true`. Engolir o erro publicaria um `llms-full.txt` incompleto
 * no CDN sem ninguém perceber, e sem servidor em runtime não há como corrigir
 * sob demanda depois.
 */
export async function buildLlmsFullTxt(): Promise<string> {
	const pages = collectPages()

	const documents = await Promise.all(
		pages.map(async (page) => {
			const body = stripFrontmatter(await readFile(join(process.cwd(), CONTENT_DIR, page.sourcePath), "utf8")).trim()

			return [`# ${page.title}`, "", `> ${page.description}`, "", `Fonte: <${page.url}>`, "", body].join("\n")
		})
	)

	const header = [
		`# ${CATALOG.name}`,
		"",
		`> ${CATALOG.description}`,
		"",
		`Documento gerado a partir de ${pages.length} páginas. Índice em <${absoluteUrl("/llms.txt")}>.`,
	].join("\n")

	return `${header}\n\n---\n\n${documents.join("\n\n---\n\n")}\n`
}

export function buildDocsSitemap(): string {
	const entries: SitemapEntry[] = [
		{ loc: absoluteUrl("/"), changefreq: "weekly", priority: 1.0 },
		...collectPages().map((page) => ({
			loc: page.url,
			changefreq: "monthly" as const,
			priority: page.slug === "" ? 0.9 : 0.7,
		})),
	]

	return renderSitemap(entries)
}
