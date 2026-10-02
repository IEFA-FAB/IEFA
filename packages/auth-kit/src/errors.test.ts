import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { getAuthErrorMessage, normalizeEmail, SIGNUP_DOMAIN_REFUSED_MESSAGE, SIGNUP_HOOK_UNAVAILABLE_MESSAGE } from "./errors.ts"

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

	test("a recusa do hook de cadastro sai com a frase canônica, com ou sem código do GoTrue", () => {
		const refusal = "Cadastro restrito a e-mails institucionais @fab.mil.br. Para usar outro e-mail, peça autorização à administração do sistema."
		expect(getAuthErrorMessage({ message: refusal, status: 403 })).toBe(SIGNUP_DOMAIN_REFUSED_MESSAGE)
		// Código que a tabela não conhece não pode esconder a recusa atrás de texto cru.
		expect(getAuthErrorMessage({ code: "unexpected_failure", message: refusal })).toBe(SIGNUP_DOMAIN_REFUSED_MESSAGE)
		expect(getAuthErrorMessage({ message: `403: ${refusal}` })).toBe(SIGNUP_DOMAIN_REFUSED_MESSAGE)
	})

	test("a frase canônica é a mesma que o hook devolve", () => {
		const migration = readFileSync(
			join(import.meta.dir, "..", "..", "database", "supabase", "migrations", "20261001100100_before_user_created_hook.sql"),
			"utf8"
		)
		expect(migration).toContain(`'message', '${SIGNUP_DOMAIN_REFUSED_MESSAGE}'`)
	})

	test("falha do próprio hook não vira 'e-mail recusado'", () => {
		expect(getAuthErrorMessage({ message: "Error running hook URI: pg-functions://postgres/access_control/before_user_created" })).toBe(
			SIGNUP_HOOK_UNAVAILABLE_MESSAGE
		)
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
		["too_many_enrolled_mfa_factors", "Limite de dispositivos de verificação atingido. Remova um antes de cadastrar outro."],
		["mfa_ip_address_mismatch", "A verificação começou em outra rede. Gere um novo código e tente de novo."],
		["mfa_totp_verify_not_enabled", "A verificação por aplicativo autenticador está desativada no servidor. Procure a administração do sistema."],
		["refresh_token_already_used", "Sua sessão expirou. Entre novamente para continuar."],
		["request_timeout", "O serviço de autenticação demorou para responder. Tente de novo em instantes."],
		["invalid_credentials", "E-mail ou senha incorretos"],
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
