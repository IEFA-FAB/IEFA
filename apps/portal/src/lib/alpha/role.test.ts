import { describe, expect, it } from "bun:test"
import { alphaRole, canDecide, hasAciAccess } from "./role"

describe("alphaRole", () => {
	it("lê app_metadata.role", () => {
		expect(alphaRole({ app_metadata: { role: "app_aci" } })).toBe("app_aci")
	})

	it("cadastro novo (sem role) é null, não um perfil suposto", () => {
		// É o estado de quem acabou de se cadastrar. Foi um deny-list sobre esse caso
		// que deixou qualquer autenticado ler submissão alheia no α.
		expect(alphaRole({ app_metadata: {} })).toBeNull()
		expect(alphaRole({ app_metadata: null })).toBeNull()
		expect(alphaRole(null)).toBeNull()
	})

	it("valor fora do conjunto é null", () => {
		expect(alphaRole({ app_metadata: { role: "admin" } })).toBeNull()
		expect(alphaRole({ app_metadata: { role: 42 } })).toBeNull()
	})
})

describe("acesso", () => {
	it("fila é de ACI e Licitações; decisão só do ACI", () => {
		expect(hasAciAccess("app_aci")).toBe(true)
		expect(hasAciAccess("app_licitacoes")).toBe(true)
		expect(hasAciAccess("app_requisitante")).toBe(false)
		expect(hasAciAccess(null)).toBe(false)

		expect(canDecide("app_aci")).toBe(true)
		expect(canDecide("app_licitacoes")).toBe(false)
		expect(canDecide(null)).toBe(false)
	})
})
