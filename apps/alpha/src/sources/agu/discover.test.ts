import { describe, expect, test } from "bun:test"
import { collectItemsFromHtml, MIN_EXPECTED_MODELS, UNVERSIONED_LABEL } from "./discover.ts"
import { parseVersionFromUrl, stripVersionFromUrl } from "./version.ts"

const BASE_URL = "https://www.gov.br/agu/pt-br/composicao/cgu/cgu/modelos/licitacoesecontratos/14133"

const html = await Bun.file(new URL("./__fixtures__/categoria-contratacao-direta.html", import.meta.url)).text()
const report = collectItemsFromHtml([{ url: `${BASE_URL}/contratacao-direta`, html }], BASE_URL)

describe("parseVersionFromUrl", () => {
	test("extrai mês e ano do sufixo do arquivo", () => {
		expect(parseVersionFromUrl(`${BASE_URL}/contratacao-direta/modelo-de-aviso-lei-no-14-133-abr-26.docx`)).toEqual({
			label: "abr-26",
			effective_from: "2026-04-01",
			rank: 2026 * 12 + 4,
		})
	})

	test("ordena versões pelo rank", () => {
		const set25 = parseVersionFromUrl(`${BASE_URL}/x-set-25.docx`)
		const abr26 = parseVersionFromUrl(`${BASE_URL}/x-abr-26.docx`)
		expect(abr26?.rank).toBeGreaterThan(set25?.rank ?? 0)
	})

	test("devolve null quando não há sufixo de versão", () => {
		expect(parseVersionFromUrl(`${BASE_URL}/modelo-sem-versao.docx`)).toBeNull()
	})
})

describe("stripVersionFromUrl", () => {
	test("duas versões do mesmo modelo compartilham a identidade", () => {
		const setembro = `${BASE_URL}/contratacao-direta/modelo-de-edital-credenciamento-lei-no-14-133-set-25.docx`
		const abril = `${BASE_URL}/contratacao-direta/modelo-de-edital-credenciamento-lei-no-14-133-abr-26.docx`
		expect(stripVersionFromUrl(setembro)).toBe(stripVersionFromUrl(abril))
	})
})

describe("collectItemsFromHtml — HTML real da categoria contratação direta", () => {
	test("encontra modelos", () => {
		expect(report.items.length).toBeGreaterThan(0)
	})

	test("deduplica o mesmo arquivo listado em vários links", () => {
		const urls = report.items.map((item) => item.fetch_url)
		expect(new Set(urls).size).toBe(urls.length)
	})

	test("mantém só a versão mais nova de cada modelo", () => {
		const credenciamento = report.items.filter((item) => item.external_id.includes("edital-credenciamento"))
		expect(credenciamento).toHaveLength(1)
		expect(credenciamento[0]?.version_label).toBe("abr-26")
	})

	test("registra a versão antiga preterida em vez de descartá-la em silêncio", () => {
		expect(report.supersededByNewer.some((entry) => entry.version_label === "set-25")).toBe(true)
	})

	test("categoriza pelo caminho do arquivo, não pela página onde foi encontrado", () => {
		const termoDeReferencia = report.items.find((item) => item.external_id.includes("termo-de-referencia-servicos-e-obras"))
		expect(termoDeReferencia?.category).toBe("pregao-e-concorrencia")
	})

	test("deriva effective_from do sufixo de versão", () => {
		const aviso = report.items.find((item) => item.external_id.includes("aviso-de-contratacao-direta"))
		expect(aviso?.version_label).toBe("abr-26")
		expect(aviso?.effective_from).toBe("2026-04-01")
	})

	test("todo item tem título não vazio", () => {
		for (const item of report.items) {
			expect(item.title.trim().length).toBeGreaterThan(0)
		}
	})

	test("piso de sanidade é maior que zero", () => {
		expect(MIN_EXPECTED_MODELS).toBeGreaterThan(0)
	})

	test("não ingere modelos revogados da categoria de arquivo histórico", () => {
		const arquivoHistorico = `${BASE_URL}/modelos-antigos/modelo-de-termo-de-contrato-lei-no-14-133-jan-23.docx`
		const page = { url: `${BASE_URL}/modelos-antigos`, html: `<a href="${arquivoHistorico}">Modelo antigo</a>` }
		const withLegacy = collectItemsFromHtml([page], BASE_URL)

		expect(withLegacy.items).toHaveLength(0)
		expect(withLegacy.excluded).toEqual([{ fetch_url: arquivoHistorico, category: "modelos-antigos" }])
	})

	test("arquivo sem sufixo de versão fica marcado para versionar pelo conteúdo", () => {
		const semVersao = `${BASE_URL}/contratacao-direta/modelo-sem-sufixo.docx`
		const withoutVersion = collectItemsFromHtml([{ url: BASE_URL, html: `<a href="${semVersao}">Modelo</a>` }], BASE_URL)

		expect(withoutVersion.items[0]?.version_label).toBe(UNVERSIONED_LABEL)
		expect(withoutVersion.items[0]?.effective_from).toBeUndefined()
	})
})

describe("título extraído do HTML", () => {
	test("tag aninhada não sobrevive à limpeza", () => {
		// Uma passada só de `<[^>]+>` transformaria `<<b>script>` em `<script>` —
		// criando a tag que deveria ter apagado. O título vai para o corpus.
		const html = '<a href="https://www.gov.br/agu/x/modelo-abr-26.docx"><<b>script>Modelo</b></a>'
		const report = collectItemsFromHtml([{ url: "https://www.gov.br/agu/x", html }], "https://www.gov.br/agu")

		expect(report.items).toHaveLength(1)
		expect(report.items[0].title).not.toContain("<")
		expect(report.items[0].title).not.toContain(">")
	})
})
