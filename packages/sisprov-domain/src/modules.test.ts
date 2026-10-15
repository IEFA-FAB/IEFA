import { describe, expect, test } from "bun:test"
import {
	isSisprovModule,
	SISPROV_ADMIN_MODULE,
	SISPROV_MODULE_LEVELS,
	SISPROV_MODULES,
	SISPROV_PLANNING_MODULE,
	SISPROV_STOCK_MODULE,
	SisprovGrantTargetSchema,
	sisprovLevelLabel,
} from "./modules.ts"

describe("SisprovGrantTargetSchema: o par (módulo, nível) é validado junto", () => {
	test("aceita só os níveis que cada módulo admite", () => {
		for (const module of SISPROV_MODULES) {
			for (const level of [0, 1, 2, 3, 4]) {
				const result = SisprovGrantTargetSchema.safeParse({ module, level })
				expect(result.success, `${module} nível ${level}`).toBe(SISPROV_MODULE_LEVELS[module].includes(level))
			}
		}
	})

	test("recusa módulo de outro app do ERP, mesmo com nível válido", () => {
		for (const module of ["global", "kitchen", "kitchen-production", "rumaer", "sucont-admin", "alpha-admin"]) {
			expect(SisprovGrantTargetSchema.safeParse({ module, level: 2 }).success, module).toBe(false)
		}
	})
})

describe("rótulos", () => {
	test("o nível 2 é Operação na OM e Gestão na SDAB; o 3 é Gestão no estoque", () => {
		expect(sisprovLevelLabel(SISPROV_PLANNING_MODULE, 2)).toBe("Operação")
		expect(sisprovLevelLabel(SISPROV_STOCK_MODULE, 2)).toBe("Operação")
		expect(sisprovLevelLabel(SISPROV_STOCK_MODULE, 3)).toBe("Gestão")
		expect(sisprovLevelLabel(SISPROV_ADMIN_MODULE, 2)).toBe("Gestão")
		expect(sisprovLevelLabel(SISPROV_ADMIN_MODULE, 3)).toBe("Administrador")
	})

	test("isSisprovModule reconhece só os três, com o storage entre eles", () => {
		expect(SISPROV_MODULES.every(isSisprovModule)).toBe(true)
		expect(isSisprovModule("storage")).toBe(true)
		expect(isSisprovModule("sisprov")).toBe(false)
		expect(isSisprovModule("kitchen")).toBe(false)
	})
})
