import { describe, expect, test } from "bun:test"
import { DomainError } from "../types/errors.ts"
import { buildAgentRecipeEdit } from "./recipes.ts"

const RECIPE = "11111111-1111-4111-8111-111111111111"
const RICE = "22222222-2222-4222-8222-222222222222"
const BEANS = "33333333-3333-4333-8333-333333333333"
const OIL = "44444444-4444-4444-8444-444444444444"

type Base = Parameters<typeof buildAgentRecipeEdit>[0]

function base(overrides: Record<string, unknown> = {}): Base {
	return {
		id: RECIPE,
		name: "Arroz",
		kitchen_id: null,
		version: 3,
		preparation_method: "Refogar e cozinhar",
		pre_preparation_method: null,
		portion_yield: 100,
		preparation_time_minutes: 40,
		pre_preparation_time_minutes: null,
		cooking_time_minutes: 25,
		cooking_method: "calor úmido",
		cooking_temperature_celsius: null,
		cooking_factor: 2.5,
		rational_id: null,
		folder_id: "55555555-5555-4555-8555-555555555555",
		ingredients: [
			{
				ingredient_id: RICE,
				net_quantity: 10,
				is_optional: false,
				priority_order: 0,
				correction_factor: 1.02,
				rehydration_index: null,
				deleted_at: null,
				alternatives: [{ ingredient_id: BEANS, net_quantity: 8, priority_order: 5 }],
			},
			{ ingredient_id: OIL, net_quantity: 0.2, is_optional: true, priority_order: 1, correction_factor: null, rehydration_index: null, deleted_at: null },
			// Linha apagada não vai para a versão nova.
			{ ingredient_id: BEANS, net_quantity: 3, is_optional: false, priority_order: 2, deleted_at: "2026-09-01T00:00:00Z" },
		],
		...overrides,
	} as unknown as Base
}

describe("buildAgentRecipeEdit — a versão nova é a ficha inteira com os campos do agente por cima", () => {
	test("preserva a ficha e troca só o que o agente pediu, partindo da versão lida", () => {
		const edit = buildAgentRecipeEdit(base(), { recipeId: RECIPE, cookingFactor: 2.2 })

		expect(edit.baseRecipeId).toBe(RECIPE)
		expect(edit.context).toEqual({ scope: "global" })
		expect(edit).toMatchObject({
			name: "Arroz",
			preparationMethod: "Refogar e cozinhar",
			portionYield: 100,
			preparationTimeMinutes: 40,
			cookingTimeMinutes: 25,
			cookingMethod: "calor úmido",
			cookingFactor: 2.2,
		})
		// Pasta omitida: `saveRecipeEdit` preserva a da base.
		expect(edit.folderId).toBeUndefined()
		expect(edit.ingredients).toEqual([
			{
				ingredientId: RICE,
				netQuantity: 10,
				isOptional: false,
				priorityOrder: 0,
				correctionFactor: 1.02,
				rehydrationIndex: null,
				alternatives: [{ ingredientId: BEANS, netQuantity: 8, priorityOrder: 0 }],
			},
			{ ingredientId: OIL, netQuantity: 0.2, isOptional: true, priorityOrder: 1, correctionFactor: null, rehydrationIndex: null, alternatives: [] },
		])
	})

	test("nome e tempo de preparo também", () => {
		const edit = buildAgentRecipeEdit(base(), { recipeId: RECIPE, name: "Arroz à grega", preparationTimeMinutes: 0 })
		expect(edit).toMatchObject({ name: "Arroz à grega", preparationTimeMinutes: 0, cookingFactor: 2.5 })
	})

	test("linha de preparação congelada é recusada em vez de sumir da versão nova", () => {
		const withFrozen = base({ ingredients: [{ ingredient_id: null, frozen_preparation_id: RICE, net_quantity: 1, priority_order: 0, deleted_at: null }] })
		expect(() => buildAgentRecipeEdit(withFrozen, { recipeId: RECIPE, name: "X" })).toThrow(DomainError)
	})

	test("ficha fora do que a tela aceita (rendimento vazio) é recusada com mensagem legível", () => {
		try {
			buildAgentRecipeEdit(base({ portion_yield: null }), { recipeId: RECIPE, name: "X" })
			throw new Error("deveria ter recusado")
		} catch (error) {
			expect(error).toBeInstanceOf(DomainError)
			expect((error as DomainError).code).toBe("AGENT_EDIT_UNSUPPORTED")
			expect((error as Error).message).toMatch(/tela de preparações/)
		}
	})
})
