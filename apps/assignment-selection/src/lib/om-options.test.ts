import { describe, expect, it } from "vitest"
import { buildOmOptions, estadoForOm, hasVacancyBoard } from "./om-options"

describe("buildOmOptions", () => {
	const vacancies = [
		{ om: "GAP RJ", estado: "Rio de Janeiro", total_vagas: 4 },
		{ om: "BAAN", estado: "Goiás", total_vagas: 1 },
		{ om: null, estado: null, total_vagas: 3 },
	]

	it("usa o quadro da edição, em ordem, com rótulo OM · estado", () => {
		const options = buildOmOptions(vacancies, [])
		expect(options.map((o) => o.label)).toEqual(["BAAN · Goiás", "GAP RJ · Rio de Janeiro"])
	})

	it("conta só os confirmados e não esconde OM cheia", () => {
		const options = buildOmOptions(vacancies, [
			{ localidade: "BAAN", hide_card: true },
			{ localidade: "BAAN", hide_card: true },
			{ localidade: "GAP RJ", hide_card: false },
		])
		expect(options.find((o) => o.value === "BAAN")).toMatchObject({ confirmed: 2, total: 1 })
		expect(options.find((o) => o.value === "GAP RJ")).toMatchObject({ confirmed: 0, total: 4 })
	})

	it("sem quadro cadastrado não oferece nada (o banco recusaria todas)", () => {
		expect(buildOmOptions([], [{ localidade: "GAP RJ", hide_card: false }])).toEqual([])
		expect(hasVacancyBoard([])).toBe(false)
		expect(hasVacancyBoard([{ om: null }])).toBe(false)
		expect(hasVacancyBoard(vacancies)).toBe(true)
	})

	it("mantém a OM já gravada que saiu do quadro", () => {
		const options = buildOmOptions(vacancies, [{ localidade: "PAGL", hide_card: false }])
		expect(options.find((o) => o.value === "PAGL")?.label).toBe("PAGL · Rio de Janeiro")
	})
})

describe("estadoForOm", () => {
	it("prefere o estado do quadro e cai em N/A", () => {
		const options = buildOmOptions([{ om: "GAP CO", estado: "Rio Grande do Sul", total_vagas: 2 }], [])
		expect(estadoForOm(options, "GAP CO")).toBe("Rio Grande do Sul")
		expect(estadoForOm(options, "BASM")).toBe("Rio Grande do Sul")
		expect(estadoForOm(options, "XYZ")).toBe("N/A")
	})
})
