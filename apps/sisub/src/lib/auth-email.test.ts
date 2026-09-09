import { describe, expect, it } from "vitest"
import { validateSignInEmail, validateSignUpEmail } from "./auth-email"

describe("validateSignUpEmail", () => {
	it("aceita e-mail institucional", () => {
		expect(validateSignUpEmail("joao.silva@fab.mil.br")).toBeNull()
	})

	it("recusa domínio externo — autocadastro continua restrito à FAB", () => {
		expect(validateSignUpEmail("parceiro.externo@exemplo.org")).not.toBeNull()
	})

	it("recusa vazio", () => {
		expect(validateSignUpEmail("")).toBe("Email obrigatório.")
	})
})

describe("validateSignInEmail", () => {
	it("aceita e-mail institucional", () => {
		expect(validateSignInEmail("joao.silva@fab.mil.br")).toBeNull()
	})

	it("aceita conta de parceiro externo — sem isto ela não consegue entrar", () => {
		expect(validateSignInEmail("parceiro.externo@exemplo.org")).toBeNull()
	})

	it("recusa endereço sem domínio", () => {
		expect(validateSignInEmail("leonardo.nunes")).toBe("Email inválido.")
	})

	it("recusa vazio", () => {
		expect(validateSignInEmail("")).toBe("Email obrigatório.")
	})
})
