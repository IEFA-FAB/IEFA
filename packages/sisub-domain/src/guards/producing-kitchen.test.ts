/**
 * Contrato de `resolveProducingKitchen`.
 *
 * `core.kitchen` sempre soube quem cozinha para quem (`type` + `kitchen_id`), e nada no sisub
 * usava. Para equipamento isso decide a pergunta inteira: checar o parque de um refeitório
 * servido por cozinha central responde sobre a cozinha errada — o refeitório não tem forno.
 *
 * Os casos aqui existem porque o campo é preenchido à mão no PlacesManager: ausente, apontando
 * para si mesma, ou marcado em cozinha que não é de consumo. Nenhum deles pode explodir nem
 * mudar o comportamento de quem produz o próprio cardápio.
 */

import { describe, expect, test } from "bun:test"
import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { NotFoundError } from "../types/errors.ts"
import { resolveProducingKitchen } from "./validate-scope.ts"

function fakeDb(row: { type: string | null; kitchenId: number | null } | undefined) {
	return { query: { kitchenInKitchen: { findFirst: () => Promise.resolve(row) } } } as unknown as SisubDb
}

describe("resolveProducingKitchen", () => {
	test("cozinha de produção cozinha nela mesma", async () => {
		const result = await resolveProducingKitchen(fakeDb({ type: "production", kitchenId: null }), 7)
		expect(result).toEqual({ producingKitchenId: 7, delegated: false })
	})

	test("cozinha de consumo servida por outra delega a produção", async () => {
		const result = await resolveProducingKitchen(fakeDb({ type: "consumption", kitchenId: 3 }), 7)
		expect(result).toEqual({ producingKitchenId: 3, delegated: true })
	})

	test("consumo SEM produtora definida cozinha nela mesma (dado ausente não muda nada)", async () => {
		const result = await resolveProducingKitchen(fakeDb({ type: "consumption", kitchenId: null }), 7)
		expect(result).toEqual({ producingKitchenId: 7, delegated: false })
	})

	test("ponteiro para si mesma não vira delegação", async () => {
		const result = await resolveProducingKitchen(fakeDb({ type: "consumption", kitchenId: 7 }), 7)
		expect(result).toEqual({ producingKitchenId: 7, delegated: false })
	})

	test("ponteiro em cozinha de PRODUÇÃO é ignorado — ela é o fim da linha", async () => {
		const result = await resolveProducingKitchen(fakeDb({ type: "production", kitchenId: 3 }), 7)
		expect(result).toEqual({ producingKitchenId: 7, delegated: false })
	})

	test("tipo nulo (base antiga) cozinha nela mesma", async () => {
		const result = await resolveProducingKitchen(fakeDb({ type: null, kitchenId: 3 }), 7)
		expect(result).toEqual({ producingKitchenId: 7, delegated: false })
	})

	test("cozinha inexistente é NotFound, não silêncio", async () => {
		await expect(resolveProducingKitchen(fakeDb(undefined), 7)).rejects.toBeInstanceOf(NotFoundError)
	})
})
