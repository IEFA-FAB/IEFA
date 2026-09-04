import { describe, expect, it } from "bun:test"
import { ACCOUNT_NAMES, getAccountName, getQuestaoByAccount, getRacQuestionTitle, RAC_DESCRIPTIONS, RAC_MAPPING } from "./rac"

const TODAS_AS_CONTAS = Object.values(RAC_MAPPING).flat()

describe("mapa de contas do RAC (Q05–Q25)", () => {
	it("usa código de conta de 9 dígitos em toda entrada", () => {
		// Conta do SIAFI tem 9 dígitos. Código maior nunca casa com o dado do relatório
		// e a conta fica sem rótulo de questão — foi o que aconteceu com a Questão 8,
		// cujos códigos do grupo 21881 estavam com um dígito a mais.
		for (const [questao, contas] of Object.entries(RAC_MAPPING)) {
			for (const conta of contas) {
				expect(conta, `${questao} → ${conta}`).toMatch(/^\d{9}$/)
			}
		}
	})

	it("descreve toda questão mapeada", () => {
		for (const questao of Object.keys(RAC_MAPPING)) {
			expect(RAC_DESCRIPTIONS[questao], `${questao} sem descrição`).toBeDefined()
			expect(getRacQuestionTitle(questao)).not.toBe("Outras Inconsistências")
		}
	})

	it("resolve a questão a partir da conta", () => {
		expect(getQuestaoByAccount("113810601")).toBe("Questão 5")
		expect(getQuestaoByAccount("218810447")).toBe("Questão 8")
		expect(getQuestaoByAccount("123119905")).toBe("Questão 19")
		expect(getQuestaoByAccount("999999999")).toBeNull()
	})

	it("não repete conta entre questões — a primeira venceria e esconderia a outra", () => {
		const duplicadas = TODAS_AS_CONTAS.filter((conta, i) => TODAS_AS_CONTAS.indexOf(conta) !== i)
		expect([...new Set(duplicadas)]).toEqual(["115510100"])
		// 115510100 aparece em Q13 e Q16 de propósito no roteiro; getQuestaoByAccount
		// devolve a primeira. Qualquer duplicata NOVA quebra este teste.
	})

	it("nomeia as contas de restos a pagar", () => {
		expect(getAccountName("632100000")).toBe("632100000 - RP PROCESSADOS A PAGAR")
		expect(getAccountName("113810601")).toBe("113810601")
		for (const conta of Object.keys(ACCOUNT_NAMES)) {
			expect(conta).toMatch(/^\d{9}$/)
		}
	})
})
