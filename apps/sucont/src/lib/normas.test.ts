import { describe, expect, it } from "bun:test"
import {
	blocoFundamentacao,
	citarMacrofuncao,
	FUNDAMENTO_CONCILIACAO_SISTEMAS,
	FUNDAMENTO_CONTA_GENERICA,
	FUNDAMENTO_SALDO_TRANSITORIO,
	MACROFUNCOES,
} from "./normas"

describe("referências normativas", () => {
	it("usa o título correto de cada macrofunção", () => {
		// A 02.03.18 já foi citada em ofício assinado como "Fidedignidade e ajuste de
		// pendências", título que não existe. Este teste é o que impede a volta.
		expect(MACROFUNCOES.encerramento).toEqual({ codigo: "02.03.18", titulo: "Encerramento do Exercício" })
		expect(MACROFUNCOES.conformidade).toEqual({ codigo: "02.03.15", titulo: "Conformidade Contábil" })
		expect(MACROFUNCOES.restosAPagar.codigo).toBe("02.03.17")
		expect(MACROFUNCOES.depreciacao.codigo).toBe("02.03.30")
		expect(MACROFUNCOES.reavaliacao.codigo).toBe("02.03.35")
		expect(MACROFUNCOES.regularizacoes.codigo).toBe("02.10.06")
	})

	it("formata a citação com código e título", () => {
		expect(citarMacrofuncao(MACROFUNCOES.encerramento)).toBe("Macrofunção 02.03.18 — Encerramento do Exercício (Manual SIAFI)")
	})

	it("numera o bloco de fundamentação", () => {
		expect(blocoFundamentacao(["primeiro", "segundo"])).toBe("Fundamentação normativa:\n1. primeiro\n2. segundo")
	})

	it("avisa que o apontamento de conta genérica não afere o parâmetro federal de 5%", () => {
		// A ocorrência federal (CONINCONS) é por percentual do subelemento 99 em cada
		// modalidade e elemento de despesa. As ferramentas apontam por ocorrência, e a
		// mensagem precisa dizer isso para não sugerir ressalva onde não há.
		const texto = FUNDAMENTO_CONTA_GENERICA.join(" ")
		expect(texto).toContain("CONINCONS")
		expect(texto).toContain("abaixo do parâmetro federal")
	})

	it("separa a exigência mensal do RAC da regra federal de encerramento", () => {
		const texto = FUNDAMENTO_SALDO_TRANSITORIO.join(" ")
		expect(texto).toContain("02.03.18")
		expect(texto).toContain("exigência interna do COMAER")
	})

	it("ancora a conciliação entre sistemas na 02.03.15 e no RADA-e", () => {
		const texto = FUNDAMENTO_CONCILIACAO_SISTEMAS.join(" ")
		expect(texto).toContain("02.03.15")
		expect(texto).toContain("RADA-e")
	})

	it("não deixa item de fundamentação vazio", () => {
		for (const lista of [FUNDAMENTO_SALDO_TRANSITORIO, FUNDAMENTO_CONTA_GENERICA, FUNDAMENTO_CONCILIACAO_SISTEMAS]) {
			expect(lista.length).toBeGreaterThan(0)
			for (const item of lista) expect(item.trim()).not.toBe("")
		}
	})
})
