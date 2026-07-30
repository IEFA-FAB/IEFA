import { describe, expect, test } from "bun:test"
import { assertAsciiTitles, type SiteCatalog } from "./catalog.ts"
import { catalogSitemapEntries, renderApiCatalog, renderLlmsTxt, renderSitemap } from "./documents.ts"

const CATALOG: SiteCatalog = {
	name: "App de Teste",
	url: "https://teste.iefa.com.br",
	description: "Descrição curta.",
	pages: [
		{ path: "/", title: "Início", summary: "Home.", section: "Institucional", changefreq: "weekly", priority: 1 },
		{ path: "/sobre", title: "Sobre", summary: "Quem somos.", section: "Institucional", changefreq: "monthly", priority: 0.8 },
		{ path: "/entrar", title: "Entrar", summary: "Login.", section: "Conta", noindex: true },
	],
	discoveryDocuments: [{ path: "/llms.txt", rel: "describedby", type: "text/plain", title: "Guide" }],
}

describe("renderLlmsTxt", () => {
	test("agrupa por seção na ordem declarada", () => {
		const output = renderLlmsTxt(CATALOG)
		expect(output).toStartWith("# App de Teste")
		expect(output).toContain("> Descrição curta.")
		expect(output.indexOf("## Institucional")).toBeLessThan(output.indexOf("## Conta"))
		expect(output).toContain("- [Início](https://teste.iefa.com.br/): Home.")
	})

	// noindex é sobre sitemap; a página de login ainda vale descrever para um agente.
	test("inclui páginas noindex", () => {
		expect(renderLlmsTxt(CATALOG)).toContain("- [Entrar](https://teste.iefa.com.br/entrar): Login.")
	})

	test("anexa seções dinâmicas e a seção Opcional", () => {
		const output = renderLlmsTxt(CATALOG, {
			sections: [{ heading: "Suíte", links: [{ title: "SISUB", url: "https://sisub.iefa.com.br", summary: "Subsistência." }] }],
			optional: [{ title: "Sitemap", url: "https://teste.iefa.com.br/sitemap.xml", summary: "URLs." }],
		})
		expect(output).toContain("## Suíte")
		expect(output).toContain("- [SISUB](https://sisub.iefa.com.br): Subsistência.")
		expect(output.indexOf("## Suíte")).toBeLessThan(output.indexOf("## Opcional"))
	})

	test("seção vazia não vira cabeçalho órfão", () => {
		expect(renderLlmsTxt(CATALOG, { sections: [{ heading: "Vazia", links: [] }] })).not.toContain("## Vazia")
	})

	// Nota escrita em várias linhas tem que sair como prosa contínua; quem escreve
	// controla os parágrafos com entradas vazias.
	test("notas de várias linhas não ganham branco entre cada linha", () => {
		const output = renderLlmsTxt(CATALOG, { notes: ["Primeira linha", "segunda linha.", "", "Novo parágrafo."] })
		expect(output).toContain("Primeira linha\nsegunda linha.\n\nNovo parágrafo.")
	})

	test("sem notas, não sobra linha em branco extra antes da primeira seção", () => {
		expect(renderLlmsTxt(CATALOG)).not.toContain("\n\n\n")
	})
})

describe("sitemap", () => {
	test("exclui páginas noindex", () => {
		const entries = catalogSitemapEntries(CATALOG)
		expect(entries).toHaveLength(2)
		expect(entries.map((entry) => entry.loc)).not.toContain("https://teste.iefa.com.br/entrar")
	})

	test("omite lastmod quando não há data real", () => {
		expect(renderSitemap(catalogSitemapEntries(CATALOG))).not.toContain("<lastmod>")
	})

	test("emite lastmod quando informado", () => {
		const xml = renderSitemap([{ loc: "https://teste.iefa.com.br/posts/a", lastmod: "2026-07-30" }])
		expect(xml).toContain("<lastmod>2026-07-30</lastmod>")
	})

	test("escapa caracteres XML na URL", () => {
		const xml = renderSitemap([{ loc: "https://teste.iefa.com.br/busca?a=1&b=2" }])
		expect(xml).toContain("&amp;")
		expect(xml).not.toContain("?a=1&b=2")
	})
})

describe("renderApiCatalog", () => {
	test("monta linkset com as relações informadas", () => {
		const parsed = JSON.parse(
			renderApiCatalog([
				{
					anchor: "https://api.iefa.com.br",
					serviceDesc: [{ href: "https://api.iefa.com.br/doc", type: "application/json" }],
					status: [{ href: "https://api.iefa.com.br/health", type: "application/json" }],
				},
			])
		)
		expect(parsed.linkset[0].anchor).toBe("https://api.iefa.com.br")
		expect(parsed.linkset[0]["service-desc"][0].href).toBe("https://api.iefa.com.br/doc")
		expect(parsed.linkset[0]["service-doc"]).toBeUndefined()
	})
})

describe("assertAsciiTitles", () => {
	test("aceita ASCII", () => {
		expect(() => assertAsciiTitles(CATALOG.discoveryDocuments)).not.toThrow()
	})

	// Header HTTP não carrega UTF-8: acento sai corrompido no fio.
	test("rejeita acento", () => {
		expect(() => assertAsciiTitles([{ path: "/x", rel: "describedby", type: "text/plain", title: "Catálogo" }])).toThrow(/ASCII/)
	})
})
