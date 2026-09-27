import { describe, expect, test } from "bun:test"
import { analyzePrices } from "./analyzer.ts"
import type { ComprasMaterialPrecoItem } from "./types.ts"

const RECENT = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

function item(precoUnitario: number, codigoUasg: string, dataResultado: string | null): ComprasMaterialPrecoItem {
	return {
		idCompra: `c-${codigoUasg}-${precoUnitario}`,
		idItemCompra: 1,
		forma: null,
		modalidade: null,
		criterioJulgamento: null,
		numeroItemCompra: null,
		descricaoItem: "ARROZ",
		codigoItemCatalogo: 1,
		nomeUnidadeMedida: null,
		siglaUnidadeMedida: "KG",
		nomeUnidadeFornecimento: null,
		siglaUnidadeFornecimento: "KG",
		capacidadeUnidadeFornecimento: 1,
		quantidade: null,
		precoUnitario,
		percentualMaiorDesconto: null,
		niFornecedor: null,
		nomeFornecedor: null,
		marca: null,
		codigoUasg,
		nomeUasg: null,
		codigoMunicipio: null,
		municipio: null,
		estado: null,
		codigoOrgao: null,
		nomeOrgao: null,
		poder: null,
		esfera: null,
		dataCompra: null,
		dataHoraAtualizacaoCompra: null,
		dataHoraAtualizacaoItem: null,
		dataResultado,
		dataHoraAtualizacaoUasg: null,
		codigoClasse: null,
		nomeClasse: null,
	}
}

describe("analyzePrices", () => {
	test("amostra sem data fica fora do cálculo (IN 65/2021, art. 5º, II)", () => {
		const r = analyzePrices(1, "ARROZ", [item(10, "A", RECENT), item(11, "B", RECENT), item(12, "C", RECENT), item(1, "D", null)])
		expect(r.counts.afterDateFilter).toBe(3)
		expect(r.statistics?.min).toBe(10)
		expect(r.compliance.compliant).toBe(true)
	})

	test("poucos preços e janela longa viram não conformidade com a base do sisub", () => {
		const r = analyzePrices(1, "ARROZ", [item(10, "A", RECENT), item(11, "A", RECENT)], { months: 24 })
		expect(r.compliance.nonComplianceReasons).toEqual([
			"Menos de 3 preços válidos (2) (IN SEGES/ME 65/2021, art. 6º, caput e § 5º)",
			"Menos de 3 UASGs distintas (1) (Critério da unidade; a IN 65/2021 não fixa número de órgãos)",
			"Janela de 24 meses, maior que 1 ano (IN SEGES/ME 65/2021, art. 5º, I e II, e § 3º)",
		])
	})
})
