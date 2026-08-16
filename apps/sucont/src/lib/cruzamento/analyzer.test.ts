import { describe, expect, it } from "bun:test"
import { analyzeData, CONTA_EXECUCAO_RESPONSABILIDADE, CONTA_RESPONSABILIDADE, type RawRecord, UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE } from "./analyzer"

const rec = (UG: string, ContaContabil: string, ContaCorrente: string, Saldo: number): RawRecord => ({ UG, ContaContabil, ContaCorrente, Saldo })

const statusDe = (records: RawRecord[], contaCorrente: string) => {
	const { ugAnalysis } = analyzeData(records)
	return ugAnalysis.flatMap((u) => u.details).find((d) => d.contaCorrente === contaCorrente)?.status
}

describe("cruzamento 897210300 × 897110300 (Q43)", () => {
	it("ignora contas fora do par", () => {
		const { stats } = analyzeData([rec("120062", "123119905", "CC1", 100)])
		expect(stats.totalUgs).toBe(0)
	})

	it("considera regular o conta corrente espelhado", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 500),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 500),
		]
		const { ugAnalysis } = analyzeData(records)
		expect(ugAnalysis.every((u) => u.status === "REGULAR")).toBe(true)
		expect(ugAnalysis.every((u) => u.inconsistenciesCount === 0)).toBe(true)
	})

	it("soma as linhas do mesmo lado antes de comparar", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 300),
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 200),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 500),
		]
		expect(statusDe(records, "CC1")).toBeUndefined()
	})

	it("não vê divergência no ruído de ponto flutuante do parse de moeda", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 0.1 + 0.2),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 0.3),
		]
		expect(statusDe(records, "CC1")).toBeUndefined()
	})

	it("aponta ausência quando só um dos lados registra", () => {
		expect(statusDe([rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 100)], "CC1")).toBe("AUSÊNCIA NA 897110300")
		expect(statusDe([rec("120062", CONTA_RESPONSABILIDADE, "CC2", 100)], "CC2")).toBe("AUSÊNCIA NA 897210300")
	})

	it("aponta divergência de saldo quando os dois lados registram valores diferentes", () => {
		const records = [
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 500),
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 450),
		]
		const { ugAnalysis } = analyzeData(records)
		const alvo = ugAnalysis.find((u) => u.inconsistenciesCount > 0)
		expect(alvo?.status).toBe("ATENÇÃO")
		expect(alvo?.financialImpact).toBe(50)
	})

	it("trata como crítica a UG não autorizada na conta de execução", () => {
		const records = [rec("120062", CONTA_EXECUCAO_RESPONSABILIDADE, "CC1", 100), rec("120062", CONTA_RESPONSABILIDADE, "CC1", 100)]
		const { ugAnalysis } = analyzeData(records)
		const alvo = ugAnalysis.find((u) => u.ug === "120062")
		expect(alvo?.status).toBe("CRÍTICA")
		expect(alvo?.details[0].status).toBe("UG INDEVIDA NA 897210300")
		expect(alvo?.diagnosis.join(" ")).toContain("desta Setorial")
	})

	it("atribui a inconsistência à mesma UG independentemente da ordem das linhas", () => {
		// `Set` preserva ordem de inserção: sem ordenação, quem respondia pelo achado
		// mudava conforme a planilha viesse ordenada de um jeito ou de outro.
		const linhas = [rec("120075", CONTA_RESPONSABILIDADE, "CC1", 100), rec("120062", CONTA_RESPONSABILIDADE, "CC1", 100)]
		const direto = analyzeData(linhas).ranking[0].ug
		const invertido = analyzeData([...linhas].reverse()).ranking[0].ug
		expect(direto).toBe(invertido)
		expect(direto).toBe("120062")
	})

	it("ordena o ranking por impacto financeiro e resume o achado", () => {
		const records = [
			rec("120062", CONTA_RESPONSABILIDADE, "CC1", 100),
			rec("120075", CONTA_RESPONSABILIDADE, "CC2", 900),
			rec(UG_AUTORIZADA_EXECUCAO_RESPONSABILIDADE, CONTA_EXECUCAO_RESPONSABILIDADE, "CC3", 50),
		]
		const { ranking, stats } = analyzeData(records)
		expect(ranking[0].ug).toBe("120075")
		expect(stats.ugsCriticas).toBe(3)
		expect(stats.synthesis).toContain("120075")
	})
})
