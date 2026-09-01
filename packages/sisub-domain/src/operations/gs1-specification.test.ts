import { describe, expect, test } from "bun:test"
import {
	compareDeclaration,
	createLocalVerifier,
	describeVerdict,
	type GpcDeclaration,
	type GpcRequirement,
	isVerdictStale,
	specFingerprint,
} from "./gs1-specification.ts"

const CONSERVACAO: GpcRequirement = {
	attributeCode: "20000045",
	attributeTitle: "Estado de conservação",
	acceptedValueCodes: ["30002960", "30002961"], // congelado OU resfriado
}
const EMBALAGEM: GpcRequirement = {
	attributeCode: "20000101",
	attributeTitle: "Tipo de embalagem",
	acceptedValueCodes: ["30001111"],
}

function declared(attributeCode: string, valueCode: string, valueTitle?: string): GpcDeclaration {
	return { attributeCode, valueCode, valueTitle }
}

describe("compareDeclaration", () => {
	test("declaração dentro do conjunto aceito atende", () => {
		expect(compareDeclaration([CONSERVACAO], [declared("20000045", "30002961")])).toEqual({ verdict: "atende", divergences: [] })
	})

	test("o conjunto é conjunto mesmo — 'congelado OU resfriado' aceita os dois", () => {
		// Guardar valor único tornaria inexprimível metade dos editais reais.
		expect(compareDeclaration([CONSERVACAO], [declared("20000045", "30002960")]).verdict).toBe("atende")
		expect(compareDeclaration([CONSERVACAO], [declared("20000045", "30002961")]).verdict).toBe("atende")
	})

	test("valor fora do conjunto reprova, citando o declarado", () => {
		const result = compareDeclaration([CONSERVACAO], [declared("20000045", "30009999", "Salgado")])
		expect(result.verdict).toBe("nao_atende")
		expect(result.divergences).toEqual([
			{
				attributeCode: "20000045",
				attributeTitle: "Estado de conservação",
				accepted: ["30002960", "30002961"],
				declared: "Salgado",
				reason: "valor_nao_aceito",
			},
		])
	})

	test("atributo exigido e não declarado é INDETERMINADO, não reprovação", () => {
		// O fornecedor precisa saber se corrige o produto ou completa o cadastro.
		const result = compareDeclaration([CONSERVACAO], [])
		expect(result.verdict).toBe("indeterminado")
		expect(result.divergences[0]).toMatchObject({ declared: null, reason: "nao_declarado" })
	})

	test("reprovação domina indeterminação", () => {
		const result = compareDeclaration([CONSERVACAO, EMBALAGEM], [declared("20000045", "30009999")])
		expect(result.verdict).toBe("nao_atende")
		expect(result.divergences.map((d) => d.reason).sort()).toEqual(["nao_declarado", "valor_nao_aceito"])
	})

	test("exigência vazia é indeterminado, NUNCA 'atende'", () => {
		// Dizer "atende" quando nada foi especificado é a resposta que mais engana
		// numa tela de fornecedor.
		expect(compareDeclaration([], [declared("20000045", "30002960")])).toEqual({ verdict: "indeterminado", divergences: [] })
	})

	test("declaração extra em atributo não exigido é ignorada", () => {
		expect(compareDeclaration([CONSERVACAO], [declared("20000045", "30002960"), declared("99999999", "1")]).verdict).toBe("atende")
	})

	test("espaço em volta do código não muda o veredito", () => {
		const espacado: GpcRequirement = { ...CONSERVACAO, attributeCode: " 20000045 ", acceptedValueCodes: [" 30002960 "] }
		expect(compareDeclaration([espacado], [declared("20000045", "30002960")]).verdict).toBe("atende")
	})

	test("atende não devolve divergência", () => {
		expect(compareDeclaration([CONSERVACAO, EMBALAGEM], [declared("20000045", "30002960"), declared("20000101", "30001111")]).divergences).toEqual([])
	})
})

describe("specFingerprint", () => {
	test("é estável para a mesma exigência", () => {
		expect(specFingerprint([CONSERVACAO])).toBe(specFingerprint([CONSERVACAO]))
	})

	test("reordenar atributos ou valores NÃO invalida veredito gravado", () => {
		const reordenado: GpcRequirement = { ...CONSERVACAO, acceptedValueCodes: ["30002961", "30002960"] }
		expect(specFingerprint([CONSERVACAO, EMBALAGEM])).toBe(specFingerprint([EMBALAGEM, reordenado]))
	})

	test("mudar o conjunto aceito muda a impressão digital", () => {
		const estreitado: GpcRequirement = { ...CONSERVACAO, acceptedValueCodes: ["30002960"] }
		expect(specFingerprint([estreitado])).not.toBe(specFingerprint([CONSERVACAO]))
	})

	test("acrescentar exigência muda a impressão digital", () => {
		expect(specFingerprint([CONSERVACAO, EMBALAGEM])).not.toBe(specFingerprint([CONSERVACAO]))
	})

	test("valor duplicado na exigência não altera a identidade", () => {
		const duplicado: GpcRequirement = { ...CONSERVACAO, acceptedValueCodes: ["30002960", "30002960", "30002961"] }
		expect(specFingerprint([duplicado])).toBe(specFingerprint([CONSERVACAO]))
	})
})

describe("isVerdictStale", () => {
	test("veredito com impressão digital diferente está vencido", () => {
		expect(isVerdictStale("abc", "def")).toBe(true)
		expect(isVerdictStale("abc", "abc")).toBe(false)
	})

	test("veredito sem impressão digital é sempre vencido", () => {
		expect(isVerdictStale(null, "abc")).toBe(true)
		expect(isVerdictStale(undefined, "abc")).toBe(true)
	})
})

describe("createLocalVerifier", () => {
	test("marca a origem como local — é o que distingue depois o conferido de verdade", async () => {
		const verifier = createLocalVerifier(async () => [declared("20000045", "30002960")])
		const result = await verifier.verify({ gtin: "07891234567895", purchaseItemId: "pi-1", requirements: [CONSERVACAO] })
		expect(result).toMatchObject({ verdict: "atende", source: "local", gtin: "07891234567895", purchaseItemId: "pi-1" })
		expect(result.specFingerprint).toBe(specFingerprint([CONSERVACAO]))
	})

	test("GTIN sem declaração conhecida devolve indeterminado", async () => {
		const verifier = createLocalVerifier(async () => [])
		const result = await verifier.verify({ gtin: "07891234567895", purchaseItemId: "pi-1", requirements: [CONSERVACAO] })
		expect(result.verdict).toBe("indeterminado")
	})
})

describe("describeVerdict", () => {
	test("aprovado", () => {
		expect(describeVerdict("atende", [])).toBe("GTIN atende à especificação declarada.")
	})

	test("indeterminado conta os atributos pendentes", () => {
		const { divergences } = compareDeclaration([CONSERVACAO, EMBALAGEM], [])
		expect(describeVerdict("indeterminado", divergences)).toBe("Não é possível concluir: 2 atributo(s) exigido(s) sem declaração do fornecedor.")
	})

	test("indeterminado por exigência vazia diz isso, e não 'atende'", () => {
		expect(describeVerdict("indeterminado", [])).toBe("Não é possível concluir: especificação sem exigências declaradas.")
	})

	test("reprovado nomeia o atributo que barrou", () => {
		const { divergences } = compareDeclaration([CONSERVACAO], [declared("20000045", "30009999", "Salgado")])
		expect(describeVerdict("nao_atende", divergences)).toBe("GTIN não atende: Estado de conservação.")
	})
})
