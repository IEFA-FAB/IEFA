/**
 * Unit — utilitários GTIN (GS1): normalização, check digit e hierarquia de
 * embalagem. Puro (sem DB). O banco valida só formato (^[0-9]{14}$); o dígito
 * verificador é responsabilidade destes utils — daí a cobertura exaustiva.
 */
import { type GtinHierarchyNode, hasValidCheckDigit, normalizeGtin, parseGtin, resolveGtinContent, SEM_GTIN } from "@iefa/sisub-domain"
import { describe, expect, test } from "vitest"

describe("normalizeGtin", () => {
	test("GTIN-13 (EAN) ganha um zero à esquerda", () => {
		expect(normalizeGtin("7891000315507")).toBe("07891000315507")
	})

	test("GTIN-8 ganha seis zeros", () => {
		expect(normalizeGtin("40170725")).toBe("00000040170725")
	})

	test("GTIN-12 (UPC-A) ganha dois zeros", () => {
		expect(normalizeGtin("036000291452")).toBe("00036000291452")
	})

	test("GTIN-14 passa intacto", () => {
		expect(normalizeGtin("17891000315504")).toBe("17891000315504")
	})

	test("espaços nas bordas são tolerados", () => {
		expect(normalizeGtin("  7891000315507  ")).toBe("07891000315507")
	})

	test('literal "SEM GTIN" da NF-e vira null (case-insensitive)', () => {
		expect(normalizeGtin(SEM_GTIN)).toBeNull()
		expect(normalizeGtin("sem gtin")).toBeNull()
	})

	test("comprimentos inválidos viram null (9, 10, 11 e 15 dígitos)", () => {
		expect(normalizeGtin("123456789")).toBeNull()
		expect(normalizeGtin("1234567890")).toBeNull()
		expect(normalizeGtin("12345678901")).toBeNull()
		expect(normalizeGtin("123456789012345")).toBeNull()
	})

	test("não-dígitos, vazio, null e undefined viram null", () => {
		expect(normalizeGtin("78910003155A7")).toBeNull()
		expect(normalizeGtin("")).toBeNull()
		expect(normalizeGtin(null)).toBeNull()
		expect(normalizeGtin(undefined)).toBeNull()
	})
})

describe("hasValidCheckDigit", () => {
	test("EAN-13 real normalizado é válido", () => {
		// 7891000315507 (Nescau) — dígito 7 confere
		expect(hasValidCheckDigit("07891000315507")).toBe(true)
	})

	test("um dígito trocado invalida", () => {
		expect(hasValidCheckDigit("07891000315508")).toBe(false)
		expect(hasValidCheckDigit("07891000315506")).toBe(false)
	})

	test("caso de soma múltipla de 10 → dígito 0", () => {
		// 0000000000000 → soma 0 → check 0
		expect(hasValidCheckDigit("00000000000000")).toBe(true)
	})

	test("entrada fora do formato 14 dígitos é falsa (não lança)", () => {
		expect(hasValidCheckDigit("7891000315507")).toBe(false)
		expect(hasValidCheckDigit("abcdefghijklmn")).toBe(false)
		expect(hasValidCheckDigit("")).toBe(false)
	})
})

describe("parseGtin", () => {
	test("normaliza e valida em um passo", () => {
		expect(parseGtin("7891000315507")).toBe("07891000315507")
	})

	test("check digit errado → null", () => {
		expect(parseGtin("7891000315508")).toBeNull()
	})

	test("SEM GTIN → null", () => {
		expect(parseGtin("SEM GTIN")).toBeNull()
	})
})

describe("resolveGtinContent", () => {
	// Hierarquia: caixa (DUN-14) contém 12 unidades de 1 kg.
	// parent_gtin aponta da UNIDADE para a CAIXA.
	const box: GtinHierarchyNode = {
		gtin: "17891000315504",
		parentGtin: null,
		unitsPerParent: null,
		netContent: null,
		netContentUnit: null,
	}
	const unit: GtinHierarchyNode = {
		gtin: "07891000315507",
		parentGtin: "17891000315504",
		unitsPerParent: 12,
		netContent: 1,
		netContentUnit: "KG",
	}

	test("escanear a caixa resolve até a unidade: 12 × 1 KG", () => {
		const result = resolveGtinContent("17891000315504", [box, unit])
		expect(result).toEqual({
			leafGtin: "07891000315507",
			leafUnitsPerScanned: 12,
			totalNetContent: 12,
			netContentUnit: "KG",
		})
	})

	test("escanear a própria unidade: fator 1", () => {
		const result = resolveGtinContent("07891000315507", [box, unit])
		expect(result).toEqual({
			leafGtin: "07891000315507",
			leafUnitsPerScanned: 1,
			totalNetContent: 1,
			netContentUnit: "KG",
		})
	})

	test("três níveis multiplicam os fatores (pallet → caixa → unidade)", () => {
		const pallet: GtinHierarchyNode = { gtin: "27891000315501", parentGtin: null, unitsPerParent: null, netContent: null, netContentUnit: null }
		const boxOnPallet: GtinHierarchyNode = { ...box, parentGtin: "27891000315501", unitsPerParent: 10 }
		const result = resolveGtinContent("27891000315501", [pallet, boxOnPallet, unit])
		expect(result?.leafUnitsPerScanned).toBe(120)
		expect(result?.totalNetContent).toBe(120)
	})

	test("folha sem conteúdo líquido → totalNetContent null (fator preservado)", () => {
		const bareUnit = { ...unit, netContent: null, netContentUnit: null }
		const result = resolveGtinContent("17891000315504", [box, bareUnit])
		expect(result?.leafUnitsPerScanned).toBe(12)
		expect(result?.totalNetContent).toBeNull()
	})

	test("GTIN fora do subgrafo → null", () => {
		expect(resolveGtinContent("99999999999994", [box, unit])).toBeNull()
	})

	test("embalagem mista (dois filhos) para no nível atual", () => {
		const otherUnit: GtinHierarchyNode = { gtin: "07891000315514", parentGtin: "17891000315504", unitsPerParent: 6, netContent: 2, netContentUnit: "KG" }
		const result = resolveGtinContent("17891000315504", [box, unit, otherUnit])
		expect(result?.leafGtin).toBe("17891000315504")
		expect(result?.leafUnitsPerScanned).toBe(1)
	})

	test("ciclo na hierarquia → null (não trava)", () => {
		const a: GtinHierarchyNode = { gtin: "17891000315504", parentGtin: "07891000315507", unitsPerParent: 1, netContent: null, netContentUnit: null }
		const b: GtinHierarchyNode = { ...unit }
		expect(resolveGtinContent("17891000315504", [a, b])).toBeNull()
	})
})
