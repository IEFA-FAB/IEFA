import { describe, expect, test } from "bun:test"
import { isFoodClass, PCA_CSV_COLUMNS, PcaCsvError, parseBrDate, parseBrNumber, parsePcaCsv, splitCsvLine, splitCsvRecords } from "./pncp-pca-csv.ts"

const HEADER = Object.values(PCA_CSV_COLUMNS).join(";")

/** Linha real do CSV da FAB (2026), abreviada nas colunas de texto longo. */
const LINHA_REAL =
	"BASE AEREA DE FORTALEZA;120014;1013;Material;120014-89/2026;Aquisição de gêneros;" +
	"Catálogo do Compras.gov.br;Material;8905;CARNES, AVES E PEIXES;;;" +
	"617629;CARACTERÍSTICAS ADICIONAIS: MESCLADO;UN;1.000,0000;10,1200;10.120,0000;0,0000;04/08/2026"

describe("splitCsvLine", () => {
	test("separa por ponto e vírgula", () => {
		expect(splitCsvLine("a;b;c")).toEqual(["a", "b", "c"])
	})

	test("respeita aspas com separador dentro", () => {
		expect(splitCsvLine('a;"CARNES, AVES; E PEIXES";c')).toEqual(["a", "CARNES, AVES; E PEIXES", "c"])
	})

	test("aspas duplicadas viram uma aspa", () => {
		expect(splitCsvLine('a;"diz ""oi""";c')).toEqual(["a", 'diz "oi"', "c"])
	})

	test("aspas SOLTAS no meio do texto são conteúdo, não delimitador", () => {
		// O arquivo real traz coisas como `TUBO 5" GALVANIZADO`; tratar isso como abertura de
		// campo engoliria os separadores seguintes e colaria registros.
		expect(splitCsvLine('a;TUBO 5" GALVANIZADO;c')).toEqual(["a", 'TUBO 5" GALVANIZADO', "c"])
	})

	test("campo final vazio é preservado", () => {
		expect(splitCsvLine("a;b;")).toEqual(["a", "b", ""])
	})
})

describe("splitCsvRecords", () => {
	test("aspas desbalanceadas NÃO engolem as quebras de linha seguintes", () => {
		// Regressão real: com rastreio ingênuo de aspas, uma polegada solta colou 10 mil
		// registros num só e o parser devolveu metade do arquivo.
		const conteudo = 'a;TUBO 5" GALV;c\nd;e;f\ng;h;i'

		expect(splitCsvRecords(conteudo)).toHaveLength(3)
	})

	test("quebra de linha dentro de campo entre aspas mantém um registro só", () => {
		expect(splitCsvRecords('a;"linha 1\nlinha 2";c\nd;e;f')).toHaveLength(2)
	})
})

describe("parseBrNumber", () => {
	test("decimal brasileiro com milhar", () => {
		expect(parseBrNumber("1.350,5000")).toBe(1350.5)
	})

	test("decimal simples", () => {
		expect(parseBrNumber("10,1200")).toBe(10.12)
	})

	test("zero é ausência, não valor — o CSV usa 0,0000 como vazio", () => {
		expect(parseBrNumber("0,0000")).toBeNull()
	})

	test("vazio e traço viram null", () => {
		expect(parseBrNumber("")).toBeNull()
		expect(parseBrNumber("-")).toBeNull()
		expect(parseBrNumber(undefined)).toBeNull()
	})
})

describe("parseBrDate", () => {
	test("dd/mm/aaaa vira ISO", () => {
		expect(parseBrDate("04/08/2026")).toBe("2026-08-04")
	})

	test("formato desconhecido vira null em vez de data errada", () => {
		expect(parseBrDate("2026-08-04")).toBeNull()
		expect(parseBrDate("")).toBeNull()
	})
})

describe("parsePcaCsv", () => {
	test("parseia uma linha real da FAB", () => {
		const { items, skipped } = parsePcaCsv(`${HEADER}\n${LINHA_REAL}`)

		expect(skipped).toBe(0)
		expect(items).toHaveLength(1)
		const it = items[0]
		expect(it.uasg).toBe("120014")
		expect(it.idItemPca).toBe("1013")
		expect(it.codigoItem).toBe("617629")
		expect(it.codigoClasse).toBe("8905")
		expect(it.unidadeFornecimento).toBe("UN")
		expect(it.quantidadeEstimada).toBe(1000)
		expect(it.valorUnitarioEstimado).toBe(10.12)
		expect(it.dataDesejada).toBe("2026-08-04")
		// colunas vazias no arquivo real
		expect(it.codigoPdm).toBeNull()
		// 0,0000 no valor orçamentário não pode virar zero real
		expect(it.valorOrcamentario).toBeNull()
	})

	test("BOM no início não quebra a primeira coluna", () => {
		const { items } = parsePcaCsv(`﻿${HEADER}\n${LINHA_REAL}`)

		expect(items[0].nomeUnidade).toBe("BASE AEREA DE FORTALEZA")
	})

	test("coluna esperada ausente aborta o arquivo inteiro, nomeando a coluna", () => {
		const headerSemUasg = HEADER.replace(";UASG;", ";UASG_RENOMEADA;")

		expect(() => parsePcaCsv(`${headerSemUasg}\n${LINHA_REAL}`)).toThrow(PcaCsvError)
		expect(() => parsePcaCsv(`${headerSemUasg}\n${LINHA_REAL}`)).toThrow(/UASG/)
	})

	test("ordem das colunas não importa — a resolução é por nome", () => {
		const cols = Object.values(PCA_CSV_COLUMNS)
		const original = splitCsvLine(LINHA_REAL)
		const ordem = [...cols.keys()].reverse()

		const headerInvertido = ordem.map((i) => cols[i]).join(";")
		const linhaInvertida = ordem.map((i) => original[i]).join(";")

		const { items } = parsePcaCsv(`${headerInvertido}\n${linhaInvertida}`)

		expect(items[0].uasg).toBe("120014")
		expect(items[0].codigoItem).toBe("617629")
		expect(items[0].quantidadeEstimada).toBe(1000)
	})

	test("linha sem id nem UASG é contada como pulada, não gravada", () => {
		const vazia = ";".repeat(Object.keys(PCA_CSV_COLUMNS).length - 1)
		const { items, skipped } = parsePcaCsv(`${HEADER}\n${LINHA_REAL}\n${vazia}`)

		expect(items).toHaveLength(1)
		expect(skipped).toBe(1)
	})

	test("quebra de linha DENTRO de campo entre aspas não parte o registro", () => {
		const cols = Object.values(PCA_CSV_COLUMNS)
		const original = splitCsvLine(LINHA_REAL)
		const i = cols.indexOf(PCA_CSV_COLUMNS.descricaoItem)
		original[i] = '"DESCRIÇÃO COM\nQUEBRA DE LINHA"'
		const linha = original.join(";")

		const { items, skipped } = parsePcaCsv(`${HEADER}\n${linha}`)

		expect(skipped).toBe(0)
		expect(items).toHaveLength(1)
		expect(items[0].descricaoItem).toContain("QUEBRA DE LINHA")
		// o que importa: os campos DEPOIS da descrição não foram perdidos
		expect(items[0].quantidadeEstimada).toBe(1000)
		expect(items[0].dataDesejada).toBe("2026-08-04")
	})

	test("registro com número de colunas errado é pulado, não gravado parcialmente", () => {
		const truncada = splitCsvLine(LINHA_REAL).slice(0, 5).join(";")

		const { items, skipped } = parsePcaCsv(`${HEADER}\n${LINHA_REAL}\n${truncada}`)

		expect(items).toHaveLength(1)
		expect(skipped).toBe(1)
	})

	test("CSV vazio lança em vez de devolver acervo vazio", () => {
		expect(() => parsePcaCsv("")).toThrow(PcaCsvError)
	})
})

describe("isFoodClass", () => {
	test("classes de gênero medidas no PCA da FAB", () => {
		expect(isFoodClass("8905")).toBe(true) // carnes
		expect(isFoodClass("8915")).toBe(true) // hortifrúti
		expect(isFoodClass("8960")).toBe(true) // bebidas
	})

	test("classe não alimentar e ausência", () => {
		expect(isFoodClass("6130")).toBe(false) // conversores elétricos
		expect(isFoodClass(null)).toBe(false)
	})
})
