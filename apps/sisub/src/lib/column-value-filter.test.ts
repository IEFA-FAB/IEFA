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

describe("setListedValues com filtro de outra coluna", () => {
	test("valor marcado fora do universo não faz o filtro sumir com valor ainda desmarcado", () => {
		// UF = [SP, RJ]; buscar e marcar PR não completa o universo (MG segue desmarcado).
		expect(setListedValues(["SP", "RJ-antigo"], ["SP", "PR", "MG"], ["PR"], true)).toEqual(["SP", "RJ-antigo", "PR"])
	})

	test("limpar sem filtro prévio parte do universo, não só do que a outra coluna deixou visível", () => {
		expect(setListedValues(undefined, ["SP", "RJ", "MG", "PR"], ["RJ"], false)).toEqual(["SP", "MG", "PR"])
	})

	test("desmarcar e remarcar um valor volta ao sem filtro", () => {
		const unchecked = setListedValues(undefined, ALL, ["óleo"], false)
		expect(unchecked).toEqual(["arroz", "feijão", "farinha"])
		expect(setListedValues(unchecked, ALL, ["óleo"], true)).toBeUndefined()
	})
})
