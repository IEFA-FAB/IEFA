import { describe, expect, test } from "bun:test"
import { digitsOnly, mapColumns, normalizeHeader, parseBrDate, parseBrMoney, parseSiafiRows, SiafiParseError } from "./parse.ts"
import { findHeaderRow, parseCsv, rowsToObjects } from "./read-file.ts"

describe("normalizeHeader", () => {
	test("remove acento, caixa e pontuação", () => {
		expect(normalizeHeader("Natureza da Despesa")).toBe("natureza da despesa")
		expect(normalizeHeader("DOTAÇÃO ATUALIZADA")).toBe("dotacao atualizada")
		expect(normalizeHeader("  Ordem  Bancária ")).toBe("ordem bancaria")
		expect(normalizeHeader("PTRES / UGR")).toBe("ptres ugr")
	})
})

describe("parseBrMoney", () => {
	test("formato pt-BR com milhar e decimal", () => {
		expect(parseBrMoney("1.234,56")).toBe(1234.56)
		expect(parseBrMoney("1.234.567,89")).toBe(1234567.89)
		expect(parseBrMoney("0,50")).toBe(0.5)
	})

	test("negativo por sinal e por parênteses (padrão contábil)", () => {
		expect(parseBrMoney("-1.000,00")).toBe(-1000)
		expect(parseBrMoney("(1.000,00)")).toBe(-1000)
	})

	test("tolera R$ e espaços", () => {
		expect(parseBrMoney("R$ 2.500,00")).toBe(2500)
		expect(parseBrMoney(" 15,00 ")).toBe(15)
	})

	test("número já numérico passa direto", () => {
		expect(parseBrMoney(1234.56)).toBe(1234.56)
	})

	test("vazio, traço e texto viram null", () => {
		expect(parseBrMoney("")).toBeNull()
		expect(parseBrMoney("-")).toBeNull()
		expect(parseBrMoney("n/a")).toBeNull()
		expect(parseBrMoney(null)).toBeNull()
	})
})

describe("parseBrDate", () => {
	test("DD/MM/AAAA vira ISO", () => {
		expect(parseBrDate("31/07/2026")).toBe("2026-07-31")
	})

	test("ISO passa direto e lixo vira null", () => {
		expect(parseBrDate("2026-07-31")).toBe("2026-07-31")
		expect(parseBrDate("julho")).toBeNull()
		expect(parseBrDate(null)).toBeNull()
	})
})

describe("digitsOnly", () => {
	test("extrai dígitos de CNPJ/UG formatados", () => {
		expect(digitsOnly("12.345.678/0001-99")).toBe("12345678000199")
		expect(digitsOnly("120.070")).toBe("120070")
		expect(digitsOnly("  ")).toBeNull()
	})
})

describe("mapColumns", () => {
	test("reconhece sinônimos por campo lógico", () => {
		const map = mapColumns(["Nota de Empenho", "Data Emissão", "Valor Documento", "CNPJ"], "ne")
		expect(map["Nota de Empenho"]).toBe("numero_ne")
		expect(map["Data Emissão"]).toBe("data")
		expect(map["Valor Documento"]).toBe("valor")
		expect(map.CNPJ).toBe("favorecido_cnpj")
	})

	test('"Documento" resolve pelo tipo declarado', () => {
		expect(mapColumns(["Documento", "Valor"], "ne").Documento).toBe("numero_ne")
		expect(mapColumns(["Documento", "Valor"], "ns").Documento).toBe("numero_ns")
		expect(mapColumns(["Documento", "Valor"], "ob").Documento).toBe("numero_ob")
	})

	test("coluna desconhecida é ignorada", () => {
		const map = mapColumns(["Observação Interna", "Valor"], "ne")
		expect(map["Observação Interna"]).toBeUndefined()
	})
})

describe("parseSiafiRows", () => {
	const neRows = [
		{ "Nota de Empenho": "2026NE000123", "Data Emissão": "15/07/2026", "Valor Documento": "1.500,00", CNPJ: "12.345.678/0001-99" },
		{ "Nota de Empenho": "2026NE000124", "Data Emissão": "16/07/2026", "Valor Documento": "2.300,50", CNPJ: "12.345.678/0001-99" },
	]

	test("normaliza valores e datas de todas as linhas", () => {
		const report = parseSiafiRows(neRows, "ne")
		expect(report.recognizedRows).toBe(2)
		expect(report.rows[0]?.parsed).toMatchObject({
			numero_ne: "2026NE000123",
			data: "2026-07-15",
			valor: 1500,
			favorecido_cnpj: "12345678000199",
		})
	})

	test("preserva a linha crua para reprocessamento", () => {
		const report = parseSiafiRows(neRows, "ne")
		expect(report.rows[0]?.raw).toEqual(neRows[0] as Record<string, unknown>)
	})

	test("linha sem campo obrigatório vira invalid, sem derrubar o lote", () => {
		const report = parseSiafiRows([...neRows, { "Nota de Empenho": "2026NE000125", "Data Emissão": "17/07/2026", "Valor Documento": "", CNPJ: "" }], "ne")
		expect(report.recognizedRows).toBe(2)
		expect(report.rows[2]?.status).toBe("invalid")
	})

	test("tipo declarado errado → erro apontando as colunas ausentes", () => {
		expect(() => parseSiafiRows(neRows, "credito")).toThrow(/nd, dotacao/)
	})

	test("layout desconhecido → erro explícito (nunca importação vazia)", () => {
		expect(() => parseSiafiRows([{ Coluna: "x", Outra: "y" }], "ne")).toThrow(SiafiParseError)
	})

	test("relatório de crédito com colunas próprias", () => {
		const report = parseSiafiRows(
			[
				{
					UG: "120070",
					"Natureza da Despesa": "33903007",
					PTRES: "170963",
					Fonte: "1000",
					"Dotação Atualizada": "500.000,00",
					Empenhado: "120.000,00",
					Saldo: "380.000,00",
				},
			],
			"credito"
		)
		expect(report.rows[0]?.parsed).toMatchObject({ nd: "33903007", dotacao: 500000, empenhado: 120000, saldo: 380000 })
	})
})

describe("leitura de arquivo", () => {
	test("CSV com separador ; e linhas de título antes do cabeçalho", () => {
		const csv = ["Tesouro Gerencial - Relatório", "", "Nota de Empenho;Data Emissão;Valor Documento", "2026NE000123;15/07/2026;1.500,00"].join("\n")
		const rows = parseCsv(csv)
		expect(rows).toHaveLength(1)
		expect(rows[0]?.["Nota de Empenho"]).toBe("2026NE000123")
	})

	test("CSV com vírgula dentro de aspas", () => {
		const csv = ["Documento;Credor;Valor", '2026NE000123;"EMPRESA X, LTDA";1.500,00'].join("\n")
		const rows = parseCsv(csv)
		expect(rows[0]?.Credor).toBe("EMPRESA X, LTDA")
	})

	test("linha de cabeçalho é a primeira com 2+ células textuais", () => {
		expect(findHeaderRow([["Relatório"], [], ["UG", "Valor"], ["120070", "1,00"]])).toBe(2)
	})

	test("linhas totalmente vazias são descartadas", () => {
		const objects = rowsToObjects([
			["A", "B"],
			["1", "2"],
			[null, null],
			["3", "4"],
		])
		expect(objects).toHaveLength(2)
	})
})
