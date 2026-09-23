import { describe, expect, test } from "bun:test"
import { buildHits, matches, type SearchableSelectOption, toSearchTerms } from "./searchable-select-filter"

const opt = (value: string, label: string, extra: Partial<SearchableSelectOption> = {}): SearchableSelectOption => ({ value, label, ...extra })

describe("toSearchTerms", () => {
	test("tira acento, caixa e espaço sobrando", () => {
		expect(toSearchTerms("  Café   TIPO ")).toEqual(["cafe", "tipo"])
	})

	test("consulta vazia não gera termo", () => {
		expect(toSearchTerms("   ")).toEqual([])
	})
})

describe("matches", () => {
	test("sem termo, tudo casa", () => {
		expect(matches("qualquer coisa", [])).toBe(true)
	})

	test("casa sem acento nos dois lados", () => {
		expect(matches("Açúcar cristal", toSearchTerms("acucar"))).toBe(true)
	})

	// O motivo de o filtro ser palavra a palavra: a consulta inteira como
	// substring responderia "nenhum resultado" para o item que está na tela.
	test("as palavras podem aparecer fora de ordem e separadas", () => {
		expect(matches("Hortifruti / Frutas / Cítricas", toSearchTerms("citricas hortifruti"))).toBe(true)
		expect("Hortifruti / Frutas / Cítricas".includes("citricas hortifruti")).toBe(false)
	})

	test("falta uma palavra, não casa", () => {
		expect(matches("Café tipo 12", toSearchTerms("cafe 99"))).toBe(false)
	})
})

describe("buildHits", () => {
	const options = [opt("a", "Arroz"), opt("b", "Feijão"), opt("c", "Café")]

	test("a opção de limpar encabeça a lista e também é filtrável", () => {
		const clear = opt("", "Todos os ranchos")
		expect(buildHits({ options, query: "", clearOption: clear, selected: null })[0]).toBe(clear)
		expect(buildHits({ options, query: "todos", clearOption: clear, selected: null })).toEqual([clear])
	})

	test("busca casa rótulo, hint e keywords", () => {
		const withExtras = [opt("x", "GAP-SP", { hint: "Apoio", keywords: "Grupamento de Apoio de São Paulo" })]
		expect(buildHits({ options: withExtras, query: "grupamento", clearOption: null, selected: null })).toHaveLength(1)
		expect(buildHits({ options: withExtras, query: "apoio", clearOption: null, selected: null })).toHaveLength(1)
	})

	// A regressão que só apareceu no navegador: quem corta a lista renderizada é
	// o `limit` do primitivo, que pega os N PRIMEIROS. Seleção fora da janela
	// sumia — a lista abria no começo do catálogo, sem check em lugar nenhum.
	test("com busca vazia, o escolhido vai para o topo, sem duplicar", () => {
		const selected = options[2]
		const hits = buildHits({ options, query: "", clearOption: null, selected })

		expect(hits[0]).toBe(selected)
		expect(hits).toHaveLength(options.length)
		expect(hits.filter((o) => o.value === selected.value)).toHaveLength(1)
	})

	test("o escolhido entra na janela mesmo em lista grande", () => {
		const many = Array.from({ length: 4557 }, (_, i) => opt(`ing-${i}`, `Insumo ${i}`))
		const hits = buildHits({ options: many, query: "", clearOption: null, selected: many[3197] })

		expect(hits.slice(0, 50)).toContain(many[3197])
	})

	// Enquanto se digita, a ordem é do que foi digitado — fixar ali poria um
	// item que não casa a consulta à frente dos que casam.
	test("com busca, o escolhido NÃO é fixado", () => {
		const selected = options[2]
		const hits = buildHits({ options, query: "feijao", clearOption: null, selected })

		expect(hits).toEqual([options[1]])
	})

	// O rodapé "Mostrando 50 de N" conta em cima disto: se o pin inflasse a
	// lista, o total passaria a mentir.
	test("fixar o escolhido não muda o total", () => {
		const semPin = buildHits({ options, query: "", clearOption: null, selected: null })
		const comPin = buildHits({ options, query: "", clearOption: null, selected: options[1] })

		expect(comPin).toHaveLength(semPin.length)
	})

	test("valor salvo que não está nas opções não quebra nem entra", () => {
		const hits = buildHits({ options, query: "", clearOption: null, selected: null })
		expect(hits).toEqual(options)
	})
})
