/**
 * Contrato das server functions de código de recuperação.
 *
 * As invariantes abaixo não quebram em teste de unidade — o outro lado é o GoTrue — e quebram
 * em silêncio em produção: um código que passa a forjar AAL2, um `userId` que passa a vir do
 * payload, um registro que deixa de ser gravado antes da resposta, um limite de tentativas
 * que passa a alcançar o reset administrativo. Todas são propriedades do ARQUIVO, e é isso
 * que este contrato lê.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { assuranceFor, classifiedOperations } from "./assurance-registry"

const serverDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(serverDir, "mfa-recovery.fn.ts"), "utf8")
const domainSource = readFileSync(join(serverDir, "..", "..", "..", "..", "packages", "sisub-domain", "src", "operations", "mfa-recovery.ts"), "utf8")

/** O arquivo sem comentário nenhum — o que o runtime realmente executa. */
function withoutComments(text: string): string {
	return text.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/^\s*\/\/.*$/gm, "")
}

const runtimeCode = withoutComments(source)

/** Corpo de uma server fn exportada, do `export const` até o próximo `export`. */
function blockOf(name: string): string {
	const start = source.indexOf(`export const ${name} =`)
	expect(start, `${name} não existe em mfa-recovery.fn.ts`).toBeGreaterThan(-1)
	const next = source.indexOf("\nexport const ", start + 1)
	return source.slice(start, next === -1 ? undefined : next)
}

const FNS = ["getRecoveryCodeOverviewFn", "generateRecoveryCodesFn", "consumeRecoveryCodeFn"]

describe("contrato das server fns de recuperação", () => {
	test("o extrator enxerga o arquivo (proteção contra um teste que passa vazio)", () => {
		expect(source.length).toBeGreaterThan(2000)
		for (const name of FNS) expect(source).toContain(`export const ${name} =`)
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// O código NÃO produz AAL2 (design.md D8)
	// ─────────────────────────────────────────────────────────────────────────────

	test("nada aqui forja garantia de identidade", () => {
		// Um hook de token que emitisse `aal2` mentiria sobre a garantia e contaminaria toda
		// decisão a jusante, inclusive RLS. O caminho certo é REMOVER o fator e exigir recadastro.
		for (const symbol of ["aal2", "amr", "setSession", "access_token"]) {
			expect(runtimeCode, `mfa-recovery.fn.ts executa \`${symbol}\``).not.toContain(symbol)
		}
		// A sessão não é promovida: `ctx.aal` só é LIDO (na emissão), nunca atribuído.
		expect(runtimeCode).not.toMatch(/ctx\.aal\s*=[^=]/)
	})

	test("o consumo não aceita piso de garantia — a impossibilidade é estrutural", () => {
		// Exigir segundo fator para consumir um código de recuperação seria pedir o fator a
		// quem acabou de perdê-lo. A operation do domínio nem tem o parâmetro, então não existe
		// ponto de chamada que possa passá-lo por engano.
		const consume = domainSource.slice(domainSource.indexOf("export async function consumeRecoveryCode"))
		expect(consume.slice(0, consume.indexOf("{"))).not.toContain("AssuranceRequirement")
		expect(blockOf("consumeRecoveryCodeFn")).not.toContain("requireAssurance")
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// O titular sai da sessão
	// ─────────────────────────────────────────────────────────────────────────────

	test("o alvo da remoção é SEMPRE a sessão, nunca o payload", () => {
		const block = blockOf("consumeRecoveryCodeFn")
		expect(block).toContain("ctx.userId")
		// Um `userId` de payload transformaria esta fn no caminho para apagar o segundo fator
		// de qualquer conta do sistema.
		expect(block).not.toMatch(/data\.userId/)
		expect(runtimeCode).not.toMatch(/userId:\s*data\./)
		expect(block).toContain("deleteFactor({ id: factor.id, userId: ctx.userId })")
	})

	test("a remoção usa o admin API — `unenroll()` exigiria o AAL2 que a pessoa perdeu", () => {
		const block = blockOf("consumeRecoveryCodeFn")
		expect(block).toContain("auth.admin.mfa.deleteFactor")
		expect(runtimeCode).not.toContain("mfa.unenroll")
	})

	test("o refresh de sessão é chamado, e sua falha NÃO interrompe o registro (design.md D13)", () => {
		const block = blockOf("consumeRecoveryCodeFn")
		expect(block).toContain("refreshSession()")
		// `deleteFactor` de fator verificado encerra as sessões do titular: falhar aqui é o
		// caminho comum, e lançar pularia os dois logs logo abaixo.
		expect(block).toContain("sessionActive")
		expect(block).toMatch(/refreshSession\(\)\s*\n\s*\.catch\(/)
	})

	test("sessão nascida de link de recuperação de senha não consome código", () => {
		// Quem entrou por e-mail provou acesso à caixa, não conhecimento da senha — e é
		// justamente a caixa que o adversário costuma ter.
		expect(blockOf("consumeRecoveryCodeFn")).toContain("requireNonRecoverySession()")
		expect(blockOf("generateRecoveryCodesFn")).toContain("requireNonRecoverySession()")
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Conta protegida (design.md D9)
	// ─────────────────────────────────────────────────────────────────────────────

	test("conta protegida não gera e não consome código, e a condição é DERIVADA do registro", () => {
		for (const name of ["generateRecoveryCodesFn", "consumeRecoveryCodeFn"]) {
			const block = blockOf(name)
			expect(block, `${name} não confere conta protegida`).toContain("isProtectedAccount(ctx.permissions, assuranceReachability())")
		}
		// Nunca um número de nível digitado à mão: a execução orçamentária passa por `unit`
		// nível 2, e "nível 3" deixaria de fora justamente quem a mudança existe para proteger.
		expect(runtimeCode).not.toMatch(/level\s*[>=]=?\s*3/)
	})

	test("a conta que VIRA protegida perde os códigos, no mesmo ato da concessão", () => {
		for (const file of ["permissions.fn.ts", "policies.fn.ts"]) {
			const granting = readFileSync(join(serverDir, file), "utf8")
			// A variante `try…` é a correta AQUI: a concessão já foi confirmada quando a
			// limpeza roda, e deixá-la derrubar a resposta faria o administrador repetir a
			// ação e criar grant duplicado. A revogação é higiene; o gate de verdade é a
			// reavaliação no consumo do código, que recusa conta protegida.
			expect(granting, `${file} não invalida os códigos de recuperação do alvo`).toContain("tryRevokeRecoveryCodesIfProtected")
		}
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Registro garantido ANTES da resposta
	// ─────────────────────────────────────────────────────────────────────────────

	test("o consumo grava os DOIS registros, e o envelope é quem grava o de operação sensível", () => {
		const block = blockOf("consumeRecoveryCodeFn")
		expect(block).toContain('withSensitiveAudit(\n\t\t\t"consumeRecoveryCodeFn"')
		expect(block).toContain('recordMfaReset(getDb(), ctx, { targetUserId: ctx.userId, method: "recovery-code" })')
		expect(assuranceFor("consumeRecoveryCodeFn")?.require).not.toBe("none")
		expect(classifiedOperations().map((entry) => entry.operation)).toContain("consumeRecoveryCodeFn")
	})

	test("o e-mail vem DEPOIS dos dois registros, e nunca é condição deles", () => {
		const block = blockOf("consumeRecoveryCodeFn")
		const audit = block.indexOf("withSensitiveAudit")
		const email = block.indexOf("sendSecurityNotice")
		expect(audit).toBeGreaterThan(-1)
		expect(email).toBeGreaterThan(audit)
		// O retorno é informação para a tela (`emailNotified`), não erro: a operação já concluiu
		// e já está registrada quando isto roda (design.md D16).
		expect(block).toContain("const emailNotified = await sendSecurityNotice")
		expect(block).not.toMatch(/if\s*\(!emailNotified\)/)
	})

	test("a emissão é auditada com o próprio nome, e o log guarda contagem — nunca código", () => {
		const block = blockOf("generateRecoveryCodesFn")
		expect(block).toContain('withSensitiveAudit(\n\t\t"generateRecoveryCodesFn"')
		expect(block).toContain("count: result.codes.length")
		// Um código, um hash ou um prefixo no `target` transformaria a trilha de auditoria numa
		// lista de credenciais — e ela é lida por `admin` nível 3, não pelo dono.
		expect(block).not.toMatch(/target[^)]*codes\[/)
		expect(block).not.toContain("codeHash")
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Limite de tentativas (design.md D17)
	// ─────────────────────────────────────────────────────────────────────────────

	test("o limite é do SERVIDOR, por (usuário, origem)", () => {
		const block = blockOf("consumeRecoveryCodeFn")
		expect(block).toContain("RECOVERY_ATTEMPT_LIMITER.assess")
		expect(block).toContain("origin: requestOrigin()")
		// O freio de `@iefa/auth-kit` é `sessionStorage`: some com um F5 e não alcança `curl`.
		expect(runtimeCode).not.toContain("sessionStorage")
		expect(runtimeCode).not.toContain("useLoginRateLimiter")
	})

	test("só o palpite ERRADO consome tentativa", () => {
		const block = blockOf("consumeRecoveryCodeFn")
		expect(block).toContain('error.code === "RECOVERY_CODE_INVALID"')
		expect(block).toContain("RECOVERY_ATTEMPT_LIMITER.recordSuccess")
	})

	/**
	 * O cenário da spec: "Reset administrativo não é bloqueado pelo limite".
	 *
	 * A prova não é uma asserção sobre o reset (que nasce na etapa 7 do plano) — é sobre TODAS
	 * as server fns: o limitador só pode ser tocado pelo consumo de código. No dia em que
	 * `resetUserMfaFn` for escrita, este teste é que reprova se ela consultar o balde.
	 */
	test("nenhuma outra server fn consulta o limitador — o reset administrativo nunca é bloqueado", () => {
		const offenders = readdirSync(serverDir)
			.filter((file) => file.endsWith(".fn.ts"))
			.filter((file) => readFileSync(join(serverDir, file), "utf8").includes("RECOVERY_ATTEMPT_LIMITER"))

		expect(offenders, "o limite de código de recuperação vazou para outra server fn").toEqual(["mfa-recovery.fn.ts"])

		// E, dentro deste arquivo, só o consumo o usa.
		for (const name of ["getRecoveryCodeOverviewFn", "generateRecoveryCodesFn"]) {
			expect(blockOf(name), `${name} consulta o limite de tentativas`).not.toContain("RECOVERY_ATTEMPT_LIMITER")
		}
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Classificação
	// ─────────────────────────────────────────────────────────────────────────────

	test("emissão é `fresh`, consumo é `session`, e nenhuma das duas entra na derivação de conta protegida", () => {
		expect(assuranceFor("generateRecoveryCodesFn")?.require).toBe("fresh")
		expect(assuranceFor("consumeRecoveryCodeFn")?.require).toBe("session")

		for (const name of ["generateRecoveryCodesFn", "consumeRecoveryCodeFn"]) {
			const entry = assuranceFor(name)
			if (!entry || entry.require === "none") throw new Error(`${name} deveria estar classificada`)
			// `self`: contá-las na derivação tornaria os ~800 comensais contas protegidas e
			// esvaziaria o critério.
			expect(entry.authorization.every((requirement) => requirement.kind === "self")).toBe(true)
		}
	})

	// ─────────────────────────────────────────────────────────────────────────────
	// Capacidade de e-mail
	// ─────────────────────────────────────────────────────────────────────────────

	test("a indisponibilidade do provider é reportada, e não some", () => {
		const capabilities = readFileSync(join(serverDir, "..", "lib", "capabilities.server.ts"), "utf8")
		expect(capabilities).toContain("securityEmail")
		expect(blockOf("getRecoveryCodeOverviewFn")).toContain("emailNoticeAvailable")
	})

	test("o envio nunca lança", () => {
		const email = readFileSync(join(serverDir, "..", "lib", "security-email.server.ts"), "utf8")
		expect(email).toContain("catch")
		expect(email).toMatch(/Promise<boolean>/)
	})
})
