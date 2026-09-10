import { describe, expect, it } from "bun:test"
import { MIN_EXPECTED_MODULES, parseRadaIndex, RadaIndexError, requireCompleteIndex } from "./rada-index.ts"

/**
 * A fixture é a página real da DIREF com host e caminho TROCADOS por `example.invalid` —
 * o repositório é público e nome de host da intranet não entra nele. O que o parser
 * precisa exercitar é a estrutura (tabela de módulos, texto do link), que é idêntica.
 */
const FIXTURE_BASE = "http://www.diref.example.invalid/index.php/rada-e1"
const html = await Bun.file(new URL("./__fixtures__/rada-index.html", import.meta.url)).text()

describe("parseRadaIndex", () => {
	const modules = parseRadaIndex(html, FIXTURE_BASE)

	it("lê os quinze módulos do regulamento", () => {
		expect(modules.map((m) => m.letter)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"])
	})

	it("preserva o título publicado, sem o prefixo da letra", () => {
		expect(modules.find((m) => m.letter === "A")?.title).toBe("Manual Eletrônico de Formalística")
		expect(modules.find((m) => m.letter === "E")?.title).toBe("Manual Eletrônico de Administração Orçamentária e Financeira")
	})

	it("resolve href relativo contra a página de índice", () => {
		const e = modules.find((m) => m.letter === "E")
		expect(e?.url.startsWith("http://www.diref.example.invalid/images/")).toBe(true)
	})

	it("mantém a URL absoluta de módulo hospedado em outro sistema", () => {
		expect(modules.find((m) => m.letter === "D")?.url).toContain("manual.sefa.example.invalid")
	})

	it("decodifica entidade e percent-encoding do título e da URL", () => {
		const f = modules.find((m) => m.letter === "F")
		expect(f?.title).toContain("Cargos e Funções")
		expect(f?.url).not.toContain("&amp;")
	})

	it("não confunde link de índice com módulo", () => {
		// `QTS` e `Ordem do Dia` são links da mesma página e não casam com `L - Título`.
		expect(modules.some((m) => m.title.includes("QTS"))).toBe(false)
		expect(modules.some((m) => m.title.includes("Ordem do Dia"))).toBe(false)
	})

	it("fica com a primeira ocorrência quando a letra se repete", () => {
		const letters = modules.map((m) => m.letter)
		expect(new Set(letters).size).toBe(letters.length)
	})
})

describe("requireCompleteIndex", () => {
	it("passa com o índice completo", () => {
		expect(requireCompleteIndex(parseRadaIndex(html, FIXTURE_BASE))).toHaveLength(MIN_EXPECTED_MODULES)
	})

	it("lança quando a página devolve menos módulos que o regulamento tem", () => {
		// É o modo de falha que importa: layout mudou e a ingestão seguiria com um corpus
		// pela metade, sem ninguém perceber.
		expect(() => requireCompleteIndex(parseRadaIndex("<a href='/x'>A - Só um</a>", FIXTURE_BASE))).toThrow(RadaIndexError)
	})

	it("diz quais letras encontrou, para o erro ser diagnosticável", () => {
		expect(() => requireCompleteIndex(parseRadaIndex("<a href='/x'>B - Um</a>", FIXTURE_BASE))).toThrow(/achados: B/)
	})
})
