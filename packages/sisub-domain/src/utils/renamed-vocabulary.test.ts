import { describe, expect, test } from "bun:test"
import { DESIGNATION_ROLE_VOCABULARY, DESIGNATION_ROLES } from "../operations/designations.ts"
import { INVENTORY_COUNT_TYPE_VOCABULARY, INVENTORY_COUNT_TYPES } from "../operations/inventory-vocabulary.ts"
import { POLICY_TARGET_VOCABULARY, POLICY_TARGETS, PolicyTargetSchema } from "../schemas/policy-rules.ts"
import { KitchenSelectionSchema } from "../schemas/procurement.ts"
import { TEMPLATE_TYPE_VOCABULARY, TEMPLATE_TYPES, TemplateTypeSchema } from "../schemas/templates.ts"
import { toJsonSchema } from "./json-schema.ts"
import { renamedVocabulary } from "./renamed-vocabulary.ts"

describe("renamedVocabulary", () => {
	const vocabulary = renamedVocabulary(["novo", "igual"], { antigo: "novo" })

	test("lê os dois vocabulários e devolve o do glossário", () => {
		expect(vocabulary.normalize("antigo")).toBe("novo")
		expect(vocabulary.normalize("novo")).toBe("novo")
		expect(vocabulary.normalize("igual")).toBe("igual")
		expect(vocabulary.normalize("outro")).toBeNull()
		expect(vocabulary.normalize(null)).toBeNull()
		expect(vocabulary.is("antigo", "novo")).toBe(true)
	})

	test("grava o antigo até o contract; o valor que não mudou vai como está", () => {
		expect(vocabulary.toStored("novo")).toBe("antigo")
		expect(vocabulary.toStored("igual")).toBe("igual")
	})

	test("filtra pelos dois e aceita os dois na entrada", () => {
		expect(vocabulary.storedValuesOf(["novo", "igual"])).toEqual(["novo", "antigo", "igual"])
		expect(vocabulary.inputValues).toEqual(["novo", "igual", "antigo"])
		expect(() => vocabulary.parse("outro")).toThrow()
	})
})

/**
 * Lote 5 da linguagem ubíqua (D2): valor antigo → valor do glossário. Enquanto o expand vale, a
 * gravação sai com o antigo e a leitura aceita os dois; a volta tem de ser exata, senão uma linha
 * lida e regravada mudaria de valor sem ninguém pedir.
 */
describe("vocabulários do lote 5", () => {
	const cases = [
		{
			vocabulary: DESIGNATION_ROLE_VOCABULARY,
			values: DESIGNATION_ROLES,
			legacy: {
				manager: "gestor",
				technical_inspector: "fiscal_tecnico",
				administrative_inspector: "fiscal_administrativo",
				sectoral_inspector: "fiscal_setorial",
				committee_member: "membro_comissao",
			},
		},
		{
			vocabulary: INVENTORY_COUNT_TYPE_VOCABULARY,
			values: INVENTORY_COUNT_TYPES,
			legacy: { annual: "anual", responsibility_transfer: "transferencia_responsabilidade", eventual: "eventual", rotating: "rotativo" },
		},
		{ vocabulary: POLICY_TARGET_VOCABULARY, values: POLICY_TARGETS, legacy: { product: "ingredient", recipe: "recipe" } },
		{ vocabulary: TEMPLATE_TYPE_VOCABULARY, values: TEMPLATE_TYPES, legacy: { weekly: "weekly", event: "event", exception: "apoio" } },
	] as const

	for (const { vocabulary, values, legacy } of cases) {
		test(values.join(", "), () => {
			for (const [old, current] of Object.entries(legacy)) {
				expect(vocabulary.normalize(old)).toBe(current as never)
				expect(vocabulary.toStored(current as never)).toBe(old)
			}
			for (const value of values) expect(vocabulary.normalize(vocabulary.toStored(value as never))).toBe(value as never)
		})
	}

	test("a entrada aceita o nome antigo e entrega o do glossário", () => {
		expect(TemplateTypeSchema.parse("exception")).toBe("apoio")
		expect(TemplateTypeSchema.parse("apoio")).toBe("apoio")
		expect(PolicyTargetSchema.parse("product")).toBe("ingredient")
		expect(() => TemplateTypeSchema.parse("outro")).toThrow()
	})

	test("o JSON Schema que o modelo lê anuncia só o vocabulário do glossário", () => {
		expect(toJsonSchema(TemplateTypeSchema)).toMatchObject({ enum: ["weekly", "event", "apoio"] })
		expect(toJsonSchema(PolicyTargetSchema)).toMatchObject({ enum: ["ingredient", "recipe"] })
	})

	test("o payload do anexo de uma aba anterior ao deploy não perde os cardápios de apoio", () => {
		const base = { kitchenId: 1, kitchenName: "Cozinha", deliveryNotes: "", templateSelections: [], eventSelections: [] }
		const selection = { templateId: "t", templateName: "Lanche", repetitions: 12 }
		// A chave antiga, como a aba aberta antes do deploy a envia.
		const legacy = KitchenSelectionSchema.parse({ ...base, ["exception" + "Selections"]: [selection] })
		expect(legacy.supportMenuSelections).toEqual([selection])
		expect(legacy).not.toHaveProperty("exception" + "Selections")
		expect(KitchenSelectionSchema.parse({ ...base, supportMenuSelections: [selection] }).supportMenuSelections).toEqual([selection])
		expect(KitchenSelectionSchema.parse(base).supportMenuSelections).toEqual([])
	})
})
