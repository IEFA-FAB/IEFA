import { describe, expect, it } from "bun:test"
import { competenceToPeriod, countAnalysis } from "#/sacdgc/summary"
import type { DgcAnalysis } from "#/sacdgc/types"

const base: DgcAnalysis = {
	identificacao: { codigoUg: "120006", nomeUg: "x", anoReferencia: "2026", mesReferencia: "JULHO" },
	analisePainel1: "",
	analisePainel2: "",
	analisePainel3: "",
	analisePainel4: "",
	alertasDeCriticidade: [],
	checklistAec: { indicadores: { total: 20, comApontamento: 0, semApontamento: 20 }, perguntas: [] },
}

describe("countAnalysis", () => {
	it("conta alertas e apontamentos", () => {
		const analysis: DgcAnalysis = {
			...base,
			alertasDeCriticidade: [
				{ titulo: "a", origemAnalise: [], evidencia: "", acaoRecomendada: "" },
				{ titulo: "b", origemAnalise: [], evidencia: "", acaoRecomendada: "" },
			],
			checklistAec: {
				indicadores: { total: 20, comApontamento: 99, semApontamento: 0 },
				perguntas: [
					{ id: 1, pergunta: "x", resposta: "SIM" },
					{ id: 2, pergunta: "x", resposta: "NÃO" },
					{ id: 3, pergunta: "x", resposta: "SIM" },
				],
			},
		}
		// Conta as respostas, não o indicador — o indicador é que é derivado delas.
		expect(countAnalysis(analysis)).toEqual({ alertas: 2, apontamentos: 2 })
	})

	it("devolve zero na análise sem achado", () => {
		expect(countAnalysis(base)).toEqual({ alertas: 0, apontamentos: 0 })
	})
})

describe("competenceToPeriod", () => {
	it("converte a competência de um mês", () => {
		expect(competenceToPeriod("JULHO/2026")).toBe("2026-07-01")
		expect(competenceToPeriod("março/2026")).toBe("2026-03-01")
		expect(competenceToPeriod("MARCO/2026")).toBe("2026-03-01")
	})

	// Carga com dois meses não tem uma data; inventar uma faria a série histórica
	// atribuir os achados de agosto a julho.
	it("recusa competência ambígua ou irreconhecível", () => {
		expect(competenceToPeriod("JULHO/2026, AGOSTO/2026")).toBeNull()
		expect(competenceToPeriod("")).toBeNull()
		expect(competenceToPeriod("COMPETÊNCIA 13/2026")).toBeNull()
		expect(competenceToPeriod("JULHO")).toBeNull()
	})
})
