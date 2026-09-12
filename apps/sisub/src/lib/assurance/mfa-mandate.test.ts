import { describe, expect, test } from "vitest"
import { daysUntilDeadline, MFA_MANDATE, type MfaMandate, mfaMandateAction, mfaMandatePhase } from "./mfa-mandate"

const at = (iso: string) => new Date(iso)
const mandate = (deadline: string | null, noticeWindowDays = 30): MfaMandate => ({ deadline, noticeWindowDays })

const subject = (over: Partial<Parameters<typeof mfaMandateAction>[1]> = {}) => ({
	isProtectedAccount: true,
	verifiedCount: 0,
	canManageFactors: true,
	...over,
})

describe("a obrigatoriedade está DESLIGADA", () => {
	test("não há data anunciada", () => {
		// A data depende de decisão organizacional (design.md, Open Questions). Preenchê-la aqui
		// anunciaria ao usuário um prazo que ninguém decidiu.
		expect(MFA_MANDATE.deadline).toBeNull()
	})

	test("com a constante de hoje, NADA aparece para ninguém", () => {
		for (const now of ["2020-01-01", "2026-09-12", "2099-12-31"]) {
			expect(mfaMandatePhase(at(now))).toBe("off")
			expect(mfaMandateAction(mfaMandatePhase(at(now)), subject())).toBe("none")
		}
	})
})

describe("fases do prazo", () => {
	test("fora da janela de aviso não aparece nada", () => {
		expect(mfaMandatePhase(at("2026-01-01"), mandate("2026-06-01"))).toBe("off")
	})

	test("dentro da janela, a faixa aparece", () => {
		// 30 dias antes de 01/06 é 02/05 — a borda entra.
		expect(mfaMandatePhase(at("2026-05-10T08:00:00"), mandate("2026-06-01"))).toBe("notice")
	})

	test("no dia do prazo, a exigência vale", () => {
		expect(mfaMandatePhase(at("2026-06-01T00:00:00"), mandate("2026-06-01"))).toBe("enforced")
		expect(mfaMandatePhase(at("2026-08-20T00:00:00"), mandate("2026-06-01"))).toBe("enforced")
	})

	test("data mal escrita NÃO vira exigência imediata", () => {
		// Um `deadline` inválido caindo em `enforced` trancaria todo mundo na tela de cadastro
		// por causa de um erro de digitação — a falha é para o lado de não exigir.
		for (const bad of ["", "01/06/2026", "2026-6-1", "2026-02-31", "amanhã"]) {
			expect(mfaMandatePhase(at("2099-01-01"), mandate(bad))).toBe("off")
		}
	})

	test("a contagem de dias acompanha o prazo", () => {
		expect(daysUntilDeadline(at("2026-05-25T12:00:00"), mandate("2026-06-01"))).toBe(7)
		expect(daysUntilDeadline(at("2026-06-10T12:00:00"), mandate("2026-06-01"))).toBeLessThan(0)
		expect(daysUntilDeadline(at("2026-05-25"), mandate(null))).toBeNull()
	})
})

describe("quem é alcançado pela obrigatoriedade", () => {
	test("conta protegida sem fator recebe faixa antes e tela depois", () => {
		expect(mfaMandateAction("notice", subject())).toBe("notice")
		expect(mfaMandateAction("enforced", subject())).toBe("enroll")
	})

	test("conta NÃO protegida não é avisada de um prazo que não vale para ela", () => {
		// Avisar os ~800 comensais de uma exigência que não os alcança é o que ensina a ignorar
		// o aviso que alcança.
		expect(mfaMandateAction("notice", subject({ isProtectedAccount: false }))).toBe("none")
		expect(mfaMandateAction("enforced", subject({ isProtectedAccount: false }))).toBe("none")
	})

	test("quem já cadastrou não vê nada", () => {
		expect(mfaMandateAction("enforced", subject({ verifiedCount: 1 }))).toBe("none")
	})

	test("sessão de recuperação de senha não é mandada cadastrar", () => {
		// Ela não pode cadastrar fator — é a linha que sustenta o valor do 2FA. Mandá-la
		// cadastrar seria um beco sem saída.
		expect(mfaMandateAction("enforced", subject({ canManageFactors: false }))).toBe("none")
	})
})
