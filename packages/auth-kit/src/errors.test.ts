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

/**
 * MFA e reautenticação (spec `mfa-enrollment`): o usuário está no meio de um fluxo de
 * segurança, e é ali que uma frase em inglês faz a pessoa desistir do segundo fator.
 */
describe("getAuthErrorMessage — MFA e reautenticação", () => {
	test.each([
		["mfa_verification_failed", "Código incorreto. Gere um novo código no aplicativo autenticador e tente de novo."],
		["mfa_challenge_expired", "O código expirou antes da confirmação. Gere um novo código no aplicativo e tente de novo."],
		["mfa_factor_not_found", "Dispositivo de verificação não encontrado. Atualize a página e comece o cadastro de novo."],
		["mfa_factor_name_conflict", "Já existe um dispositivo com esse nome. Escolha outro nome para este."],
		["mfa_verified_factor_exists", "Este dispositivo já está verificado nesta conta."],
		["over_enrolled_mfa_factors", "Limite de dispositivos de verificação atingido. Remova um antes de cadastrar outro."],
		["insufficient_aal", "Confirme o código do seu dispositivo antes de alterar a verificação em duas etapas."],
		["reauthentication_needed", "Confirme a senha da sua conta para continuar."],
		["reauthentication_not_valid", "Não foi possível confirmar sua identidade. Tente novamente."],
		["over_request_rate_limit", "Muitas tentativas seguidas. Aguarde um instante antes de tentar de novo."],
		["session_not_found", "Sua sessão expirou. Entre novamente para continuar."],
	])("traduz pelo código %p", (code, expected) => {
		// Mensagem em inglês junto de propósito: o código tem que vencer a mensagem.
		expect(getAuthErrorMessage({ code, message: "Some raw GoTrue message" })).toBe(expected)
	})

	test("o código vence a tabela de regex quando os dois casariam", () => {
		// "Invalid login credentials" casaria a regra de senha; o código diz outra coisa.
		expect(getAuthErrorMessage({ code: "mfa_verification_failed", message: "Invalid login credentials" })).toBe(
			"Código incorreto. Gere um novo código no aplicativo autenticador e tente de novo."
		)
	})

	test.each([
		["Invalid TOTP code entered", "Código incorreto. Gere um novo código no aplicativo autenticador e tente de novo."],
		["MFA challenge 1a2b has expired", "O código expirou antes da confirmação. Gere um novo código no aplicativo e tente de novo."],
		["MFA factor not found", "Dispositivo de verificação não encontrado. Atualize a página e comece o cadastro de novo."],
		["A factor with the friendly name already exists for this user", "Já existe um dispositivo com esse nome. Escolha outro nome para este."],
		["AAL2 required to change factors", "Confirme o código do seu dispositivo antes de alterar a verificação em duas etapas."],
		["Reauthentication is needed", "Confirme a senha da sua conta para continuar."],
		["Nonce has expired", "Não foi possível confirmar sua identidade. Tente novamente."],
	])("traduz pela mensagem %p quando o GoTrue não manda código", (input, expected) => {
		expect(getAuthErrorMessage({ message: input })).toBe(expected)
	})

	test("código desconhecido cai na mensagem, não vira texto vazio", () => {
		expect(getAuthErrorMessage({ code: "algo_que_ainda_nao_existe", message: "Invalid login credentials" })).toBe("E-mail ou senha incorretos")
	})
})
