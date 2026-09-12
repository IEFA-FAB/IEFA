/**
 * Contrato do reset administrativo de segundo fator.
 *
 * Metade daqui roda de verdade (o schema de entrada, a avaliação de garantia, o envio de
 * e-mail sem provider); a outra metade lê o ARQUIVO, porque o outro lado das chamadas é o
 * GoTrue e o banco. As invariantes que só o texto alcança são as que quebram em silêncio em
 * produção: um `performed_by` que passa a vir do payload, um log que deixa de ser gravado
 * antes da resposta, um e-mail que vira condição da operação, um piso de garantia redigitado
 * no ponto de chamada em vez de lido do registro.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { ASSURANCE_FRESHNESS_WINDOW_SECONDS, AssuranceRequiredError, type AssuranceRequirement, assertAssurance, type UserContext } from "@iefa/pbac"
import { describe, expect, test } from "vitest"
import { ADMIN_RESET_REASON_MAX_LENGTH, ResetUserMfaSchema } from "@/lib/mfa-admin-reset"
import { sendSecurityNotice } from "@/lib/security-email.server"
import { assuranceFor, classifiedOperations } from "./assurance-registry"

const serverDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(serverDir, "mfa-admin.fn.ts"), "utf8")

/** O arquivo sem comentário nenhum — o que o runtime realmente executa. */
function withoutComments(text: string): string {
	return text.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/^\s*\/\/.*$/gm, "")
}

const runtimeCode = withoutComments(source)

/** Corpo de uma server fn exportada, do `export const` até o próximo `export`. */
function blockOf(name: string): string {
	const start = source.indexOf(`export const ${name} =`)
	expect(start, `${name} não existe em mfa-admin.fn.ts`).toBeGreaterThan(-1)
	const next = source.indexOf("\nexport const ", start + 1)
	return source.slice(start, next === -1 ? undefined : next)
}

const VALID_INPUT = {
	targetUserId: "0f1d8a1e-6a4c-4f2b-9f3d-2f8a1b4c5d6e",
	reason: "Celular extraviado; identidade confirmada por telefone com a chefia.",
	identityVerifiedOutsideEmail: true,
}

describe("entrada do reset administrativo", () => {
	test("o caso completo é aceito (proteção contra um schema que recusa tudo)", () => {
		expect(ResetUserMfaSchema.safeParse(VALID_INPUT).success).toBe(true)
	})

	test("justificativa vazia é rejeitada", () => {
		const result = ResetUserMfaSchema.safeParse({ ...VALID_INPUT, reason: "" })
		expect(result.success).toBe(false)
	})

	test("justificativa só com espaço é rejeitada — `trim` antes do mínimo, não depois", () => {
		// Sem o `.trim()` ANTES do `.min()`, doze espaços passariam pelo comprimento e o
		// `mfa_reset_log` ficaria com uma justificativa em branco, que é o mesmo que nenhuma.
		expect(ResetUserMfaSchema.safeParse({ ...VALID_INPUT, reason: "            " }).success).toBe(false)
	})

	test("justificativa simbólica é rejeitada", () => {
		// "." é campo obrigatório cumprido como formalidade. O log existe para responder POR QUE
		// o segundo fator de alguém foi removido.
		expect(ResetUserMfaSchema.safeParse({ ...VALID_INPUT, reason: "." }).success).toBe(false)
	})

	test("justificativa acima do teto é rejeitada", () => {
		expect(ResetUserMfaSchema.safeParse({ ...VALID_INPUT, reason: "x".repeat(ADMIN_RESET_REASON_MAX_LENGTH + 1) }).success).toBe(false)
	})

	test("sem a confirmação de canal alternativo, a operação não passa nem do validator", () => {
		// Se o adversário já tem a caixa de e-mail do titular — o cenário em que o segundo fator
		// é a última defesa —, confirmar por e-mail é confirmar com o adversário. A trava é do
		// SERVIDOR: `/_serverFn/<id>` é chamável direto por HTTP.
		expect(ResetUserMfaSchema.safeParse({ ...VALID_INPUT, identityVerifiedOutsideEmail: false }).success).toBe(false)
		const { identityVerifiedOutsideEmail: _omitted, ...semConfirmacao } = VALID_INPUT
		expect(ResetUserMfaSchema.safeParse(semConfirmacao).success).toBe(false)
	})

	test("o alvo é um uuid, e o ator NÃO está no schema", () => {
		expect(ResetUserMfaSchema.safeParse({ ...VALID_INPUT, targetUserId: "nao-e-uuid" }).success).toBe(false)
		// `performedBy` de payload deixaria o administrador escolher em nome de quem a remoção
		// fica registrada — esvaziando a única prova que o log existe para produzir.
		expect(Object.keys(ResetUserMfaSchema.shape)).toEqual(["targetUserId", "reason", "identityVerifiedOutsideEmail"])
	})
})

describe("classificação e piso de garantia", () => {
	test("o reset é `fresh` e exige `admin` nível 3", () => {
		const entry = assuranceFor("resetUserMfaFn")
		if (!entry || entry.require === "none") throw new Error("resetUserMfaFn deveria estar classificada")

		expect(entry.require).toBe("fresh")
		expect(entry.authorization).toEqual([{ kind: "permission", module: "admin", level: 3 }])
		expect(classifiedOperations().map((operation) => operation.operation)).toContain("resetUserMfaFn")
	})

	test("o piso chega ao guard pelo REGISTRO, nunca digitado na fn", () => {
		// A chave `ASSURANCE_ENFORCEMENT` está desligada hoje (etapa 9 do plano liga). Passar o
		// grau pelo caminho normal é o que faz a exigência entrar junto com ela, sem mexer aqui.
		expect(blockOf("resetUserMfaFn")).toContain('requireAuthWithPermission("admin", 3, undefined, enforcedAssuranceFor("resetUserMfaFn"))')
		expect(runtimeCode, "grau de garantia redigitado em mfa-admin.fn.ts").not.toContain('"fresh"')
	})

	/**
	 * O cenário da spec: "Administrador sem elevação fresca é barrado".
	 *
	 * O piso global está desligado, então o teste liga o piso DESTA operação — lendo o grau e o
	 * motivo do próprio registro, como `enforcedAssuranceFor` fará quando a chave subir — e
	 * avalia o mesmo `assertAssurance` que o guard chama.
	 */
	function enforcedRequirement(): AssuranceRequirement {
		const entry = assuranceFor("resetUserMfaFn")
		if (!entry || entry.require === "none") throw new Error("resetUserMfaFn deveria estar classificada")
		return { require: entry.require, reason: entry.reason }
	}

	const now = 1_800_000_000

	function admin(overrides: Partial<UserContext>): UserContext {
		return {
			userId: "admin-1",
			permissions: [{ module: "admin", level: 3, mess_hall_id: null, kitchen_id: null, unit_id: null }],
			aal: 2,
			lastFactorAt: now - 60,
			origin: "session",
			hasVerifiedFactor: true,
			...overrides,
		}
	}

	test("administrador com elevação recente passa", () => {
		expect(() => assertAssurance(admin({}), enforcedRequirement(), { now })).not.toThrow()
	})

	test("administrador com elevação VENCIDA é barrado, e o próximo passo é a elevação", () => {
		const stale = admin({ lastFactorAt: now - ASSURANCE_FRESHNESS_WINDOW_SECONDS - 1 })
		expect(() => assertAssurance(stale, enforcedRequirement(), { now })).toThrow(AssuranceRequiredError)

		try {
			assertAssurance(stale, enforcedRequirement(), { now })
		} catch (error) {
			const assurance = error as AssuranceRequiredError
			expect(assurance.code).toBe("MFA_REQUIRED")
			expect(assurance.nextStep).toBe("step-up")
			// O texto que o administrador lê no modal descreve a OPERAÇÃO, não a regra.
			expect(assurance.reason).toContain("segundo fator de outra pessoa")
		}
	})

	test("administrador sem segundo fator na sessão é barrado antes de remover qualquer coisa", () => {
		expect(() => assertAssurance(admin({ aal: 1, lastFactorAt: null }), enforcedRequirement(), { now })).toThrow(AssuranceRequiredError)
	})
})

describe("contrato da server fn de reset", () => {
	test("o extrator enxerga o arquivo (proteção contra um teste que passa vazio)", () => {
		expect(source.length).toBeGreaterThan(2000)
		for (const name of ["getUserMfaStatusFn", "resetUserMfaFn"]) expect(source).toContain(`export const ${name} =`)
	})

	test("ler o estado de MFA de outra pessoa também exige `admin` nível 3", () => {
		expect(blockOf("getUserMfaStatusFn")).toContain('requireAuthWithPermission("admin", 3)')
	})

	test("a remoção usa o admin API — `unenroll()` age sobre quem chama, não sobre o titular", () => {
		const block = blockOf("resetUserMfaFn")
		expect(block).toContain("admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: data.targetUserId })")
		expect(runtimeCode).not.toContain("mfa.unenroll")
	})

	test("os códigos de recuperação do alvo caem no mesmo ato", () => {
		// Remover o fator de uma conta declarada comprometida e deixar dez credenciais de papel
		// válidas manteria aberto justamente o caminho que a operação existe para fechar.
		expect(blockOf("resetUserMfaFn")).toContain("revokeRecoveryCodes(getDb(), data.targetUserId)")
	})

	test("o log é gravado com `performed_by` da SESSÃO, e a justificativa do payload", () => {
		const block = blockOf("resetUserMfaFn")
		expect(block).toContain('recordMfaReset(getDb(), ctx, { targetUserId: data.targetUserId, method: "admin-reset", reason: data.reason })')
		// O ator nunca é nomeado pelo chamador: `recordMfaReset` lê `ctx.userId`, e a fn não
		// tem como passar outro.
		expect(runtimeCode).not.toContain("performedBy")
		expect(runtimeCode).not.toContain("performed_by")
	})

	test("os DOIS registros passam pelo envelope, com o próprio nome da operação", () => {
		const block = blockOf("resetUserMfaFn")
		expect(block).toContain('withSensitiveAudit(\n\t\t\t"resetUserMfaFn"')
		const audit = block.indexOf("withSensitiveAudit")
		expect(block.indexOf("recordMfaReset")).toBeGreaterThan(audit)
	})

	test("o e-mail vem DEPOIS dos dois registros, e nunca é condição deles (design.md D16)", () => {
		const block = blockOf("resetUserMfaFn")
		const audit = block.indexOf("withSensitiveAudit")
		const email = block.indexOf("sendSecurityNotice")
		expect(email).toBeGreaterThan(audit)
		expect(block).toContain("const emailNotified = await sendSecurityNotice")
		expect(block).not.toMatch(/if\s*\(!emailNotified\)/)
		expect(block).toContain('kind: "mfa-removed-by-admin"')
	})

	test("o e-mail do titular sai do GoTrue, nunca do payload do administrador", () => {
		expect(runtimeCode).toContain("auth.admin.getUserById")
		expect(runtimeCode).not.toMatch(/data\.(email|targetEmail)/)
	})

	test("sessão nascida de link de recuperação de senha não reseta o fator de ninguém", () => {
		expect(blockOf("resetUserMfaFn")).toContain("requireNonRecoverySession()")
	})

	test("o reset não consulta o limite de tentativas de código de recuperação (design.md D17)", () => {
		// Limitar o socorro pelo balde da vítima entregaria ao atacante um botão de bloqueio.
		// O contrato de `mfa-recovery.contract.test.ts` varre TODAS as fns; aqui a asserção fica
		// junto do arquivo que ela protege.
		expect(runtimeCode).not.toContain("RECOVERY_ATTEMPT_LIMITER")
		expect(runtimeCode).not.toContain("recovery-rate-limit")
	})
})

describe("o aviso por e-mail é entrega adicional", () => {
	test("sem provider configurado, o envio devolve `false` em vez de lançar", async () => {
		// É a prova do cenário "Falha de e-mail não impede o registro nem a operação": a fn
		// aguarda este retorno DEPOIS de os dois logs estarem gravados, então `false` vira
		// `emailNotified: false` na resposta, e não uma exceção que derrubaria a operação.
		const previous = process.env.SISUB_RESEND_API_KEY
		process.env.SISUB_RESEND_API_KEY = ""
		try {
			await expect(sendSecurityNotice({ to: "titular@fab.mil.br", kind: "mfa-removed-by-admin" })).resolves.toBe(false)
		} finally {
			if (previous === undefined) delete process.env.SISUB_RESEND_API_KEY
			else process.env.SISUB_RESEND_API_KEY = previous
		}
	})

	test("a indisponibilidade do provider aparece na tela, em vez de sumir", () => {
		// O administrador precisa saber que o titular NÃO será avisado antes de confirmar.
		expect(blockOf("getUserMfaStatusFn")).toContain("emailNoticeAvailable")
		const card = readFileSync(join(serverDir, "..", "components", "features", "global", "AdminMfaResetCard.tsx"), "utf8")
		expect(card).toContain("emailNoticeAvailable")
		expect(card).toContain("não será avisado por e-mail")
	})

	test("a tela cobra a confirmação de canal alternativo e a justificativa", () => {
		const card = readFileSync(join(serverDir, "..", "components", "features", "global", "AdminMfaResetCard.tsx"), "utf8")
		expect(card).toContain("IDENTITY_CHANNEL_CONFIRMATION")
		expect(card).toContain("ADMIN_RESET_REASON_MIN_LENGTH")
		// Contrato de estilo: nada de faixa de acento lateral para destacar o bloco destrutivo.
		expect(card).not.toMatch(/border-[lr]-\d/)
		expect(card).not.toContain("cursor-pointer")
	})
})
