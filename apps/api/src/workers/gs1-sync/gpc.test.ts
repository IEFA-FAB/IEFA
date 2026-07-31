import { describe, expect, test } from "bun:test"
import { parseGpcPublication } from "./gpc.ts"

const publication = {
	Schema: [
		{
			Code: "50000000",
			Description: "Food/Beverage/Tobacco",
			Childs: [
				{
					Code: "50220000",
					Description: "Cereal/Grain/Pulse Products",
					Childs: [
						{
							Code: "50221200",
							Description: "Processed Cereal Products",
							Childs: [
								{ Code: "10000610", Description: "Rice", Childs: [{ Code: "20000123", Description: "Attribute — ignorado" }] },
								{ Code: "10000611", Description: "Pasta/Noodles" },
							],
						},
					],
				},
			],
		},
	],
}

describe("parseGpcPublication", () => {
	test("achata Segment→Family→Class→Brick e ignora níveis abaixo do brick", () => {
		const rows = parseGpcPublication(publication)
		expect(rows).toHaveLength(2)
		expect(rows[0]).toEqual({
			brick_code: "10000610",
			brick_title: "Rice",
			class_code: "50221200",
			class_title: "Processed Cereal Products",
			family_code: "50220000",
			family_title: "Cereal/Grain/Pulse Products",
			segment_code: "50000000",
			segment_title: "Food/Beverage/Tobacco",
		})
	})

	test("aceita array na raiz e chaves em minúsculas (variação de export)", () => {
		const lowercase = [
			{
				code: "50000000",
				description: "Seg",
				children: [{ code: "F", description: "Fam", childs: [{ code: "C", description: "Cls", children: [{ code: "B", description: "Brick" }] }] }],
			},
		]
		const rows = parseGpcPublication(lowercase)
		expect(rows).toHaveLength(1)
		expect(rows[0]?.brick_code).toBe("B")
		expect(rows[0]?.segment_title).toBe("Seg")
	})

	test("nós malformados são pulados sem lançar", () => {
		const rows = parseGpcPublication({ Schema: [null, 42, { Code: "X" }, { Description: "sem code" }] })
		expect(rows).toHaveLength(0)
	})

	test("entrada não reconhecida produz lista vazia", () => {
		expect(parseGpcPublication(null)).toHaveLength(0)
		expect(parseGpcPublication("string")).toHaveLength(0)
		expect(parseGpcPublication({})).toHaveLength(0)
	})

	test("reimportação é determinística (mesma entrada, mesma saída)", () => {
		expect(parseGpcPublication(publication)).toEqual(parseGpcPublication(publication))
	})
})
