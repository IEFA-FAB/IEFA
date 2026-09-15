import { getAuthErrorMessage } from "@iefa/auth-kit"
import { describe, expect, test } from "vitest"
import { CLOCK_DRIFT_HINT, OTHER_SESSIONS_SIGNED_OUT_WARNING, readableMfaError, verificationCodeErrorMessage } from "@/lib/mfa-messages"

/** A frase real de código recusado — a dica de relógio só acompanha ela. */
const REJECTED = getAuthErrorMessage({ code: "mfa_verification_failed" })

describe("verificationCodeErrorMessage", () => {
	test("a primeira recusa mostra só o erro — dedo errado explica sozinho", () => {
		expect(verificationCodeErrorMessage(1, REJECTED)).toBe(REJECTED)
	})

	test("a segunda recusa passa a orientar sobre o relógio do aparelho", () => {
		const message = verificationCodeErrorMessage(2, REJECTED)
		expect(message.startsWith(REJECTED)).toBe(true)
		expect(message).toContain(CLOCK_DRIFT_HINT)
	})

	test("da terceira em diante a orientação continua", () => {
		expect(verificationCodeErrorMessage(5, REJECTED)).toContain(CLOCK_DRIFT_HINT)
		expect(verificationCodeErrorMessage(5, getAuthErrorMessage({ code: "mfa_verification_rejected" }))).toContain(CLOCK_DRIFT_HINT)
	})

	test("erro que não é código recusado nunca manda conferir o relógio", () => {
		// Sessão expirada, rede ou limite de tentativas no campo de código: o relógio é pista falsa.
		for (const message of [
			getAuthErrorMessage({ code: "session_not_found" }),
			getAuthErrorMessage({ code: "over_request_rate_limit" }),
			"Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.",
			"O código tem 6 dígitos.",
		]) {
			expect(verificationCodeErrorMessage(3, message)).toBe(message)
		}
	})

	test("a dica menciona o ajuste automático de data e hora, que é a instrução acionável", () => {
		// Sem dizer O QUE fazer, "confira o relógio" não resolve nada para quem não sabe
		// que o TOTP depende da hora do aparelho.
		expect(CLOCK_DRIFT_HINT).toMatch(/ajuste autom[áa]tico/i)
	})
})

describe("OTHER_SESSIONS_SIGNED_OUT_WARNING", () => {
	test("diz que as outras sessões caem E que a atual permanece", () => {
		// Só a primeira metade assustaria o usuário a desistir no último passo.
		expect(OTHER_SESSIONS_SIGNED_OUT_WARNING).toMatch(/desconectado/i)
		expect(OTHER_SESSIONS_SIGNED_OUT_WARNING).toMatch(/continua ativa/i)
	})
})

describe("readableMfaError", () => {
	const FALLBACK = "Não foi possível verificar o código."

	/** O que o `.validator()` do TanStack Start lança quando o schema recusa o payload. */
	function validatorError(issues: unknown[]): Error {
		return new Error(JSON.stringify(issues, undefined, 2))
	}

	test("desmonta o JSON de issues do validador e mostra só a mensagem do schema", () => {
		const error = validatorError([{ origin: "string", code: "invalid_format", format: "regex", path: ["code"], message: "O código tem 6 dígitos." }])
		expect(readableMfaError(error, FALLBACK)).toBe("O código tem 6 dígitos.")
	})

	test("junta mensagens de campos diferentes sem repetir a mesma", () => {
		const error = validatorError([
			{ code: "too_small", path: ["reason"], message: "Informe a justificativa da remoção (mínimo de 10 caracteres)." },
			{ code: "custom", path: ["identityVerifiedOutsideEmail"], message: "Confirme a identidade." },
			{ code: "custom", path: ["identityVerifiedOutsideEmail"], message: "Confirme a identidade." },
		])
		expect(readableMfaError(error, FALLBACK)).toBe("Informe a justificativa da remoção (mínimo de 10 caracteres). Confirme a identidade.")
	})

	test("mensagem padrão do Zod, em inglês, vira o fallback da tela", () => {
		const error = validatorError([{ code: "invalid_type", path: ["factorId"], message: "Invalid input: expected string, received undefined" }])
		expect(readableMfaError(error, FALLBACK)).toBe(FALLBACK)
	})

	test("identificadores do servidor viram frase", () => {
		expect(readableMfaError(new Error("UNAUTHORIZED"), FALLBACK)).toMatch(/sessão expirou/i)
		expect(readableMfaError(new Error("FORBIDDEN"), FALLBACK)).toMatch(/permissão/i)
		expect(readableMfaError(new Error("Erro desconhecido"), FALLBACK)).toBe(FALLBACK)
	})

	test("falha de rede do navegador não aparece em inglês", () => {
		expect(readableMfaError(new TypeError("Failed to fetch"), FALLBACK)).toMatch(/conexão/i)
		expect(readableMfaError(new TypeError("NetworkError when attempting to fetch resource."), FALLBACK)).toMatch(/conexão/i)
		expect(readableMfaError(new TypeError("Load failed"), FALLBACK)).toMatch(/conexão/i)
	})

	test("frase do GoTrue que escapou sem tradução é traduzida", () => {
		expect(readableMfaError(new Error("Invalid TOTP code entered"), FALLBACK)).toMatch(/^Código incorreto/)
	})

	test("mensagem já em português passa intacta", () => {
		expect(readableMfaError(new Error("Senha incorreta."), FALLBACK)).toBe("Senha incorreta.")
	})

	test("erro sem mensagem, ou que nem é Error, usa o fallback", () => {
		expect(readableMfaError(new Error(""), FALLBACK)).toBe(FALLBACK)
		expect(readableMfaError(undefined, FALLBACK)).toBe(FALLBACK)
		expect(readableMfaError("x", FALLBACK)).toBe(FALLBACK)
	})

	test("erro de banco repassado pelo domínio não mostra SQL", () => {
		const raw = new Error("[08006] connection terminated — Failed query: update access_control.mfa_recovery_code set used_at = now() params: 1,abc")
		const message = readableMfaError(raw, FALLBACK)
		expect(message).not.toMatch(/failed query|params|access_control/i)
		expect(message).toMatch(/acessar os dados/i)
	})

	test("negativa de permissão do domínio, em inglês, vira frase", () => {
		expect(readableMfaError(new Error("Requires admin level 3"), FALLBACK)).toMatch(/permissão/i)
	})

	test("página HTML do balanceador não vai para a tela", () => {
		expect(readableMfaError(new Error("<!DOCTYPE html><html><body>502 Bad Gateway</body></html>"), FALLBACK)).toMatch(/indisponível/i)
	})

	test("falha de auditoria mantém o 'não repita' e descarta o detalhe cru", () => {
		const raw = new Error(
			"A operação FOI APLICADA, mas não foi possível registrá-la na trilha de auditoria. NÃO repita a ação — avise a administração do sistema. Detalhe: Failed query: insert …"
		)
		const message = readableMfaError(raw, FALLBACK)
		expect(message).toMatch(/NÃO repita/)
		expect(message).not.toMatch(/Detalhe|Failed query/)
	})

	test("texto que começa com colchete mas não é JSON passa como mensagem", () => {
		expect(readableMfaError(new Error("[sisub] indisponível"), FALLBACK)).toBe("[sisub] indisponível")
	})
})
