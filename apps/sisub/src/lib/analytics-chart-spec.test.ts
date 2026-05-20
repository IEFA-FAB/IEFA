import { describe, expect, test } from "vitest"
import { extractJsonFromSpec } from "./analytics-chart-spec"

describe("extractJsonFromSpec", () => {
	test("extrai JSON puro", () => {
		const json = extractJsonFromSpec('{"type":"bar","sql":"SELECT * FROM recipes LIMIT 1"}')

		expect(JSON.parse(json)).toEqual({ type: "bar", sql: "SELECT * FROM recipes LIMIT 1" })
	})

	test("extrai JSON dentro de fence json aninhado", () => {
		const json = extractJsonFromSpec(`
			\`\`\`json
			{
				"type": "line",
				"sql": "SELECT * FROM daily_menu LIMIT 1"
			}
			\`\`\`
		`)

		expect(JSON.parse(json).type).toBe("line")
	})

	test("remove vírgulas finais emitidas pelo modelo", () => {
		const json = extractJsonFromSpec(`
			Antes do JSON
			{
				"type": "bar",
				"series": [
					{ "key": "total", "label": "Total", },
				],
				"sql": "SELECT * FROM recipes LIMIT 1",
			}
			Depois do JSON
		`)

		expect(JSON.parse(json)).toEqual({
			type: "bar",
			series: [{ key: "total", label: "Total" }],
			sql: "SELECT * FROM recipes LIMIT 1",
		})
	})

	test("escapa quebras de linha e tabs literais dentro de strings JSON", () => {
		const json = extractJsonFromSpec(`{
			"type": "bar",
			"description": "linha 1
			linha 2	com tab",
			"sql": "SELECT * FROM recipes LIMIT 1"
		}`)

		expect(JSON.parse(json).description).toContain("linha 2")
	})

	test("lança SyntaxError quando não há objeto JSON", () => {
		expect(() => extractJsonFromSpec("sem json")).toThrow(SyntaxError)
	})
})
