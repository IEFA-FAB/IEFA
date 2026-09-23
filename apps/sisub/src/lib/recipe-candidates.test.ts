/**
 * Troca do candidato principal de uma linha da ficha (`promoteAlternative`).
 *
 * A suíte existe porque a troca mexe em duas coisas ao mesmo tempo — a linha gravada e o
 * índice do candidato em exibição — e a segunda não aparece em nenhuma asserção de banco.
 * Errar o índice não quebra o salvamento: faz a tabela passar a ler outro insumo sozinha,
 * que é o tipo de defeito que só é notado depois de a ficha ir impressa para a cozinha.
 */

import { describe, expect, test } from "vitest"
import { type CandidateRow, promoteAlternative } from "./recipe-candidates"

const row = (): CandidateRow => ({
	ingredient_id: "11111111-1111-4111-8111-111111111111",
	ingredient_name: "Arroz polido",
	measure_unit: "KG",
	folder_id: "aaaaaaaa-1111-4111-8111-111111111111",
	net_quantity: 10,
	alternatives: [
		{ ingredient_id: "22222222-2222-4222-8222-222222222222", ingredient_name: "Arroz parboilizado", measure_unit: "KG", folder_id: null, net_quantity: 9 },
		{ ingredient_id: "33333333-3333-4333-8333-333333333333", ingredient_name: "Arroz integral", measure_unit: "KG", folder_id: null, net_quantity: 8 },
	],
})

describe("promoteAlternative", () => {
	test("troca o substituto com o principal, mantendo as quantidades de cada um", () => {
		const { row: next } = promoteAlternative(row(), 0, 0)

		expect(next.ingredient_id).toBe("22222222-2222-4222-8222-222222222222")
		expect(next.ingredient_name).toBe("Arroz parboilizado")
		expect(next.net_quantity).toBe(9)
		expect(next.alternatives[0]).toEqual({
			ingredient_id: "11111111-1111-4111-8111-111111111111",
			ingredient_name: "Arroz polido",
			measure_unit: "KG",
			folder_id: "aaaaaaaa-1111-4111-8111-111111111111",
			net_quantity: 10,
		})
	})

	test("não mexe na ordem dos demais substitutos", () => {
		const { row: next } = promoteAlternative(row(), 0, 0)

		expect(next.alternatives).toHaveLength(2)
		expect(next.alternatives[1]?.ingredient_id).toBe("33333333-3333-4333-8333-333333333333")
	})

	test("a exibição segue o insumo: quem estava sendo lido continua sendo lido", () => {
		// Lendo o principal (0): ele desceu para a vaga do promovido.
		expect(promoteAlternative(row(), 1, 0).selected).toBe(2)
		// Lendo o promovido: ele subiu para principal.
		expect(promoteAlternative(row(), 1, 2).selected).toBe(0)
		// Lendo um terceiro, que não entrou na troca.
		expect(promoteAlternative(row(), 1, 1).selected).toBe(1)
	})

	test("linha ainda sem insumo: o substituto sobe e não deixa substituto vazio para trás", () => {
		const empty: CandidateRow = { ...row(), ingredient_id: null, ingredient_name: "", measure_unit: "UN", net_quantity: null }

		const { row: next, selected } = promoteAlternative(empty, 0, 1)

		expect(next.ingredient_id).toBe("22222222-2222-4222-8222-222222222222")
		expect(next.alternatives).toHaveLength(1)
		expect(next.alternatives[0]?.ingredient_id).toBe("33333333-3333-4333-8333-333333333333")
		expect(selected).toBe(0)
	})

	test("linha sem insumo: o candidato acima do promovido desce uma casa", () => {
		const empty: CandidateRow = { ...row(), ingredient_id: null, ingredient_name: "", measure_unit: "UN", net_quantity: null }

		expect(promoteAlternative(empty, 0, 2).selected).toBe(1)
	})

	test("índice inexistente devolve a linha intacta", () => {
		const original = row()

		const { row: next, selected } = promoteAlternative(original, 9, 1)

		expect(next).toBe(original)
		expect(selected).toBe(1)
	})
})
