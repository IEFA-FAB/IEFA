import { describe, expect, test } from "vitest"
import { CLOCK_DRIFT_HINT, OTHER_SESSIONS_SIGNED_OUT_WARNING, verificationCodeErrorMessage } from "@/lib/mfa-messages"

describe("verificationCodeErrorMessage", () => {
	test("a primeira recusa mostra só o erro — dedo errado explica sozinho", () => {
		expect(verificationCodeErrorMessage(1, "Código incorreto.")).toBe("Código incorreto.")
	})

	test("a segunda recusa passa a orientar sobre o relógio do aparelho", () => {
		const message = verificationCodeErrorMessage(2, "Código incorreto.")
		expect(message.startsWith("Código incorreto.")).toBe(true)
		expect(message).toContain(CLOCK_DRIFT_HINT)
	})

	test("da terceira em diante a orientação continua", () => {
		expect(verificationCodeErrorMessage(5, "Código incorreto.")).toContain(CLOCK_DRIFT_HINT)
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
