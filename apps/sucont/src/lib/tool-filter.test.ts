import { describe, expect, it } from "bun:test"
import { ALL_STAGES } from "#/lib/hub-filters"
import { filterTools } from "#/lib/tool-filter"
import type { Tool } from "#/lib/types"

const tools: Tool[] = [
	{ id: "a", title: "Auditor", description: "Análise de dados", icon: "ShieldCheck", stage: "analisar", internalPath: "/auditor" },
	{ id: "b", title: "Subitens Genéricos", description: "Subitens sem detalhamento", icon: "Layers", stage: "analisar", racQuestions: [34] },
	{ id: "c", title: "Compatibilidade", description: "Pares incompatíveis", icon: "GitCompare", stage: "analisar", racQuestions: [40, 41, 42] },
	{ id: "d", title: "MSG SIAFI", description: "Mensagem à UG", icon: "Send", stage: "comunicar", url: "https://exemplo.test" },
	{ id: "e", title: "Siafi Web", description: "Sistema de origem", icon: "ExternalLink", stage: "consultar", url: "https://exemplo.test" },
]

const all = { query: "", stage: ALL_STAGES, rac: null }

describe("filterTools", () => {
	it("sem filtro devolve o catálogo inteiro", () => {
		expect(filterTools(tools, all)).toHaveLength(5)
	})

	it("etapa casa por igualdade", () => {
		expect(filterTools(tools, { ...all, stage: "analisar" }).map((t) => t.id)).toEqual(["a", "b", "c"])
		expect(filterTools(tools, { ...all, stage: "consultar" }).map((t) => t.id)).toEqual(["e"])
	})

	it("questão do RAC devolve só quem declara cobri-la", () => {
		expect(filterTools(tools, { ...all, rac: 34 }).map((t) => t.id)).toEqual(["b"])
		expect(filterTools(tools, { ...all, rac: 41 }).map((t) => t.id)).toEqual(["c"])
	})

	it("ferramenta sem questão declarada NÃO entra no recorte por questão", () => {
		// O contrário faria o filtro por Q34 devolver o catálogo inteiro, que é o
		// mesmo que não filtrar — e a tela afirmaria que tudo trata da Q34.
		expect(filterTools(tools, { ...all, rac: 34 }).some((t) => t.id === "a")).toBe(false)
	})

	it("questão sem nenhuma ferramenta devolve vazio, não tudo", () => {
		expect(filterTools(tools, { ...all, rac: 7 })).toHaveLength(0)
	})

	it("busca acha pela questão, escrita como o analista a chama", () => {
		expect(filterTools(tools, { ...all, query: "q34" }).map((t) => t.id)).toEqual(["b"])
		expect(filterTools(tools, { ...all, query: "42" }).map((t) => t.id)).toEqual(["c"])
	})

	it("busca acha pela grafia com dois dígitos, que é a que aparece na tela", () => {
		// O cartão e o seletor mostram "Q05"/"Q34"; digitar exatamente isso tem de
		// achar. Antes só a forma nua casava, então "Q06" devolvia zero enquanto
		// "q6" devolvia a ferramenta.
		expect(filterTools(tools, { ...all, query: "q05" })).toHaveLength(0)
		expect(filterTools(tools, { ...all, query: "Q34" }).map((t) => t.id)).toEqual(["b"])
		expect(filterTools(tools, { ...all, query: "q40" }).map((t) => t.id)).toEqual(["c"])
		expect(filterTools(tools, { ...all, query: "40" }).map((t) => t.id)).toEqual(["c"])
	})

	it("busca acha pelo rótulo da etapa", () => {
		expect(filterTools(tools, { ...all, query: "comunicar" }).map((t) => t.id)).toEqual(["d"])
	})

	it("busca casa título e descrição, sem diferenciar caixa", () => {
		expect(filterTools(tools, { ...all, query: "AUDITOR" }).map((t) => t.id)).toEqual(["a"])
		expect(filterTools(tools, { ...all, query: "origem" }).map((t) => t.id)).toEqual(["e"])
	})

	it("os três eixos combinam por E", () => {
		expect(filterTools(tools, { query: "subitens", stage: "analisar", rac: 34 }).map((t) => t.id)).toEqual(["b"])
		// Etapa certa, questão errada: nada.
		expect(filterTools(tools, { query: "", stage: "analisar", rac: 43 })).toHaveLength(0)
	})
})
