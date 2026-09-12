/**
 * @module mfa-admin.fn
 * Reset administrativo de segundo fator — a remoção do MFA de OUTRA pessoa.
 *
 * ## Por que é um arquivo separado de `mfa.fn.ts`
 *
 * `mfa.fn.ts` tem uma invariante que vale a pena manter legível: nenhuma fn dele aceita id de
 * usuário — o titular sai SEMPRE da sessão. Este arquivo é o oposto por definição: ele age
 * sobre um terceiro, e por isso carrega travas que as fns de autoatendimento não têm. Juntar
 * os dois apagaria a fronteira que torna o `userId` de payload um erro visível de um lado e o
 * contrato do outro.
 *
 * ## As quatro travas (design.md D10)
 *
 * 1. **`admin` nível 3 E elevação `fresh` do próprio administrador** — as duas pelo caminho
 *    normal (`requireAuthWithPermission` + `enforcedAssuranceFor`), nunca por um grau
 *    redigitado aqui. Enquanto `ASSURANCE_ENFORCEMENT` estiver desligada o piso é no-op, e a
 *    exigência liga junto com a etapa 9 do plano — um diff de uma linha, no registro.
 * 2. **Identidade verificada por canal que não é o e-mail**, confirmada explicitamente. Se o
 *    adversário já tem a caixa do titular, confirmar por e-mail é confirmar com o adversário.
 * 3. **Justificativa obrigatória**, gravada em `access_control.mfa_reset_log.reason`.
 * 4. **Aviso ao titular por e-mail** — entrega adicional, best-effort declarada (D16). O canal
 *    garantido são os dois registros em banco, gravados ANTES de a resposta voltar.
 *
 * ## O limite de tentativas de código de recuperação NÃO é consultado aqui (design.md D17)
 *
 * Limitar o reset administrativo pelo balde da vítima entregaria ao atacante um botão de
 * bloqueio: queimar tentativas contra o e-mail de alguém trancaria justamente o caminho de
 * socorro. `mfa-recovery.contract.test.ts` varre todas as server fns e reprova qualquer
 * menção ao limitador fora do consumo de código — inclusive em comentário, e é de propósito:
 * o contrato lê o arquivo cru, e "só estava documentando" é como a exceção começa.
 *
 * ## Último recurso, quando nem isto alcança
 *
 * Conta que perdeu o fator sem nenhum administrador disponível (ou o próprio administrador
 * trancado para fora) é atendida pelo dashboard do Supabase. O procedimento — quem tem
 * acesso, com MFA próprio, e por que precisa ser mais de uma pessoa — está em
 * `MFA-RECOVERY.md`, na raiz do repositório.
 *
 * @domain external
 * @migration 20260911120200_access_control_mfa_reset_log
 */

import { getAuthErrorMessage } from "@iefa/auth-kit"
import { recordMfaReset, revokeRecoveryCodes } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { ResetUserMfaSchema } from "@/lib/mfa-admin-reset"
import { sendSecurityNotice } from "@/lib/security-email.server"
import { requireNonRecoverySession } from "@/lib/session-claims.server"
import { getAccessControlClient } from "@/lib/supabase.server"
import { enforcedAssuranceFor } from "@/server/assurance-registry"

// ============================================================================
// Tipos expostos à UI
// ============================================================================

export type AdminUserMfaStatus = {
	/** Dispositivos verificados do titular. */
	verifiedFactors: number
	/** Cadastros iniciados e nunca confirmados — também caem no reset. */
	pendingFactors: number
	/**
	 * `false` quando não há provider de e-mail configurado.
	 *
	 * A tela diz ao administrador que o titular NÃO será avisado, em vez de deixá-lo supor
	 * que foi (design.md D16). A operação conclui de qualquer jeito.
	 */
	emailNoticeAvailable: boolean
}

export type AdminMfaResetResult = {
	/** Fatores removidos (verificados e pendentes). */
	removedFactors: number
	/** Códigos de recuperação invalidados no mesmo ato. */
	revokedRecoveryCodes: number
	/** `true` se o aviso ao titular foi despachado. Best-effort: `false` não é falha (D16). */
	emailNotified: boolean
}

// ============================================================================
// Helpers
// ============================================================================

/** Erro de regra deste módulo, com o status já sinalizado (ver `lib/domain-errors.ts`). */
function fail(message: string, status = 400): never {
	setResponseStatus(status)
	throw new Error(message)
}

type AdminFactor = { id: string; status: string }

/**
 * Fatores do TITULAR pelo admin API.
 *
 * O client de sessão não serve: ele lê os fatores de quem está chamando, e quem chama aqui é
 * o administrador. Devolve verificados e pendentes — um cadastro abandonado ocupa o nome do
 * dispositivo e atrapalharia o recadastro que o titular precisa fazer logo em seguida.
 */
async function listTargetFactors(userId: string): Promise<AdminFactor[]> {
	const { data, error } = await getAccessControlClient().auth.admin.mfa.listFactors({ userId })
	if (error) {
		setResponseStatus(502)
		throw new Error(getAuthErrorMessage(error))
	}
	return (data?.factors ?? []).map((factor) => ({ id: factor.id, status: factor.status }))
}

/** E-mail do titular, lido do GoTrue — nunca do payload do administrador. */
async function fetchTargetEmail(userId: string): Promise<string | null> {
	const { data, error } = await getAccessControlClient().auth.admin.getUserById(userId)
	if (error || !data?.user) fail("Usuário não encontrado.", 404)
	return data.user.email ?? null
}

// ============================================================================
// Leitura
// ============================================================================

/**
 * O que o administrador vê antes de decidir: quantos dispositivos o titular tem e se o aviso
 * por e-mail vai sair.
 *
 * `admin` nível 3, o mesmo da escrita — a contagem de fatores de outra pessoa é informação de
 * segurança dela. Leitura pura: nenhuma elevação é exigida para abri-la (design.md D3).
 */
export const getUserMfaStatusFn = createServerFn({ method: "GET" })
	.validator(ResetUserMfaSchema.pick({ targetUserId: true }))
	.handler(async ({ data }): Promise<AdminUserMfaStatus> => {
		await requireAuthWithPermission("admin", 3)
		const factors = await listTargetFactors(data.targetUserId)

		return {
			verifiedFactors: factors.filter((factor) => factor.status === "verified").length,
			pendingFactors: factors.filter((factor) => factor.status !== "verified").length,
			emailNoticeAvailable: getServerCapabilities().securityEmail,
		}
	})

// ============================================================================
// Escrita
// ============================================================================

/**
 * Remove TODOS os fatores do titular, invalida os códigos de recuperação dele e registra.
 *
 * ## Ordem, e por que ela é essa
 *
 * 1. **Guard** — `admin` nível 3 e o piso do registro, nessa ordem: permissão primeiro,
 *    garantia depois. Invertido, alguém sem acesso nenhum receberia um pedido de segundo
 *    fator e descobriria que a operação existe.
 * 2. **Titular existe** — 404 antes de qualquer escrita, e o e-mail dele sai daqui.
 * 3. **`deleteFactor`** por fator, pelo admin API. `mfa.unenroll()` não alcança: ele age
 *    sobre quem chama. O efeito colateral é o desejado — o GoTrue encerra TODAS as sessões do
 *    titular, inclusive a de quem eventualmente roubou uma.
 * 4. **Códigos de recuperação do alvo caem junto.** Sem isto, o administrador removeria o
 *    fator de uma conta que ele acabou de declarar comprometida e deixaria dez credenciais de
 *    papel válidas — um caminho de entrada que a própria operação existe para fechar.
 * 5. **`mfa_reset_log` com `method = 'admin-reset'`** e, no envelope, o
 *    `sensitive_operation_log`. Os dois ANTES da resposta: remover o segundo fator de alguém
 *    sem deixar rastro é pior do que não remover.
 * 6. **E-mail**, por último e fora do envelope. Nunca condição da operação.
 */
export const resetUserMfaFn = createServerFn({ method: "POST" })
	.validator(ResetUserMfaSchema)
	.handler(async ({ data }): Promise<AdminMfaResetResult> => {
		const ctx = await requireAuthWithPermission("admin", 3, undefined, enforcedAssuranceFor("resetUserMfaFn"))
		// Sessão nascida de link de recuperação de senha provou acesso à CAIXA, não
		// conhecimento da senha — e é a caixa que o adversário costuma ter. Ela não remove o
		// segundo fator de ninguém, nem do titular nem de terceiro.
		await requireNonRecoverySession()

		// O reset administrativo existe para destravar OUTRA pessoa. Sobre a própria conta o
		// caminho é `/diner/security`, e manter a distinção preserva o que `admin-reset`
		// significa na auditoria: alguém removeu o fator de alguém.
		if (data.targetUserId === ctx.userId) {
			fail("Para remover seu próprio dispositivo, use a tela de Segurança da sua conta.", 400)
		}

		const targetEmail = await fetchTargetEmail(data.targetUserId)

		const result = await withSensitiveAudit(
			"resetUserMfaFn",
			ctx,
			async (): Promise<Omit<AdminMfaResetResult, "emailNotified">> => {
				const admin = getAccessControlClient()
				const factors = await listTargetFactors(data.targetUserId)
				if (factors.length === 0) fail("Este usuário não possui verificação em duas etapas cadastrada.", 400)

				for (const factor of factors) {
					const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: data.targetUserId })
					if (error) {
						setResponseStatus(502)
						throw new Error(getAuthErrorMessage(error))
					}
				}

				const revokedRecoveryCodes = await revokeRecoveryCodes(getDb(), data.targetUserId).catch(handleDomainError)

				// `performed_by` sai de `ctx` dentro da operation, nunca do input: é a
				// divergência entre ator e alvo que a investigação lê.
				await recordMfaReset(getDb(), ctx, { targetUserId: data.targetUserId, method: "admin-reset", reason: data.reason }).catch(handleDomainError)

				return { removedFactors: factors.length, revokedRecoveryCodes }
			},
			// A justificativa NÃO se repete aqui: ela é a razão de ser da linha de
			// `mfa_reset_log`, e um texto livre copiado em dois logs diverge no dia em que um
			// deles for corrigido. O que este `target` dá é o elo — quem foi o alvo.
			(audited) => ({
				method: "admin-reset",
				targetUserId: data.targetUserId,
				removedFactors: audited.removedFactors,
				revokedRecoveryCodes: audited.revokedRecoveryCodes,
			})
		)

		// Depois dos DOIS registros, e nunca como condição deles.
		const emailNotified = await sendSecurityNotice({ to: targetEmail, kind: "mfa-removed-by-admin" })
		return { ...result, emailNotified }
	})
