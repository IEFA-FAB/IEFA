import { describe, expect, test } from "bun:test"
import {
	buildIngredientIndex,
	buildOpeningCatalogSheet,
	normalizeMeasureUnitCode,
	OPENING_MAX_QUANTITY,
	OPENING_MAX_ROWS,
	type OpeningCatalogIngredient,
	OpeningSheetError,
	parseOpeningSheet,
	parseSheetDate,
	parseSheetNumber,
	pickOpeningCost,
	pricePerBaseUnit,
	resolveOpeningSheet,
} from "./opening-balance-sheet.ts"

const ARROZ: OpeningCatalogIngredient = { id: "11111111-1111-4111-8111-111111111111", code: "101", description: "Arroz agulhinha tipo 1", measureUnit: "KG" }
const OLEO: OpeningCatalogIngredient = { id: "22222222-2222-4222-8222-222222222222", code: "202", description: "Óleo de soja", measureUnit: "LT" }
const OVO: OpeningCatalogIngredient = { id: "33333333-3333-4333-8333-333333333333", code: "303", description: "Ovo branco", measureUnit: "UN" }
const SEM_UNIDADE: OpeningCatalogIngredient = { id: "44444444-4444-4444-8444-444444444444", code: "404", description: "Tempero misto", measureUnit: "" }
const CATALOG = [ARROZ, OLEO, OVO, SEM_UNIDADE]
const UNITS = new Set(["KG", "LT", "UN", "G", "ML", "CX"])

function resolve(csv: string, moved: string[] = []) {
	return resolveOpeningSheet(parseOpeningSheet(csv), buildIngredientIndex(CATALOG), {
		canonicalUnits: UNITS,
		movedIngredientIds: new Set(moved),
	})
}

describe("parseSheetNumber", () => {
	test("formato brasileiro com vírgula", () => {
		expect(parseSheetNumber("1.350,5")).toEqual({ ok: true, value: 1350.5 })
		expect(parseSheetNumber("12,25")).toEqual({ ok: true, value: 12.25 })
		expect(parseSheetNumber("3")).toEqual({ ok: true, value: 3 })
	})

	test("ponto sem vírgula e fora do padrão de milhar é decimal", () => {
		expect(parseSheetNumber("1.25")).toEqual({ ok: true, value: 1.25 })
		expect(parseSheetNumber("0.5")).toEqual({ ok: true, value: 0.5 })
	})

	test("padrão de milhar sem vírgula é ambíguo e recusado, com as duas grafias sugeridas", () => {
		const result = parseSheetNumber("1.500")
		expect(result.ok).toBe(false)
		if (!result.ok) expect(result.reason).toContain("1500 ou 1,500")
	})

	test("texto não é número", () => {
		expect(parseSheetNumber("dez").ok).toBe(false)
		expect(parseSheetNumber("1,2,3").ok).toBe(false)
		expect(parseSheetNumber("").ok).toBe(false)
	})
})

describe("parseSheetDate", () => {
	test("dd/mm/aaaa, dd/mm/aa e ISO", () => {
		expect(parseSheetDate("05/03/2027")).toEqual({ ok: true, value: "2027-03-05" })
		expect(parseSheetDate("5/3/27")).toEqual({ ok: true, value: "2027-03-05" })
		expect(parseSheetDate("2027-03-05")).toEqual({ ok: true, value: "2027-03-05" })
	})

	test("vazio é sem validade", () => {
		expect(parseSheetDate("")).toEqual({ ok: true, value: null })
		expect(parseSheetDate(" - ")).toEqual({ ok: true, value: null })
	})

	test("data que não existe é recusada, não rolada para o mês seguinte", () => {
		expect(parseSheetDate("31/02/2027").ok).toBe(false)
		expect(parseSheetDate("2027/03/05").ok).toBe(false)
	})
})

describe("normalizeMeasureUnitCode", () => {
	test("grafias de planilha viram o código canônico", () => {
		expect(normalizeMeasureUnitCode("kg")).toBe("KG")
		expect(normalizeMeasureUnitCode("Quilos")).toBe("KG")
		expect(normalizeMeasureUnitCode("litro")).toBe("LT")
		expect(normalizeMeasureUnitCode("Und.")).toBe("UN")
		expect(normalizeMeasureUnitCode("galão")).toBe("GL")
	})

	test("desconhecida é null", () => {
		expect(normalizeMeasureUnitCode("tonel")).toBeNull()
		expect(normalizeMeasureUnitCode("")).toBeNull()
	})
})

describe("parseOpeningSheet", () => {
	test("colunas por nome, em qualquer ordem, com BOM e ponto e vírgula", () => {
		const csv = "﻿Unidade;Descrição;Quantidade;Validade;Lote;Local\r\nkg;Arroz agulhinha tipo 1;12,5;01/06/2027;L-9;Prateleira A\r\n"
		const { rows, rejections } = parseOpeningSheet(csv)
		expect(rejections).toEqual([])
		expect(rows).toEqual([
			{
				lineNumber: 2,
				ingredientId: null,
				code: null,
				description: "Arroz agulhinha tipo 1",
				quantity: 12.5,
				unitCode: "KG",
				lotCode: "L-9",
				expiryDate: "2027-06-01",
				location: "Prateleira A",
			},
		])
	})

	test("separador vírgula com decimal entre aspas", () => {
		const { rows } = parseOpeningSheet('codigo,quantidade,unidade\n101,"2,5",kg\n')
		expect(rows[0]?.quantity).toBe(2.5)
		expect(rows[0]?.code).toBe("101")
	})

	test("o número da linha é o do Excel, contando linha em branco no meio", () => {
		const csv = "codigo;quantidade;unidade\n101;1;kg\n\n202;x;lt\n"
		const { rejections } = parseOpeningSheet(csv)
		expect(rejections).toEqual([{ lineNumber: 4, reason: 'quantidade: "x" não é um número', label: "202" }])
	})

	test("quebra de linha dentro de campo entre aspas não abre registro novo nem desloca a contagem", () => {
		const csv = 'descricao;quantidade;unidade\n"Arroz\nagulhinha";1;kg\n101;0;kg\n'
		const { rows, rejections } = parseOpeningSheet(csv)
		expect(rows).toHaveLength(1)
		expect(rejections[0]?.lineNumber).toBe(4)
	})

	test("quantidade em branco é linha não preenchida da folha, ignorada sem recusa", () => {
		const { rows, rejections } = parseOpeningSheet("codigo;quantidade;unidade\n101;;kg\n202;3;lt\n")
		expect(rows).toHaveLength(1)
		expect(rejections).toEqual([])
	})

	test("linha inválida vira recusa com motivo; as válidas seguem", () => {
		const csv = ["codigo;quantidade;unidade;validade", "101;0;kg;", "101;2;tonel;", "101;2;kg;31/02/2027", ";2;kg;", "101;1.500;kg;", "101;4;kg;"].join("\n")
		const { rows, rejections } = parseOpeningSheet(csv)
		expect(rows).toHaveLength(1)
		expect(rejections.map((r) => r.lineNumber)).toEqual([2, 3, 4, 5, 6])
		expect(rejections[0]?.reason).toBe("quantidade precisa ser maior que zero")
		expect(rejections[1]?.reason).toBe('unidade "tonel" desconhecida')
		expect(rejections[3]?.reason).toBe("linha sem insumo_id, código nem descrição")
		expect(rejections[4]?.reason).toContain("ambíguo")
	})

	test("linha só de separadores, que o Excel deixa no fim do arquivo, não vira recusa", () => {
		const { rows, rejections } = parseOpeningSheet("codigo;quantidade;unidade\n101;2;kg\n;;\n;;\n")
		expect(rows).toHaveLength(1)
		expect(rejections).toEqual([])
	})

	test("quantidade acima do que cabe na coluna é recusada na linha, não no arquivo", () => {
		const { rows, rejections } = parseOpeningSheet(`codigo;quantidade;unidade\n101;${OPENING_MAX_QUANTITY + 1};kg\n101;3;kg\n`)
		expect(rows).toHaveLength(1)
		expect(rejections[0]?.reason).toContain("grande demais")
	})

	test("arquivo sem coluna obrigatória aborta inteiro", () => {
		expect(() => parseOpeningSheet("codigo;quantidade\n101;1\n")).toThrow(OpeningSheetError)
		expect(() => parseOpeningSheet("quantidade;unidade\n1;kg\n")).toThrow("identificar o item")
		expect(() => parseOpeningSheet("")).toThrow("Planilha vazia")
	})

	test("acima do teto de linhas aborta", () => {
		const csv = `codigo;quantidade;unidade\n${"101;1;kg\n".repeat(OPENING_MAX_ROWS + 1)}`
		expect(() => parseOpeningSheet(csv)).toThrow(`limite é ${OPENING_MAX_ROWS}`)
	})
})

describe("resolveOpeningSheet", () => {
	test("spec: 300 linhas, 12 com unidade desconhecida — 288 entram e 12 voltam com o motivo", () => {
		const lines = ["codigo;quantidade;unidade;lote"]
		for (let i = 0; i < 300; i++) lines.push(`101;1;${i < 12 ? "tonel" : "kg"};L${i}`)
		const { lines: accepted, rejections } = resolve(lines.join("\n"))
		expect(accepted).toHaveLength(288)
		expect(rejections).toHaveLength(12)
		expect(rejections.every((r) => r.reason === 'unidade "tonel" desconhecida')).toBe(true)
	})

	test("identifica por insumo_id, código e descrição (sem acento e sem caixa)", () => {
		const csv = ["insumo_id;codigo;descricao;quantidade;unidade;lote", `${ARROZ.id.toUpperCase()};;;1;kg;`, ";202;;2;litros;A", ";;OLEO DE SOJA;3;lt;B"].join(
			"\n"
		)
		const { lines, rejections } = resolve(csv)
		expect(rejections).toEqual([])
		expect(lines.map((l) => l.ingredientId)).toEqual([ARROZ.id, OLEO.id, OLEO.id])
	})

	test("insumo_id que não casa recusa, sem cair para a descrição", () => {
		const csv = `insumo_id;descricao;quantidade;unidade\n99999999-9999-4999-8999-999999999999;Arroz agulhinha tipo 1;1;kg\n`
		const { lines, rejections } = resolve(csv)
		expect(lines).toEqual([])
		expect(rejections[0]?.reason).toContain("não existe no catálogo")
	})

	test("unidade diferente da do insumo é recusada, não convertida", () => {
		const { lines, rejections } = resolve("codigo;quantidade;unidade\n101;10;cx\n")
		expect(lines).toEqual([])
		expect(rejections[0]?.reason).toBe("unidade CX diferente da unidade do insumo (KG) — informe a quantidade em KG")
	})

	test("insumo sem unidade canônica é recusado", () => {
		const { rejections } = resolve("codigo;quantidade;unidade\n404;1;kg\n")
		expect(rejections[0]?.reason).toContain("sem unidade de medida canônica")
	})

	test("insumo que já movimentou na cozinha é recusado", () => {
		const { lines, rejections } = resolve("codigo;quantidade;unidade\n101;1;kg\n303;12;un\n", [ARROZ.id])
		expect(lines.map((l) => l.ingredientId)).toEqual([OVO.id])
		expect(rejections[0]?.reason).toContain("já tem movimento nesta cozinha")
	})

	test("mesmo item, lote e validade duas vezes: a segunda é recusada apontando a primeira", () => {
		const csv = "codigo;quantidade;unidade;lote;validade\n101;1;kg;A;01/01/2028\n101;2;kg;B;01/01/2028\n101;3;kg;A;01/01/2028\n"
		const { lines, rejections } = resolve(csv)
		expect(lines).toHaveLength(2)
		expect(rejections).toEqual([
			{ lineNumber: 4, reason: "duplicada da linha 2 (mesmo item, lote e validade) — some as quantidades numa linha só", label: "101" },
		])
	})

	test("recusas da leitura e da resolução saem juntas, em ordem de linha", () => {
		const csv = "codigo;quantidade;unidade\n999;1;kg\n101;x;kg\n"
		const { rejections } = resolve(csv)
		expect(rejections.map((r) => r.lineNumber)).toEqual([2, 3])
	})
})

describe("buildOpeningCatalogSheet", () => {
	test("a folha gerada volta pela importação sem perder nada", () => {
		const sheet = buildOpeningCatalogSheet([ARROZ, { ...OLEO, description: 'Óleo; "extra"' }])
		expect(sheet.startsWith("﻿insumo_id;codigo;descricao;unidade;quantidade;lote;validade;local\r\n")).toBe(true)

		const filled = sheet.replace(`${ARROZ.id};101;Arroz agulhinha tipo 1;KG;;;;`, `${ARROZ.id};101;Arroz agulhinha tipo 1;KG;7,5;L1;10/10/2027;A1`)
		const { rows, rejections } = parseOpeningSheet(filled)
		expect(rejections).toEqual([])
		// o óleo ficou sem quantidade: linha não preenchida, ignorada
		expect(rows).toHaveLength(1)
		expect(rows[0]).toMatchObject({ ingredientId: ARROZ.id, quantity: 7.5, unitCode: "KG", lotCode: "L1", expiryDate: "2027-10-10", location: "A1" })
	})

	test("descrição com separador e aspas é escapada", () => {
		const sheet = buildOpeningCatalogSheet([{ ...OLEO, description: 'Óleo; "extra"' }])
		expect(sheet).toContain('"Óleo; ""extra"""')
	})
})

describe("custo sugerido", () => {
	test("preço de compra vira preço por unidade base pelo fator de conversão", () => {
		// caixa de 12 unidades a R$ 30 → R$ 2,50 a unidade
		expect(pricePerBaseUnit(30, 12)).toBe(2.5)
		expect(pricePerBaseUnit(10, 3)).toBe(3.3333)
	})

	test("sem fator conhecido não há sugestão — dividir por 1 transformaria o preço da caixa no do quilo", () => {
		expect(pricePerBaseUnit(30, null)).toBeNull()
		expect(pricePerBaseUnit(30, 0)).toBeNull()
		expect(pricePerBaseUnit(null, 12)).toBeNull()
		expect(pricePerBaseUnit(0, 12)).toBeNull()
	})

	test("ATA antes de pesquisa; a da própria unidade antes da de outra; depois a mais recente", () => {
		const research = { source: "price_research" as const, unitCost: 5, reference: "pesquisa", sameUnit: true, date: "2026-09-01" }
		const ataOther = { source: "ata" as const, unitCost: 6, reference: "ata outra", sameUnit: false, date: "2026-09-10" }
		const ataOwnOld = { source: "ata" as const, unitCost: 7, reference: "ata antiga", sameUnit: true, date: "2025-01-01" }
		const ataOwnNew = { source: "ata" as const, unitCost: 8, reference: "ata nova", sameUnit: true, date: "2026-01-01" }
		expect(pickOpeningCost([research, ataOther])?.reference).toBe("ata outra")
		expect(pickOpeningCost([research, ataOther, ataOwnOld])?.reference).toBe("ata antiga")
		expect(pickOpeningCost([ataOwnOld, research, ataOwnNew, ataOther])?.reference).toBe("ata nova")
		expect(pickOpeningCost([research])?.reference).toBe("pesquisa")
	})

	test("sem candidato válido, sem sugestão", () => {
		expect(pickOpeningCost([])).toBeNull()
		expect(pickOpeningCost([{ source: "ata", unitCost: 0, reference: "x", sameUnit: true, date: null }])).toBeNull()
	})
})
