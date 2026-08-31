import { describe, expect, it } from "bun:test"
import { formatRac, formatRacQuestions } from "#/lib/rac"

describe("formatRac", () => {
	it("sempre com dois dígitos", () => {
		expect(formatRac(5)).toBe("Q05")
		expect(formatRac(34)).toBe("Q34")
	})
})

describe("formatRacQuestions", () => {
	it("conjunto vazio ou ausente devolve null", () => {
		expect(formatRacQuestions(undefined)).toBeNull()
		expect(formatRacQuestions([])).toBeNull()
	})

	it("uma questão vira o rótulo dela", () => {
		expect(formatRacQuestions([34])).toBe("Q34")
	})

	it("faixa contígua vira intervalo", () => {
		expect(formatRacQuestions([40, 41, 42])).toBe("Q40–Q42")
		// O caso que motivou o formato: 21 questões numa tira só.
		expect(formatRacQuestions([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25])).toBe("Q05–Q25")
	})

	it("intervalo não depende da ordem nem de repetição na entrada", () => {
		expect(formatRacQuestions([42, 40, 41, 41])).toBe("Q40–Q42")
	})

	it("conjunto esparso curto lista tudo", () => {
		expect(formatRacQuestions([34, 43])).toBe("Q34 · Q43")
		expect(formatRacQuestions([34, 40, 43])).toBe("Q34 · Q40 · Q43")
	})

	it("conjunto esparso longo mostra duas e conta o resto", () => {
		// Não é contíguo (falta a 6), então não pode virar Q05–Q43.
		expect(formatRacQuestions([5, 7, 34, 43])).toBe("Q05 · Q07 +2")
	})

	it("quase-contíguo com um buraco NÃO vira intervalo", () => {
		// Q40–Q42 afirmaria cobrir a Q41, que não está no conjunto.
		expect(formatRacQuestions([40, 42])).toBe("Q40 · Q42")
	})
})
