/**
 * Contrato das server functions de verificação em duas etapas.
 *
 * As invariantes abaixo não têm como quebrar em teste de unidade (o outro lado é o GoTrue) e
 * quebram em silêncio em produção: uma sessão de recuperação que passa a cadastrar fator, um
 * `signOut()` sem escopo que desloga o titular de tudo, um piso de garantia repassado ao guard
 * que tranca a conta sem fator fora do próprio cadastro. Todas são propriedades do ARQUIVO, e
 * é isso que este contrato lê.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { assuranceFor, classifiedOperations } from "./assurance-registry"

const serverDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(serverDir, "mfa.fn.ts"), "utf8")

/** Corpo de uma server fn exportada, do `export const` até o próximo `export`. */
function blockOf(name: string): string {
	const start = source.indexOf(`export const ${name} =`)
	expect(start, `${name} não existe em mfa.fn.ts`).toBeGreaterThan(-1)
	const next = source.indexOf("\nexport const ", start + 1)
	return source.slice(start, next === -1 ? undefined : next)
}

const MANAGEMENT_FNS = ["startMfaEnrollmentFn", "verifyMfaEnrollmentFn", "unenrollMfaFactorFn"]

describe("contrato das server fns de MFA", () => {
	test("o extrator enxerga o arquivo (proteção contra um teste que passa vazio)", () => {
		expect(source.length).toBeGreaterThan(2000)
		for (const name of [...MANAGEMENT_FNS, "getMfaOverviewFn", "verifyMfaChallengeFn", "signOutOtherSessionsFn"]) {
			expect(source).toContain(`export const ${name} =`)
		}
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Sessão de recuperação de senha (spec `mfa-enrollment`)
	// ─────────────────────────────────────────────────────────────────────────────

	test("cadastro e remoção de fator recusam sessão originada de recuperação de senha", () => {
		const missing = MANAGEMENT_FNS.filter((name) => !blockOf(name).includes("requireNonRecoverySession()"))

		expect(
			missing,
			"quem entrou por link de recuperação provou acesso à caixa de e-mail, não conhecimento da senha — essa sessão não cadastra nem remove fator"
		).toEqual([])
	})

	test("a tela sabe que a sessão de recuperação não gerencia fatores", () => {
		// `canManageFactors` é o que desabilita os botões. Sem ele, a pessoa clicaria e
		// receberia um 403 sem explicação.
		expect(blockOf("getMfaOverviewFn")).toContain("canManageFactors")
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Reautenticação por senha antes do PRIMEIRO fator (design.md D14)
	// ─────────────────────────────────────────────────────────────────────────────

	test("o primeiro cadastro confere a senha, e o e-mail sai da sessão", () => {
		const block = blockOf("startMfaEnrollmentFn")
		expect(block).toContain("verifyAccountPassword")
		expect(block).toContain("requireUser()")
		// `user.email` (da sessão), nunca um e-mail do payload — isso seria um oráculo de
		// senha de qualquer conta do sistema.
		expect(block).toMatch(/verifyAccountPassword\(\s*user\.email/)
		expect(block).not.toMatch(/data\.email/)
	})

	test("só o TOTP é oferecido — a spec proíbe `phone`", () => {
		expect(source).toContain('factorType: "totp"')
		expect(source).not.toContain('factorType: "phone"')
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Auditoria (spec `sensitive-operation-audit`)
	// ─────────────────────────────────────────────────────────────────────────────

	test("cadastro concluído e remoção de fator são operações classificadas — é o que as faz deixar rastro", () => {
		for (const operation of ["verifyMfaEnrollmentFn", "unenrollMfaFactorFn"]) {
			expect(assuranceFor(operation)?.require, `${operation} precisa ser classificada para gravar no registro de operações sensíveis`).not.toBe("none")
		}
		const classified = classifiedOperations().map((entry) => entry.operation)
		expect(classified).toContain("verifyMfaEnrollmentFn")
		expect(classified).toContain("unenrollMfaFactorFn")
	})

	test("as duas passam pelo envelope de auditoria, com o próprio nome", () => {
		expect(blockOf("verifyMfaEnrollmentFn")).toContain('withSensitiveAudit(\n\t\t\t"verifyMfaEnrollmentFn"')
		expect(blockOf("unenrollMfaFactorFn")).toContain('withSensitiveAudit(\n\t\t\t"unenrollMfaFactorFn"')
	})

	test("o desafio do login NÃO é auditado — uma linha por login esvaziaria o registro", () => {
		expect(assuranceFor("verifyMfaChallengeFn")?.require).toBe("none")
		expect(blockOf("verifyMfaChallengeFn")).not.toContain("withSensitiveAudit")
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// O piso do registro não vira guard local
	// ─────────────────────────────────────────────────────────────────────────────

	test("nenhuma fn de MFA aplica o piso de garantia do registro", () => {
		// Exigir AAL2 antes de verificar o PRIMEIRO fator é um impasse: a verificação é
		// justamente o que produz o AAL2. Quem aplica o piso destas operações é o GoTrue
		// (`unenroll` e `enroll` de segundo fator exigem AAL2 por conta própria).
		for (const symbol of ["requireAssurance", "assertAssurance", "satisfiesAssurance", "enforcedAssuranceFor"]) {
			expect(source, `mfa.fn.ts usa \`${symbol}\``).not.toContain(symbol)
		}
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Sessões
	// ─────────────────────────────────────────────────────────────────────────────

	test("encerrar as outras sessões usa escopo `others`, nunca o global", () => {
		const block = blockOf("signOutOtherSessionsFn")
		expect(block).toContain('signOut({ scope: "others" })')
		// `signOut()` sem escopo é GLOBAL: o botão "encerrar as outras" deslogaria quem clicou.
		expect(block).not.toMatch(/\.signOut\(\s*\)/)
	})

	test("a conferência de senha revoga a sessão descartável com escopo local", () => {
		const reauth = readFileSync(join(serverDir, "..", "lib", "reauthentication.server.ts"), "utf8")
		expect(reauth).toContain('signOut({ scope: "local" })')
		expect(reauth).not.toMatch(/\.signOut\(\s*\)/)
	})

	test("a lista de sessões é escopada pela sessão, e diz quando não está disponível", () => {
		const block = blockOf("listActiveSessionsFn")
		expect(block).toContain("ctx.userId")
		expect(block).not.toContain("data.userId")
		// Lista vazia por falha afirmaria "você não tem outra sessão aberta" justamente
		// quando o sistema não sabe.
		expect(block).toContain("available: false")
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Remoção do último fator (design.md D13)
	// ─────────────────────────────────────────────────────────────────────────────

	test("remover o último fator verificado força o refresh da sessão", () => {
		const block = blockOf("unenrollMfaFactorFn")
		expect(block).toContain("refreshSession()")
		// Sem isso, a sessão seguiria elevada por até uma hora com o fator já removido.
		expect(block).toContain("removingLastVerified")
	})
})
