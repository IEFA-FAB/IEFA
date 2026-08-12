import { describe, expect, test } from "bun:test"
import { toJsonSchema } from "@iefa/sisub-domain"
import { AgentListRecipesSchema, MAX_TOOL_RESULT_CHARS } from "@iefa/sisub-domain/agent"
import { kitchenTools } from "./kitchens.ts"
import { mealTypeTools } from "./meal-types.ts"
import { planningTools } from "./planning.ts"
import { recipeTools } from "./recipes.ts"
import { enforceToolResultBudget, toolError, toolResult } from "./shared.ts"
import { templateTools } from "./templates.ts"

const allTools = [...planningTools, ...kitchenTools, ...mealTypeTools, ...recipeTools, ...templateTools]

describe("enforceToolResultBudget", () => {
	test("resultado dentro do teto passa intacto", () => {
		const result = toolResult({ recipes: [{ id: "1", name: "Arroz" }] })
		expect(enforceToolResultBudget("list_recipes", result)).toBe(result)
	})

	test("resultado acima do teto vira erro de tool, não um prompt impossível", () => {
		// `list_recipes` devolvia 10,9 MB (as ~2.000 receitas com ficha técnica): o cliente
		// MCP não tinha como colocar isso num turno.
		const huge = toolResult(Array.from({ length: 3000 }, (_, i) => ({ id: `id-${i}`, description: "x".repeat(200) })))
		expect(huge.content[0]?.text.length).toBeGreaterThan(MAX_TOOL_RESULT_CHARS)

		const limited = enforceToolResultBudget("list_recipes", huge)
		expect(limited.isError).toBe(true)
		expect(limited.content[0]?.text).toContain("list_recipes")
		expect(limited.content[0]?.text).toMatch(/reduza o limit/i)
	})

	test("erro de tool passa direto — a mensagem é curta e já é o diagnóstico", () => {
		const err = toolError("Permissão insuficiente para esta operação")
		expect(enforceToolResultBudget("get_recipe", err)).toBe(err)
	})
})

describe("contrato compartilhado com o chat do sisub", () => {
	test("list_recipes usa o schema de @iefa/sisub-domain/agent", () => {
		// O mesmo schema alimenta a tool do chat (`apps/sisub`). Enquanto cada lado escrevia
		// o seu, os dois divergiam sem quebrar nada — e divergiram.
		const listRecipes = allTools.find((t) => t.schema.name === "list_recipes")
		expect(listRecipes?.schema.inputSchema).toEqual(toJsonSchema(AgentListRecipesSchema))
	})

	test("toda tool anuncia um inputSchema de verdade", () => {
		// Regressão do conversor Zod 3 x Zod 4: `inputSchema` saía `{}` para todas elas.
		const semSchema = allTools.filter((t) => t.schema.inputSchema.type !== "object" || t.schema.inputSchema.properties == null).map((t) => t.schema.name)
		expect(semSchema).toEqual([])
	})

	test("tools sem parâmetro declaram objeto vazio, não schema ausente", () => {
		const listKitchens = allTools.find((t) => t.schema.name === "list_kitchens")
		expect(listKitchens?.schema.inputSchema.type).toBe("object")
		expect(listKitchens?.schema.inputSchema.properties).toEqual({})
	})
})
