/**
 * Contrato de entrada das leituras expostas a modelo.
 *
 * O teste central aqui é o do `null`: com `.optional()` puro, `{"search": null}` — que é o
 * que um modelo manda quando não quer filtrar — era rejeitado, e a rejeição escalava para
 * `tool_use_failed` no provider, matando a conversa inteira. Cada caso abaixo tem um
 * equivalente observado numa chamada real.
 */

import { describe, expect, test } from "bun:test"
import { toJsonSchema } from "../utils/json-schema.ts"
import { AGENT_LIST_MAX } from "./budget.ts"
import { AgentListIngredientsSchema, AgentListPreparationsSchema, AgentListRecipesSchema } from "./schemas.ts"

const SCHEMAS = [
	["AgentListRecipesSchema", AgentListRecipesSchema],
	["AgentListIngredientsSchema", AgentListIngredientsSchema],
	["AgentListPreparationsSchema", AgentListPreparationsSchema],
] as const

describe("schemas de agente — o que o modelo realmente manda", () => {
	for (const [name, schema] of SCHEMAS) {
		test(`${name} aceita chamada sem argumento nenhum`, () => {
			expect(schema.safeParse({}).success).toBe(true)
		})

		test(`${name} aceita null em todo campo opcional`, () => {
			// Payload real do llama-3.3 em list_recipes: {"limit":2,"search":null}
			const todosNulos = Object.fromEntries(Object.keys(schema.shape).map((key) => [key, null]))
			const result = schema.safeParse(todosNulos)
			expect(result.success).toBe(true)
		})

		test(`${name} continua rejeitando tipo errado que não seja null`, () => {
			// A tolerância é só ao null. Tipo errado tem que virar erro de tool legível —
			// é assim que o modelo aprende a refazer a chamada.
			expect(schema.safeParse({ limit: "muitos" }).success).toBe(false)
		})
	}

	test("limit respeita a faixa declarada", () => {
		expect(AgentListRecipesSchema.safeParse({ limit: 0 }).success).toBe(false)
		expect(AgentListRecipesSchema.safeParse({ limit: AGENT_LIST_MAX + 1 }).success).toBe(false)
		expect(AgentListRecipesSchema.safeParse({ limit: AGENT_LIST_MAX }).success).toBe(true)
	})

	test("search tem teto de tamanho — prompt injection por busca gigante não passa", () => {
		expect(AgentListRecipesSchema.safeParse({ search: "x".repeat(201) }).success).toBe(false)
	})

	test("folderId exige UUID", () => {
		expect(AgentListIngredientsSchema.safeParse({ folderId: "não-é-uuid" }).success).toBe(false)
		expect(AgentListIngredientsSchema.safeParse({ folderId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true)
	})
})

describe("JSON Schema publicado para o modelo", () => {
	test("todo campo opcional anuncia que aceita null", () => {
		// O schema publicado é o que o provider mostra ao modelo. Se ele diz `string` e o
		// engine aceita null, os dois lados discordam — e é o modelo que paga.
		for (const [name, schema] of SCHEMAS) {
			const json = toJsonSchema(schema) as { properties: Record<string, { anyOf?: { type?: string }[]; type?: unknown }>; required?: string[] }
			const required = new Set(json.required ?? [])

			for (const [prop, definition] of Object.entries(json.properties)) {
				if (required.has(prop)) continue
				const aceitaNull =
					definition.anyOf?.some((branch) => branch.type === "null") || (Array.isArray(definition.type) && (definition.type as string[]).includes("null"))
				expect(`${name}.${prop} aceita null: ${aceitaNull}`).toBe(`${name}.${prop} aceita null: true`)
			}
		}
	})

	test("nenhum campo é obrigatório — listagem sem filtro é chamada válida", () => {
		for (const [, schema] of SCHEMAS) {
			const json = toJsonSchema(schema) as { required?: string[] }
			expect(json.required ?? []).toEqual([])
		}
	})
})
