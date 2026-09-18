import { describe, expect, test } from "bun:test"
import { getModule } from "@/lib/modules"
import { meAccess } from "@/test/access-fixture"
import { describeModuleScope, resolveModuleAccess } from "./module-access"

describe("resolveModuleAccess", () => {
	test("módulo aberto é alcançável sem sessão", () => {
		expect(resolveModuleAccess(getModule("pregoeiro"), false, undefined)).toBe("open")
	})

	test("módulo com papel, sem sessão, leva ao login", () => {
		expect(resolveModuleAccess(getModule("aci"), false, undefined)).toBe("sign-in")
		expect(resolveModuleAccess(getModule("requisitante"), false, undefined)).toBe("sign-in")
	})

	// Enviar documento não exige papel: o Requisitante não espera (nem depende) do perfil do α.
	test("Requisitante abre com sessão, mesmo sem perfil e com a consulta falhando", () => {
		expect(resolveModuleAccess(getModule("requisitante"), true, undefined)).toBe("open")
		expect(resolveModuleAccess(getModule("requisitante"), true, undefined, true)).toBe("open")
	})

	test("com sessão e perfil ainda carregando, não promete nem nega", () => {
		expect(resolveModuleAccess(getModule("aci"), true, undefined)).toBe("checking")
	})

	test("consulta do perfil que falhou não vira 'sem papel'", () => {
		expect(resolveModuleAccess(getModule("aci"), true, undefined, true)).toBe("unverified")
	})

	test("ACI: licitações ou ACI em alguma OM abre; requisitante sozinho não", () => {
		const aci = getModule("aci")
		expect(resolveModuleAccess(aci, true, meAccess({ procurement: [26] }))).toBe("open")
		expect(resolveModuleAccess(aci, true, meAccess({ aci: [100] }))).toBe("open")
		expect(resolveModuleAccess(aci, true, meAccess({ requester: "all" }))).toBe("denied")
	})

	test("Console α: só o ACI GLOBAL", () => {
		const alpha = getModule("alpha")
		expect(resolveModuleAccess(alpha, true, meAccess({ aci: "all" }))).toBe("open")
		expect(resolveModuleAccess(alpha, true, meAccess({ aci: [26] }))).toBe("denied")
	})

	test("Acessos: administração em alguma OM", () => {
		const admin = getModule("admin")
		expect(resolveModuleAccess(admin, true, meAccess({ admin: [26] }))).toBe("open")
		expect(resolveModuleAccess(admin, true, meAccess({ aci: "all" }))).toBe("denied")
	})
})

describe("describeModuleScope", () => {
	test("uma OM, várias, todas e as próprias", () => {
		expect(describeModuleScope(getModule("aci"), meAccess({ procurement: [100] }), "open")).toBe("IAE")
		expect(describeModuleScope(getModule("aci"), meAccess({ procurement: [26, 100, 101] }), "open")).toBe("3 OMs")
		expect(describeModuleScope(getModule("aci"), meAccess({ aci: "all" }), "open")).toBe("Todas as OMs")
		expect(describeModuleScope(getModule("requisitante"), meAccess(), "open")).toBe("Minhas submissões")
	})

	test("módulo sem OM, cartão que não abre ou perfil ausente: nada", () => {
		expect(describeModuleScope(getModule("pregoeiro"), meAccess({ aci: "all" }), "open")).toBeNull()
		expect(describeModuleScope(getModule("aci"), meAccess(), "denied")).toBeNull()
		expect(describeModuleScope(getModule("requisitante"), undefined, "open")).toBeNull()
	})
})
