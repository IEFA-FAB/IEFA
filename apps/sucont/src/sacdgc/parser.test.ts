import { describe, expect, it } from "bun:test"
import { PAINEL_1, PANEL_SOURCES } from "#/sacdgc/__fixtures__/dgc-sample"
import {
	buildDataset,
	buildGroupContext,
	decodeSpreadsheet,
	detectSeparator,
	formatCompetence,
	MAX_GROUP_CONTEXT_CHARS,
	MAX_UG_CHARS,
	panelFromFileName,
	panelFromHeaderRow,
	parseDelimited,
	parseDgcBase,
	ugColumnIndex,
} from "#/sacdgc/parser"
import type { PanelId, PanelRows } from "#/sacdgc/types"

describe("decodeSpreadsheet", () => {
	// "Diárias" em windows-1252: o "á" é o byte 0xE1 sozinho, que não é UTF-8 válido.
	const latin1Diarias = new Uint8Array([0x44, 0x69, 0xe1, 0x72, 0x69, 0x61, 0x73])

	it("lê o export do Tesouro Gerencial (windows-1252) sem corromper acento", () => {
		expect(decodeSpreadsheet(latin1Diarias)).toBe("Diárias")
	})

	it("lê UTF-8 quando o arquivo é UTF-8", () => {
		expect(decodeSpreadsheet(new TextEncoder().encode("Mês de Lançamento"))).toBe("Mês de Lançamento")
	})

	it("remove o BOM do UTF-8", () => {
		const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("UG")])
		expect(decodeSpreadsheet(withBom)).toBe("UG")
	})

	// A regressão real: lido como UTF-8 tolerante, 0xE1 vira U+FFFD e o modelo recebe
	// "Di rias" em vez do fator de custo do Módulo 19.
	it("não deixa passar caractere de substituição", () => {
		expect(decodeSpreadsheet(latin1Diarias)).not.toContain("�")
	})
})

describe("detectSeparator", () => {
	it("reconhece o ponto e vírgula do export", () => {
		expect(detectSeparator(PAINEL_1)).toBe(";")
	})

	it("não conta separador que está dentro de aspas", () => {
		expect(detectSeparator('"a,b,c,d";"e"\n')).toBe(";")
	})

	it("reconhece vírgula quando o arquivo é separado por vírgula", () => {
		expect(detectSeparator("ug,sistema,valor\n")).toBe(",")
	})
})

describe("parseDelimited", () => {
	it("preserva separador e quebra de linha dentro de aspas", () => {
		const rows = parseDelimited('"120006";"SERVICOS DE AGUA, ESGOTO";"1.355,00"\n')
		expect(rows).toEqual([["120006", "SERVICOS DE AGUA, ESGOTO", "1.355,00"]])
	})

	it("aceita CRLF e descarta linha totalmente vazia", () => {
		expect(parseDelimited('"a";"b"\r\n;\r\n"c";"d"\r\n')).toEqual([
			["a", "b"],
			["c", "d"],
		])
	})

	it("mantém a célula vazia no meio da linha (o índice das colunas depende disso)", () => {
		expect(parseDelimited('"120002";"33903007";;"2026"\n')[0]).toEqual(["120002", "33903007", "", "2026"])
	})

	it("desdobra aspas escapadas", () => {
		expect(parseDelimited('"MANUTENCAO ""A"" BORDO";"1,00"\n')[0]).toEqual(['MANUTENCAO "A" BORDO', "1,00"])
	})
})

describe("reconhecimento do painel", () => {
	it("acha o painel na linha de cabeçalho, inclusive com espaço duplo", () => {
		expect(panelFromHeaderRow(["Painel 3  - UG Beneficiada", "x"])).toBe(3)
	})

	it("ignora linha de dados", () => {
		expect(panelFromHeaderRow(["120004", "SISDABRA", "2026"])).toBeNull()
	})

	it("deduz o painel do nome do arquivo", () => {
		expect(panelFromFileName("PAINEL 2 - Estatístico Pessoal - ANALISE.csv")).toBe(2)
		expect(panelFromFileName("relatorio.csv")).toBeNull()
	})
})

describe("ugColumnIndex", () => {
	it("usa a UG beneficiada dos painéis 1 a 3 (primeira coluna)", () => {
		expect(ugColumnIndex(["Painel 1 - UG Beneficiada", "Painel 1 - SISTEMA ESTRUTURANTE"])).toBe(0)
	})

	// Índice fixo 0 aqui atribuiria à UG emitente todo o custo que ela pagou por
	// terceiros — um GAP absorveria a energia das UGs que ele atende.
	it("usa a UG beneficiada do painel 4, não a emitente", () => {
		const header = [
			"Painel 4 - UG Emitente Código",
			"Painel 4 - UG Emitente Nome",
			"Painel 4 - ITEM DE CUSTO",
			"Painel 4 - UG Beneficiada Código",
			"Painel 4 - UG Beneficiada Nome",
		]
		expect(ugColumnIndex(header)).toBe(3)
	})
})

describe("formatCompetence", () => {
	it("junta mês e ano dos painéis 1 a 3", () => {
		expect(formatCompetence("JULHO", "2026")).toBe("JULHO/2026")
	})

	it("expande a abreviação do painel 4 para a mesma competência", () => {
		expect(formatCompetence("JUL/2026", "")).toBe("JULHO/2026")
	})
})

describe("parseDgcBase", () => {
	const base = parseDgcBase(PANEL_SOURCES)
	const byCode = new Map(base.datasets.map((d) => [d.ugCode, d]))

	it("reconhece os quatro painéis", () => {
		expect(base.panelsFound).toEqual([1, 2, 3, 4])
	})

	it("consolida uma competência só", () => {
		expect(base.competence).toBe("JULHO/2026")
	})

	it("funde 120002 e 120700 na DIREF", () => {
		expect(byCode.has("120002")).toBe(false)
		expect(byCode.has("120700")).toBe(false)
		const diref = byCode.get("120002 e 120700")
		expect(diref?.rowCount[1]).toBe(3)
		expect(diref?.rowCount[2]).toBe(1)
		expect(diref?.group).toBe("Diretorias e ODS")
	})

	it("atribui a linha do painel 4 à UG beneficiada", () => {
		expect(byCode.get("120132")?.rowCount[4]).toBe(1)
		expect(byCode.get("120006")?.rowCount[4]).toBe(1)
	})

	it("não mistura linhas entre UGs", () => {
		const ba = byCode.get("120004")
		expect(ba?.consolidated).toContain("SISDABRA")
		expect(ba?.consolidated).not.toContain("120006")
	})

	it("mantém o cabeçalho de cada painel no recorte", () => {
		expect(byCode.get("120004")?.consolidated).toContain("Painel 1 - SISTEMA ESTRUTURANTE")
		expect(byCode.get("120004")?.consolidated).toContain("Painel 2 - GRUPO POR SISTEMAS - ESTATÍSTICOS")
	})

	it("resolve o nome oficial e o grupo pela relação da SUCONT", () => {
		expect(byCode.get("120004")?.ugName).toBe("120004 - BASE AEREA DE BRASILIA")
		expect(byCode.get("120004")?.group).toBe("Bases Aéreas")
		expect(byCode.get("120006")?.group).toBe("GAP")
	})

	it("não descarta linha nenhuma da amostra", () => {
		expect(base.skippedRows).toBe(0)
	})

	it("lê os painéis empilhados num arquivo só", () => {
		const stacked = parseDgcBase([{ name: "base.csv", text: `${PANEL_SOURCES[0].text}\n${PANEL_SOURCES[1].text}` }])
		expect(stacked.panelsFound).toEqual([1, 2])
		expect(stacked.datasets.find((d) => d.ugCode === "120004")?.rowCount[2]).toBe(2)
	})
})

describe("buildDataset", () => {
	const headerOf = (panel: PanelId) => [`Painel ${panel} - UG Beneficiada`]

	it("marca o corte quando o recorte estoura o teto", () => {
		const long = Array.from({ length: 4000 }, (_, i) => `"120004";"linha ${i}";"1.000,00"`)
		const dataset = buildDataset("120004", { 1: long, 2: [], 3: [], 4: [] } as PanelRows, headerOf)
		expect(dataset.truncated).toBe(true)
		expect(dataset.consolidated.length).toBeLessThanOrEqual(MAX_UG_CHARS + 200)
		expect(dataset.consolidated).toContain("CORTE")
	})

	it("não marca corte no recorte que cabe", () => {
		const dataset = buildDataset("120004", { 1: ['"120004";"a"'], 2: [], 3: [], 4: [] } as PanelRows, headerOf)
		expect(dataset.truncated).toBe(false)
		expect(dataset.rowCount).toEqual({ 1: 1, 2: 0, 3: 0, 4: 0 })
	})

	it("omite o bloco do painel sem linhas", () => {
		const dataset = buildDataset("120004", { 1: ['"120004";"a"'], 2: [], 3: [], 4: [] } as PanelRows, headerOf)
		expect(dataset.consolidated).not.toContain("Painel 2")
	})
})

describe("buildGroupContext", () => {
	const base = parseDgcBase(PANEL_SOURCES)
	const gap = base.datasets.find((d) => d.group === "GAP")

	it("não inclui a própria UG", () => {
		if (!gap) throw new Error("fixture sem UG de GAP")
		expect(buildGroupContext(gap, base.datasets)).not.toContain(gap.ugName)
	})

	it("só traz UG do mesmo grupo", () => {
		const ba = base.datasets.find((d) => d.ugCode === "120004")
		if (!ba) throw new Error("fixture sem base aérea")
		// Na amostra a 120004 é a única "Bases Aéreas".
		expect(buildGroupContext(ba, base.datasets)).toBe("")
	})

	// Mesmo recorte tem de gerar o mesmo prompt: com ordem instável, duas análises da
	// mesma UG divergiriam sem que nada nos dados tivesse mudado.
	it("é determinístico e limitado", () => {
		const many = Array.from({ length: 40 }, (_, i) => ({
			ugCode: `12010${String(i).padStart(2, "0")}`,
			ugName: `UG ${i}`,
			group: "GAP",
			rowCount: { 1: 1, 2: 0, 3: 0, 4: 0 },
			consolidated: "x".repeat(3000),
			truncated: false,
		}))
		const target = { ...many[0], ugCode: "120006" }
		const first = buildGroupContext(target, [...many].reverse())
		const second = buildGroupContext(target, many)
		expect(first).toBe(second)
		expect(first.length).toBeLessThanOrEqual(MAX_GROUP_CONTEXT_CHARS)
	})
})
