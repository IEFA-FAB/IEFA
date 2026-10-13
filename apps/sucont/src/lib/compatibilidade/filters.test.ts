import { describe, expect, it } from "bun:test"
import { describeReportFilter } from "./filters"

describe("describeReportFilter", () => {
	it("sem filtro é o panorama geral", () => {
		expect(describeReportFilter("all", "all", null)).toBe("Panorama geral")
		expect(describeReportFilter("all", "all", "Eliana")).toBe("Panorama geral")
	})

	it("minhas UGs, sem questão", () => {
		expect(describeReportFilter("minhas", "all", "Eliana")).toBe("Filtrado por: Minhas UGs (Eliana) ")
	})

	it("conferente escolhido, sem questão", () => {
		expect(describeReportFilter("1S ELIANA", "all", null)).toBe("Filtrado por: 1S ELIANA ")
	})

	it("só a questão", () => {
		expect(describeReportFilter("all", "Questão 39", null)).toBe("Filtrado por:  Questão 39")
	})

	it("conferente e questão juntos", () => {
		expect(describeReportFilter("minhas", "Questão 20", "Pâmela")).toBe("Filtrado por: Minhas UGs (Pâmela)  + Questão 20")
		expect(describeReportFilter("2S PÂMELA", "Questão 11", null)).toBe("Filtrado por: 2S PÂMELA  + Questão 11")
	})
})
