import { describe, expect, it } from "bun:test"
import { classifyAccount, getRacDescription, rules } from "./types"

describe("tabela de contas transitórias (Q26–Q36)", () => {
	it("usa código de conta de 9 dígitos em toda regra", () => {
		// Código de conta do SIAFI tem 9 dígitos. Um código com outro tamanho nunca
		// casa com o dado do relatório e a regra vira letra morta sem ninguém notar.
		for (const rule of rules) {
			expect(rule.account, `conta ${rule.account}`).toMatch(/^\d{9}$/)
		}
	})

	it("não repete conta entre regras — a primeira venceria e a segunda seria ignorada", () => {
		const contas = rules.map((r) => r.account)
		expect(new Set(contas).size).toBe(contas.length)
	})

	it("associa toda regra a uma questão do RAC com descrição", () => {
		for (const rule of rules) {
			expect(rule.questaoRAC).toMatch(/^Questão \d+$/)
			expect(getRacDescription(rule.questaoRAC)).not.toBe("Análise de Saldos Transitórios")
		}
	})

	it("usa código de UG de 6 dígitos em toda exceção", () => {
		for (const rule of rules) {
			for (const ug of rule.exceptions) {
				expect(ug, `exceção de ${rule.account}`).toMatch(/^\d{6}$/)
			}
		}
	})
})

describe("classifyAccount", () => {
	it("cobra a UG quando a conta está parametrizada e não há exceção", () => {
		const r = classifyAccount("120062", "115611000", 1234.56)
		expect(r.classification).toBe("COBRANÇA")
		expect(r.accountCode).toBe("115611000")
		expect(r.questaoRAC).toBe("Questão 26")
	})

	it("respeita a exceção prevista para a UG", () => {
		expect(classifyAccount("120039", "115110101", 1).classification).toBe("EXCEÇÃO PREVISTA")
		expect(classifyAccount("120062", "115110101", 1).classification).toBe("COBRANÇA")
	})

	it("aplica a regra especial do GAP-BR em favor da COPAC", () => {
		const r = classifyAccount("120006", "115410200", 1)
		expect(r.classification).toBe("EXCEÇÃO PREVISTA")
		expect(r.observation).toContain("COPAC")
	})

	it("cobra com observação as UGs que podem movimentar mas devem zerar o mês", () => {
		for (const ug of ["120006", "120195"]) {
			const r = classifyAccount(ug, "123110701", 1)
			expect(r.classification).toBe("COBRANÇA COM OBSERVAÇÃO")
			expect(r.observation).toContain("saldo zerado")
		}
		expect(classifyAccount("120127", "123110701", 1).classification).toBe("EXCEÇÃO PREVISTA")
	})

	it("extrai o código quando a conta vem com o nome colado", () => {
		expect(classifyAccount("120062", "123119907 - BENS NÃO LOCALIZADOS", 1).accountCode).toBe("123119907")
	})

	it("marca como fora do escopo a conta que não está parametrizada", () => {
		const r = classifyAccount("120062", "111111903", 1)
		expect(r.classification).toBe("FORA DO ESCOPO PARAMETRIZADO")
		expect(r.questaoRAC).toBeUndefined()
	})

	it("classifica pela conta, não pelo valor — não há piso de materialidade", () => {
		// Documenta a decisão atual: R$ 0,01 e R$ 1 milhão produzem a mesma cobrança.
		// Se um piso for adotado, este teste é o lugar de fixá-lo.
		expect(classifyAccount("120062", "115611000", 0.01).classification).toBe("COBRANÇA")
		expect(classifyAccount("120062", "115611000", 1_000_000).classification).toBe("COBRANÇA")
	})
})
