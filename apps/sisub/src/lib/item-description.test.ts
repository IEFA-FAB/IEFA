import { describe, expect, it } from "vitest"
import { itemDescription, MISSING_ITEM_DESCRIPTION } from "./item-description"

describe("itemDescription", () => {
	it("mantém a descrição, sem os espaços das pontas", () => {
		expect(itemDescription("  Arroz polido  ")).toBe("Arroz polido")
	})

	it.each([null, undefined, "", "   "])("troca %j pelo rótulo único", (value) => {
		expect(itemDescription(value)).toBe(MISSING_ITEM_DESCRIPTION)
	})
})
