import { describe, expect, test } from "bun:test"
import type { UserPermission } from "@iefa/pbac"
import { CONTRATE_MODULES, type ContrateModuleId } from "@/lib/modules"
import { resolveModuleAccess } from "./module-access"

const moduleById = (id: ContrateModuleId) => {
	const found = CONTRATE_MODULES.find((m) => m.id === id)
	if (!found) throw new Error(`módulo ${id} fora do registro`)
	return found
}

const grant = (module: UserPermission["module"], level: number): UserPermission => ({ module, level, mess_hall_id: null, kitchen_id: null, unit_id: null })

describe("resolveModuleAccess", () => {
	test("módulo aberto é alcançável sem sessão", () => {
		expect(resolveModuleAccess(moduleById("pregoeiro"), false, undefined)).toBe("open")
	})

	test("módulo com grant, sem sessão, leva ao login", () => {
		expect(resolveModuleAccess(moduleById("aci"), false, undefined)).toBe("sign-in")
	})

	test("com sessão e grants ainda carregando, não promete nem nega", () => {
		expect(resolveModuleAccess(moduleById("aci"), true, undefined)).toBe("checking")
	})

	test("consulta de grants que falhou não vira 'sem perfil'", () => {
		expect(resolveModuleAccess(moduleById("aci"), true, undefined, true)).toBe("unverified")
	})

	// Os níveis vêm do registro, não daqui: o teste é da regra, não do número.
	test("nível abaixo do exigido nega; nível suficiente abre", () => {
		const aci = moduleById("aci")
		if (!aci.requires) throw new Error("aci deveria exigir grant")
		const { module, minLevel } = aci.requires
		expect(resolveModuleAccess(aci, true, [grant(module, minLevel)])).toBe("open")
		expect(resolveModuleAccess(aci, true, [grant(module, minLevel - 1)])).toBe("denied")
		expect(resolveModuleAccess(aci, true, [])).toBe("denied")
	})
})
