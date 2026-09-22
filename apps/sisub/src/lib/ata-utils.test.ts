import { describe, expect, test } from "vitest"
import { hasSuspiciousUnitConversion } from "./ata-utils"

describe("hasSuspiciousUnitConversion", () => {
	test("unidades diferentes com fator 1 é suspeito", () => {
		expect(hasSuspiciousUnitConversion({ measure_unit: "UN", purchase_measure_unit: "KG", conversion_factor: 1 })).toBe(true)
		expect(hasSuspiciousUnitConversion({ measure_unit: "un", purchase_measure_unit: "KG", conversion_factor: null })).toBe(true)
	})

	test("fator configurado, mesma unidade ou unidade ausente não é", () => {
		expect(hasSuspiciousUnitConversion({ measure_unit: "G", purchase_measure_unit: "KG", conversion_factor: 1000 })).toBe(false)
		expect(hasSuspiciousUnitConversion({ measure_unit: "kg", purchase_measure_unit: "KG ", conversion_factor: 1 })).toBe(false)
		expect(hasSuspiciousUnitConversion({ measure_unit: "KG", purchase_measure_unit: null, conversion_factor: 1 })).toBe(false)
	})
})
