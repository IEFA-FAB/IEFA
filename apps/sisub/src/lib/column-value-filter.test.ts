import { describe, expect, test } from "vitest"
import { setListedValues } from "@/lib/column-value-filter"

const ALL = ["arroz", "feijão", "farinha", "óleo"]

describe("setListedValues", () => {
	test("sem busca, marcar todos tira o filtro e limpar desmarca tudo", () => {
		expect(setListedValues(["arroz"], ALL, ALL, true)).toBeUndefined()
		expect(setListedValues(undefined, ALL, ALL, false)).toEqual([])
	})

	test("com busca, marcar soma só os listados ao que já estava marcado", () => {
		expect(setListedValues(["óleo"], ALL, ["feijão", "farinha"], true)).toEqual(["óleo", "feijão", "farinha"])
	})

	test("com busca, limpar tira só os listados e mantém o resto marcado", () => {
		// Sem filtro (tudo marcado), limpar "f…" deixa os outros dois marcados, não zera a coluna.
		expect(setListedValues(undefined, ALL, ["feijão", "farinha"], false)).toEqual(["arroz", "óleo"])
	})

	test("completar a lista pela busca devolve undefined (coluna deixa de estar filtrada)", () => {
		expect(setListedValues(["arroz", "óleo"], ALL, ["feijão", "farinha"], true)).toBeUndefined()
	})
})
