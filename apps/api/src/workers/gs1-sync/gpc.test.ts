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
								{
									Code: "10000610",
									Description: "Rice",
									Childs: [
										{
											Code: "20000045",
											Description: "Estado de conservação",
											Childs: [
												{ Code: "30002960", Description: "Congelado" },
												{ Code: "30002961", Description: "Resfriado" },
											],
										},
									],
								},
								{
									Code: "10000611",
									Description: "Pasta/Noodles",
									// Mesmo atributo em outro brick: dedupe por código, vínculo por par.
									Childs: [{ Code: "20000045", Description: "Estado de conservação", Childs: [{ Code: "30002960", Description: "Congelado" }] }],
								},
							],
						},
					],
				},
			],
		},
		{
			Code: "47000000",
			Description: "Cleaning/Hygiene Products",
			Childs: [
				{
					Code: "47100000",
					Description: "Cleaning",
					Childs: [{ Code: "47101800", Description: "Detergents", Childs: [{ Code: "10000900", Description: "Detergent" }] }],
				},
			],
		},
	],
}

describe("parseGpcPublication", () => {
	test("achata Segment→Family→Class→Brick", () => {
		const { bricks } = parseGpcPublication(publication)
		expect(bricks).toHaveLength(3)
		expect(bricks[0]).toEqual({
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

	test("atributos e valores deixam de ser descartados", () => {
		// Eram ignorados até 20260901120300 — sem eles não há como expressar
		// "estado de conservação: congelado OU resfriado" nem verificar um GTIN.
		const { attributes, attributeValues } = parseGpcPublication(publication)
		expect(attributes).toEqual([{ attribute_code: "20000045", attribute_title: "Estado de conservação" }])
		expect(attributeValues).toEqual([
			{ value_code: "30002960", value_title: "Congelado", attribute_code: "20000045" },
			{ value_code: "30002961", value_title: "Resfriado", attribute_code: "20000045" },
		])
	})

	test("atributo repetido em vários bricks é deduplicado, mas o vínculo é por par", () => {
		// O mesmo "Estado de conservação" aparece em dezenas de bricks: gravar um
		// por ocorrência estouraria a PK na primeira reimportação.
		const { attributes, brickAttributes } = parseGpcPublication(publication)
		expect(attributes).toHaveLength(1)
		expect(brickAttributes).toEqual([
			{ brick_code: "10000610", attribute_code: "20000045" },
			{ brick_code: "10000611", attribute_code: "20000045" },
		])
	})

	test("segmentCodes recorta a taxonomia", () => {
		const { bricks } = parseGpcPublication(publication, { segmentCodes: ["50000000"] })
		expect(bricks.map((brick) => brick.brick_code)).toEqual(["10000610", "10000611"])
	})

	test("recortar por alimentos deixa os auxiliares de fora — e isso tem custo", () => {
		// EPI, limpeza e embalagem são 168 insumos do catálogo e NÃO caem no
		// segmento de alimentos. Importar só 50000000 os deixa sem classificação.
		const somenteAlimentos = parseGpcPublication(publication, { segmentCodes: ["50000000"] })
		expect(somenteAlimentos.bricks.some((brick) => brick.segment_code === "47000000")).toBe(false)

		const comLimpeza = parseGpcPublication(publication, { segmentCodes: ["50000000", "47000000"] })
		expect(comLimpeza.bricks).toHaveLength(3)
	})

	test("segmentCodes vazio importa tudo", () => {
		expect(parseGpcPublication(publication, { segmentCodes: [] }).bricks).toHaveLength(3)
	})

	test("segmento inexistente devolve vazio em vez de importar tudo por engano", () => {
		expect(parseGpcPublication(publication, { segmentCodes: ["99999999"] }).bricks).toHaveLength(0)
	})

	test("aceita array na raiz e chaves em minúsculas (variação de export)", () => {
		const lowercase = [
			{
				code: "50000000",
				description: "Seg",
				children: [{ code: "F", description: "Fam", childs: [{ code: "C", description: "Cls", children: [{ code: "B", description: "Brick" }] }] }],
			},
		]
		const { bricks } = parseGpcPublication(lowercase)
		expect(bricks).toHaveLength(1)
		expect(bricks[0]?.brick_code).toBe("B")
		expect(bricks[0]?.segment_title).toBe("Seg")
	})

	test("nós malformados são pulados sem lançar", () => {
		const { bricks } = parseGpcPublication({ Schema: [null, 42, { Code: "X" }, { Description: "sem code" }] })
		expect(bricks).toHaveLength(0)
	})

	test("entrada não reconhecida produz publicação vazia", () => {
		for (const input of [null, "string", {}]) {
			const parsed = parseGpcPublication(input)
			expect(parsed.bricks).toHaveLength(0)
			expect(parsed.attributes).toHaveLength(0)
		}
	})

	test("reimportação é determinística (mesma entrada, mesma saída)", () => {
		expect(parseGpcPublication(publication)).toEqual(parseGpcPublication(publication))
	})
})
