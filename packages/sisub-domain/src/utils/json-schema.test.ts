import { describe, expect, test } from "bun:test"
import { AgentListIngredientsSchema, AgentListPreparationsSchema, AgentListRecipesSchema } from "../agent/index.ts"
import { ListRecipesSchema } from "../schemas/recipes.ts"
import { toJsonSchema } from "./json-schema.ts"

/**
 * Regressão do bug mais silencioso desta área: com `zod-to-json-schema` (feito para Zod 3)
 * a conversão de um schema Zod 4 devolvia `{ "$schema": "..." }` — sem `type`, sem
 * `properties`. Toda tool do servidor MCP anunciava "não recebo parâmetro nenhum" e o
 * modelo do outro lado chutava os argumentos. O typecheck não via nada: continuava sendo
 * um objeto.
 */
describe("toJsonSchema", () => {
	const cases = [
		["ListRecipesSchema", ListRecipesSchema, ["kitchenId", "search", "globalOnly", "includeDeleted"]],
		["AgentListRecipesSchema", AgentListRecipesSchema, ["kitchenId", "search", "limit"]],
		["AgentListIngredientsSchema", AgentListIngredientsSchema, ["search", "folderId", "limit"]],
		["AgentListPreparationsSchema", AgentListPreparationsSchema, ["search", "limit"]],
	] as const

	for (const [name, schema, expectedProps] of cases) {
		test(`${name} vira um object com as propriedades declaradas`, () => {
			const json = toJsonSchema(schema)
			expect(json.type).toBe("object")
			expect(Object.keys(json.properties ?? {}).sort()).toEqual([...expectedProps].sort())
		})
	}

	test("mantém as restrições que o modelo precisa respeitar", () => {
		// Opcional é `.nullish()` — o modelo manda `null` para "não informado" —, então o tipo
		// e a faixa ficam num braço do `anyOf`, não no topo. A restrição continua anunciada.
		const limit = toJsonSchema(AgentListRecipesSchema).properties?.limit as {
			description?: string
			anyOf?: { type?: string; maximum?: number }[]
		}
		const numerico = limit.anyOf?.find((branch) => branch.type === "integer")

		expect(numerico?.maximum).toBe(100)
		expect(limit.anyOf?.some((branch) => branch.type === "null")).toBe(true)
		expect(limit.description).toContain("máximo")
	})

	test("é autocontido — cliente MCP não resolve $ref", () => {
		expect(JSON.stringify(toJsonSchema(AgentListRecipesSchema))).not.toContain("$ref")
	})
})
