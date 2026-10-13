import { describe, expect, test } from "bun:test"
import {
	allowedChildKinds,
	buildAddress,
	canNest,
	canSupply,
	flattenPositionTree,
	handlingUnitInputSchema,
	holdsStock,
	isValidGln,
	isValidGs1Key,
	isValidSscc,
	type PositionRow,
	positionInputSchema,
	stockLocationSettingsSchema,
} from "./addressing.ts"

describe("níveis e abastecedor", () => {
	test("só nível menor abastece; o nível 1 não tem abastecedor", () => {
		expect(canSupply(1, 2)).toBe(true)
		expect(canSupply(1, 3)).toBe(true)
		expect(canSupply(2, 3)).toBe(true)
		expect(canSupply(2, 2)).toBe(false)
		expect(canSupply(3, 2)).toBe(false)
		expect(canSupply(1, 1)).toBe(false)
	})

	test("o schema recusa abastecedor no depósito central e GLN com verificador errado", () => {
		const base = { name: "Depósito", level: 1 as const, suppliedByLocationId: null, receivesDirect: true, usesPositions: true, gln: null }
		expect(stockLocationSettingsSchema.safeParse(base).success).toBe(true)
		expect(stockLocationSettingsSchema.safeParse({ ...base, suppliedByLocationId: 4 }).success).toBe(false)
		expect(stockLocationSettingsSchema.safeParse({ ...base, gln: "7891234567895" }).success).toBe(true)
		expect(stockLocationSettingsSchema.safeParse({ ...base, gln: "7891234567890" }).success).toBe(false)
		expect(stockLocationSettingsSchema.parse({ ...base, gln: "" }).gln).toBeNull()
	})
})

describe("posições", () => {
	test("a filha é mais funda que a mãe; a raiz é livre", () => {
		expect(canNest(null, "shelf")).toBe(true)
		expect(canNest("rack", "shelf")).toBe(true)
		expect(canNest("shelf", "rack")).toBe(false)
		expect(canNest("shelf", "shelf")).toBe(false)
		expect(allowedChildKinds("rack")).toEqual(["shelf", "bin"])
		expect(allowedChildKinds("bin")).toEqual([])
	})

	test("só prateleira e escaninho guardam estoque", () => {
		expect(holdsStock("shelf")).toBe(true)
		expect(holdsStock("bin")).toBe(true)
		expect(holdsStock("rack")).toBe(false)
	})

	test("o endereço é o caminho", () => {
		expect(buildAddress(null, "D1")).toBe("D1")
		expect(buildAddress("D1-S2-E05", "P3")).toBe("D1-S2-E05-P3")
	})

	test("corredor e tipo só na estante; código só com letras e dígitos", () => {
		const base = { locationId: 1, parentId: null, kind: "rack" as const, code: "E05", aisle: 3, rackType: "porta-pallet", pickingSequence: 10 }
		expect(positionInputSchema.safeParse(base).success).toBe(true)
		expect(positionInputSchema.safeParse({ ...base, kind: "shelf" }).success).toBe(false)
		expect(positionInputSchema.safeParse({ ...base, code: "E-05" }).success).toBe(false)
	})

	test("a árvore achatada põe a mãe antes das filhas e ordena irmãs pela separação", () => {
		const rows: PositionRow[] = [
			{ id: 3, parentId: 1, kind: "rack", code: "E2", address: "S1-E2", pickingSequence: 2 },
			{ id: 1, parentId: null, kind: "sector", code: "S1", address: "S1", pickingSequence: null },
			{ id: 2, parentId: 1, kind: "rack", code: "E1", address: "S1-E1", pickingSequence: 5 },
			{ id: 4, parentId: 2, kind: "shelf", code: "P1", address: "S1-E1-P1", pickingSequence: null },
			// mãe desativada (fora da lista): entra como raiz
			{ id: 9, parentId: 99, kind: "shelf", code: "P9", address: "X-P9", pickingSequence: null },
		]
		expect(flattenPositionTree(rows).map((node) => [node.address, node.depth])).toEqual([
			["S1", 0],
			["S1-E2", 1],
			["S1-E1", 1],
			["S1-E1-P1", 2],
			["X-P9", 0],
		])
	})
})

describe("chaves GS1", () => {
	test("dígito verificador de módulo 10", () => {
		// exemplo do GS1 General Specifications: GTIN-13 4006381333931
		expect(isValidGs1Key("4006381333931")).toBe(true)
		expect(isValidGs1Key("4006381333932")).toBe(false)
		expect(isValidGs1Key("40063813339A1")).toBe(false)
	})

	test("SSCC tem 18 dígitos; GLN tem 13", () => {
		expect(isValidSscc("106141411234567897")).toBe(true)
		expect(isValidSscc("106141411234567890")).toBe(false)
		expect(isValidSscc("4006381333931")).toBe(false)
		expect(isValidGln("4006381333931")).toBe(true)
	})

	test("a caixa exige SSCC válido e lote; o pallet, GIAI", () => {
		const box = {
			kind: "box" as const,
			locationId: 1,
			code: "106141411234567897",
			lotId: "00000000-0000-4000-8000-000000000001",
			palletId: null,
			positionId: 4,
			quantity: 12,
			weightKg: null,
			boxCategory: "CX-G",
		}
		expect(handlingUnitInputSchema.safeParse(box).success).toBe(true)
		expect(handlingUnitInputSchema.safeParse({ ...box, code: "106141411234567890" }).success).toBe(false)
		expect(handlingUnitInputSchema.safeParse({ kind: "pallet", locationId: 1, code: "PLT-0001", positionId: null, weightKg: 300 }).success).toBe(true)
		expect(handlingUnitInputSchema.safeParse({ kind: "pallet", locationId: 1, code: "P 1", positionId: null, weightKg: null }).success).toBe(false)
	})
})
