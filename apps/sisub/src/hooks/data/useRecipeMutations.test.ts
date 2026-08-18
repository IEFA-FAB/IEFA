/**
 * Mapeamento formulário → payload do server fn (`mapIngredients`).
 *
 * Guarda contra a classe de bug que deixou os substitutos sem chegar ao banco: o
 * formulário montava, o domínio sabia gravar, e o mapeamento entre os dois descartava o
 * campo em silêncio. Nada pegava — o objeto vem de variável (sem checagem de propriedade
 * excedente no TypeScript) e os testes de integração chamam as operations direto.
 *
 * A regra que a suíte impõe: todo campo que a linha do formulário carrega tem que
 * aparecer no payload.
 */

import { describe, expect, test } from "vitest"
import { mapIngredients } from "./useRecipeMutations"

const line = {
	ingredient_id: "11111111-1111-4111-8111-111111111111",
	net_quantity: 2,
	is_optional: false,
	priority_order: 0,
}

describe("mapIngredients", () => {
	test("converte a linha para camelCase", () => {
		expect(mapIngredients([line])).toEqual([
			{
				ingredientId: line.ingredient_id,
				netQuantity: 2,
				isOptional: false,
				priorityOrder: 0,
				correctionFactor: null,
				rehydrationIndex: null,
				alternatives: undefined,
			},
		])
	})

	test("leva os substitutos junto — o campo que sumia", () => {
		const mapped = mapIngredients([
			{
				...line,
				alternatives: [{ ingredient_id: "22222222-2222-4222-8222-222222222222", net_quantity: 1.6, priority_order: 0 }],
			},
		])
		expect(mapped?.[0].alternatives).toEqual([{ ingredientId: "22222222-2222-4222-8222-222222222222", netQuantity: 1.6, priorityOrder: 0 }])
	})

	test("todo campo da linha aparece no payload", () => {
		// Sentinela da classe de bug: campo novo no formulário sem tradução aqui reprova.
		const mapped = mapIngredients([{ ...line, correction_factor: 1.33, rehydration_index: 2.5, alternatives: [] }])
		expect(Object.keys(mapped?.[0] ?? {}).toSorted()).toEqual(
			["alternatives", "correctionFactor", "ingredientId", "isOptional", "netQuantity", "priorityOrder", "rehydrationIndex"].toSorted()
		)
	})

	test("lista ausente continua ausente (o server fn trata como omitida)", () => {
		expect(mapIngredients(undefined)).toBeUndefined()
	})
})
