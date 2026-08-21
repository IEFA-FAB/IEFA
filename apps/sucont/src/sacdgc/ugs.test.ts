import { describe, expect, it } from "bun:test"
import { DIREF_UG_CODE, GROUP_ORDER, identifyGroup, isDirefUg, UG_NAMES, ugDisplayName } from "#/sacdgc/ugs"

describe("relação de UGs", () => {
	it("tem as 69 UGs atendidas pelo DGC", () => {
		expect(Object.keys(UG_NAMES)).toHaveLength(69)
	})

	it("trata 120002 e 120700 como a mesma unidade", () => {
		expect(isDirefUg("120002")).toBe(true)
		expect(isDirefUg("120700")).toBe(true)
		expect(isDirefUg("120004")).toBe(false)
		expect(ugDisplayName(DIREF_UG_CODE)).toContain("DIRETORIA DE ECON E FINANCAS")
	})

	it("rotula código fora da relação em vez de fingir que achou o nome", () => {
		expect(ugDisplayName("129999")).toBe("129999 - UG FORA DA RELAÇÃO OFICIAL")
	})

	it("classifica toda UG da relação num grupo conhecido", () => {
		for (const code of Object.keys(UG_NAMES)) {
			expect(GROUP_ORDER).toContain(identifyGroup(code))
		}
	})

	it("aceita código puro e nome completo", () => {
		expect(identifyGroup("120004")).toBe("Bases Aéreas")
		expect(identifyGroup("120004 - BASE AEREA DE BRASILIA")).toBe("Bases Aéreas")
		expect(identifyGroup(DIREF_UG_CODE)).toBe("Diretorias e ODS")
	})

	// A classificação é a da SUCONT: um hospital de força aérea vai para "Hospitais"
	// mesmo com "FORCA AEREA" no nome, que o casamento textual mandaria para Bases.
	it("prefere a classificação da SUCONT ao casamento por nome", () => {
		expect(identifyGroup("120042")).toBe("Hospitais")
		expect(identifyGroup("120096")).toBe("Hospitais")
	})

	it("cai no casamento por nome só para UG fora da relação", () => {
		expect(identifyGroup("129999 - GRUPAMENTO DE APOIO DE TESTE")).toBe("GAP")
		expect(identifyGroup("129999 - ORGANIZACAO DESCONHECIDA")).toBe("Outros")
	})
})
