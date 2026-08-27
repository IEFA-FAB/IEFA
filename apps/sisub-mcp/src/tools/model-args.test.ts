/**
 * Contrato de argumentos das tools MCP.
 *
 * Aqui o schema Zod não valida a chamada antes do handler — quem parseia é o próprio
 * handler, depois do despacho. O que o despacho garante é que `null` que o schema não
 * declarou não chega até lá: para o Zod, `{ search: null }` e `{}` são coisas diferentes, e
 * só a segunda é o que o modelo quis dizer.
 */

import { describe, expect, test } from "bun:test"
import { dropUnexpectedNulls } from "@iefa/sisub-domain/agent"
import { equipmentTools } from "./equipment.ts"
import { kitchenTools } from "./kitchens.ts"
import { mealTypeTools } from "./meal-types.ts"
import { planningTools } from "./planning.ts"
import { recipeTools } from "./recipes.ts"
import { templateTools } from "./templates.ts"

const allTools = [...planningTools, ...kitchenTools, ...mealTypeTools, ...recipeTools, ...templateTools, ...equipmentTools]

type JsonProp = { type?: unknown; format?: string; enum?: unknown[]; anyOf?: { type?: unknown }[] }

function sampleFor(prop: JsonProp): unknown {
	if (Array.isArray(prop.enum) && prop.enum.length > 0) return prop.enum[0]
	const type = Array.isArray(prop.type) ? prop.type.find((t) => t !== "null") : prop.type
	switch (type) {
		case "number":
		case "integer":
			return 1
		case "boolean":
			return true
		case "array":
			return []
		case "object":
			return {}
		default:
			return prop.format === "uuid" ? "11111111-1111-4111-8111-111111111111" : "2026-01-01"
	}
}

function allowsNull(prop: JsonProp): boolean {
	if (Array.isArray(prop.type) && prop.type.includes("null")) return true
	return Boolean(prop.anyOf?.some((branch) => branch.type === "null"))
}

describe("normalização dos argumentos no despacho", () => {
	test("nenhuma tool entrega ao handler um null que o schema não previu", () => {
		// O modelo preenche o campo que não quer usar com null em vez de omitir.
		const vazamentos: string[] = []

		for (const tool of allTools) {
			const schema = tool.schema.inputSchema as { properties?: Record<string, JsonProp>; required?: string[] }
			const required = new Set(schema.required ?? [])

			const comoOModeloManda = Object.fromEntries(
				Object.entries(schema.properties ?? {}).map(([name, prop]) => [name, required.has(name) ? sampleFor(prop) : null])
			)

			const normalizado = dropUnexpectedNulls(comoOModeloManda, schema)

			for (const [name, value] of Object.entries(normalizado)) {
				if (value === null && !allowsNull(schema.properties?.[name] ?? {})) {
					vazamentos.push(`${tool.schema.name}.${name}`)
				}
			}
		}

		expect(vazamentos).toEqual([])
	})

	test("campo obrigatório sobrevive à normalização", () => {
		// A poda não pode virar um jeito silencioso de perder argumento válido.
		const perdidos: string[] = []

		for (const tool of allTools) {
			const schema = tool.schema.inputSchema as { properties?: Record<string, JsonProp>; required?: string[] }
			const required = schema.required ?? []
			if (required.length === 0) continue

			const args = Object.fromEntries(required.map((name) => [name, sampleFor(schema.properties?.[name] ?? {})]))
			const normalizado = dropUnexpectedNulls(args, schema)

			for (const name of required) {
				if (!(name in normalizado)) perdidos.push(`${tool.schema.name}.${name}`)
			}
		}

		expect(perdidos).toEqual([])
	})
})
