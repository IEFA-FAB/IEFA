import { describe, expect, test } from "bun:test"

import { getAuthErrorMessage, normalizeEmail } from "./errors.ts"

describe("normalizeEmail", () => {
	test("apara espaços e baixa a caixa", () => {
		expect(normalizeEmail("  Fulano.Silva@FAB.mil.BR ")).toBe("fulano.silva@fab.mil.br")
	})
})

describe("getAuthErrorMessage", () => {
	test.each([
		["Invalid login credentials", "E-mail ou senha incorretos"],
		["Email not confirmed", "Confirme seu e-mail antes de entrar"],
		["User already registered", "Este e-mail já está cadastrado"],
		["Password should be at least 8 characters", "A senha deve ter no mínimo 8 caracteres, com maiúscula, minúscula e número"],
		["Unable to validate email address: invalid format", "Formato de e-mail inválido"],
		["Signup is disabled", "Cadastro temporariamente desabilitado"],
	])("traduz %p", (input, expected) => {
		expect(getAuthErrorMessage({ message: input })).toBe(expected)
	})

	test("repassa mensagem desconhecida em vez de esconder a causa", () => {
		expect(getAuthErrorMessage({ message: "Database connection refused" })).toBe("Database connection refused")
	})

	test("lida com erro sem message", () => {
		expect(getAuthErrorMessage(null)).toBe("Erro desconhecido")
		expect(getAuthErrorMessage("string solta")).toBe("Erro desconhecido")
	})
})
