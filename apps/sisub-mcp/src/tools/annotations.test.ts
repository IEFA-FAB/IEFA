import { describe, expect, test } from "bun:test"
import { toolAnnotations, unclassifiedTools } from "./annotations.ts"
import { equipmentTools } from "./equipment.ts"
import { kitchenTools } from "./kitchens.ts"
import { mealTypeTools } from "./meal-types.ts"
import { planningTools } from "./planning.ts"
import { recipeTools } from "./recipes.ts"
import { templateTools } from "./templates.ts"

// Mesma lista que `server.ts` registra.
const allNames = [...planningTools, ...templateTools, ...recipeTools, ...mealTypeTools, ...kitchenTools, ...equipmentTools].map((t) => t.schema.name)

describe("anotações MCP das tools", () => {
	test("toda tool registrada tem classificação explícita", () => {
		// Tool nova sem classificação cairia no default destrutivo — seguro, mas mudo. Aqui ela
		// é obrigada a declarar se lê, cria ou sobrescreve.
		expect(unclassifiedTools(allNames)).toEqual([])
	})

	test("leitura é readOnly; apagar/substituir é destrutivo; criar não é", () => {
		expect(toolAnnotations("list_recipes")).toEqual({ readOnlyHint: true, openWorldHint: false })
		expect(toolAnnotations("apply_template")).toMatchObject({ readOnlyHint: false, destructiveHint: true })
		expect(toolAnnotations("delete_template")).toMatchObject({ readOnlyHint: false, destructiveHint: true })
		expect(toolAnnotations("update_template")).toMatchObject({ readOnlyHint: false, destructiveHint: true })
		expect(toolAnnotations("create_template")).toMatchObject({ readOnlyHint: false, destructiveHint: false })
	})

	test("nome desconhecido cai no pior caso, como manda a especificação", () => {
		expect(toolAnnotations("tool_que_nao_existe")).toMatchObject({ readOnlyHint: false, destructiveHint: true })
		expect(toolAnnotations("__proto__")).toMatchObject({ readOnlyHint: false, destructiveHint: true })
	})
})
