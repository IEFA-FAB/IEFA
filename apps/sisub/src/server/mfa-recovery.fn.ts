/**
 * @module mfa-recovery.fn
 * Códigos de recuperação de segundo fator: emissão, consulta e consumo.
 *
 * ## O código de recuperação REMOVE o fator. Ele não produz AAL2 (design.md D8)
 *
 * ```
 * senha (AAL1) → desafio TOTP → "Usar um código de recuperação" → valida hash,
 * marca uso único → auth.admin.mfa.deleteFactor() → refreshSession() →
 * conta sem MFA, sessão AAL1 → tela obrigatória de recadastro → AAL2 → novos códigos
 * ```
 *
 * Nada aqui forja garantia: não temos como fazer o GoTrue aceitar um código nosso como
 * fator, e um hook de token que emitisse `aal2` mentiria sobre a garantia, contaminando
 * toda decisão a jusante — inclusive RLS. Enquanto não recadastrar, o titular não alcança
 * nenhuma operação classificada, e isso é o resultado CERTO: ele ainda não provou um
 * segundo fator.
 *
 * ## Por que `auth.admin`, e não `mfa.unenroll()`
 *
 * `unenroll()` exige AAL2. Quem perdeu o dispositivo não consegue remover o próprio fator —
 * a documentação do Supabase é explícita a respeito. Só o service role alcança, e por isso a
 * remoção passa por `getAccessControlClient().auth.admin.mfa.deleteFactor`. O `userId` sai
 * SEMPRE da sessão validada; aceitá-lo do payload transformaria esta fn no caminho para
 * apagar o segundo fator de qualquer conta do sistema.
 *
 * ## O titular sai da sessão, o limite de tentativas é do servidor
 *
 * O freio de `@iefa/auth-kit/rate-limiter` é `sessionStorage` — some com um F5 e não alcança
 * quem chama por `curl`. Aqui o limite é `lib/recovery-rate-limit.ts`, por (usuário, origem),
 * com teto global mais alto (design.md D17), e ele **não** toca o caminho de reset
 * administrativo.
 *
 * @domain external
 * @migration n-a
 */

import { getAuthErrorMessage } from "@iefa/auth-kit"
import { clientIpFromForwardedFor } from "@iefa/legal-kit"
import { isProtectedAccount } from "@iefa/pbac"
import {
	ConsumeRecoveryCodeSchema,
	consumeRecoveryCode,
	generateRecoveryCodes,
	getRecoveryCodeStatus,
	RECOVERY_CODE_COUNT,
	recordMfaReset,
} from "@iefa/sisub-domain"
import { DomainError } from "@iefa/sisub-domain/types"
import { createServerFn } from "@tanstack/react-start"
import { getRequest, setResponseStatus } from "@tanstack/react-start/server"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth, requireUser } from "@/lib/auth.server"
import { getServerCapabilities } from "@/lib/capabilities.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { attemptBlockedMessage, RECOVERY_ATTEMPT_LIMITER, UNKNOWN_ORIGIN } from "@/lib/recovery-rate-limit"
import { sendSecurityNotice } from "@/lib/security-email.server"
import { requireNonRecoverySession } from "@/lib/session-claims.server"
import { getAccessControlClient, getSupabaseAuthClient } from "@/lib/supabase.server"
import { assuranceReachability } from "@/server/assurance-registry"

// ============================================================================
// Tipos expostos à UI
// ============================================================================

export type RecoveryCodeOverview = {
	/** Códigos gerados e ainda não usados. */
	available: number
	/**
	 * Quantos códigos uma geração emite — o denominador do "7 de 10" na tela.
	 *
	 * Vem do servidor, e não de um `import` do domínio na rota: o barril `@iefa/sisub-domain`
	 * carrega Drizzle e as operations inteiras, e importá-lo de um componente de tela levaria
	 * isso tudo para o bundle do navegador.
	 */
	perGeneration: number
	/** Quando a geração corrente foi emitida. */
	generatedAt: string | null
	/**
	 * `false` para conta protegida — ela não dispõe de códigos de recuperação (design.md D9).
	 * Os caminhos dela são o fator reserva e o reset administrativo.
	 */
	eligible: boolean
	/** `true` quando há pelo menos um fator verificado: sem fator, não há o que recuperar. */
	hasVerifiedFactor: boolean
	/** `false` quando não há provider de e-mail — a tela avisa que o titular NÃO será notificado. */
	emailNoticeAvailable: boolean
}

export type ConsumedRecoveryCodeResult = {
	/** Quantos fatores verificados foram removidos. */
	removedFactors: number
	/** Códigos que sobraram. */
	remaining: number
	/**
	 * `false` quando o GoTrue encerrou as sessões do titular ao remover um fator verificado
	 * (comportamento documentado do `deleteFactor`) — a tela manda entrar de novo com a senha.
	 */
	sessionActive: boolean
	/** `true` se o aviso por e-mail foi despachado. Best-effort: `false` não é falha (D16). */
	emailNotified: boolean
}

export type GeneratedRecoveryCodesResult = {
	/** Os códigos em claro. Existem AQUI e em nenhum outro lugar — a tela os mostra uma vez. */
	codes: string[]
	generatedAt: string
	/** Quantos códigos da geração anterior foram invalidados. */
	invalidated: number
}

// ============================================================================
// Helpers
// ============================================================================

/** Erro de regra deste módulo, com o status já sinalizado (ver `lib/domain-errors.ts`). */
function fail(message: string, status = 400): never {
	setResponseStatus(status)
	throw new Error(message)
}

/**
 * Origem da requisição para o limite de tentativas.
 *
 * `x-forwarded-for` porque o app roda atrás do ALB; sem o cabeçalho, todas as requisições
 * caem num balde só — pior granularidade, nunca menos limite.
 */
function requestOrigin(): string {
	return clientIpFromForwardedFor(getRequest()?.headers.get("x-forwarded-for")) ?? UNKNOWN_ORIGIN
}

/** Fatores VERIFICADOS do titular, lidos pelo admin API (o client de sessão exige AAL2 para agir). */
async function listVerifiedFactors(userId: string): Promise<{ id: string }[]> {
	const { data, error } = await getAccessControlClient().auth.admin.mfa.listFactors({ userId })
	if (error) {
		setResponseStatus(400)
		throw new Error(getAuthErrorMessage(error))
	}
	return (data?.factors ?? []).filter((factor) => factor.status === "verified").map((factor) => ({ id: factor.id }))
}

// ============================================================================
// Leitura
// ============================================================================

/**
 * Estado dos códigos de recuperação da conta autenticada.
 *
 * Leitura pura: nenhuma elevação é exigida para abri-la (design.md D3). Nunca devolve hash
 * nem código em claro — só a contagem.
 */
export const getRecoveryCodeOverviewFn = createServerFn({ method: "GET" }).handler(async (): Promise<RecoveryCodeOverview> => {
	const ctx = await requireAuth()
	const [status, factors] = await Promise.all([getRecoveryCodeStatus(getDb(), ctx).catch(handleDomainError), listVerifiedFactors(ctx.userId)])

	return {
		available: status.available,
		perGeneration: RECOVERY_CODE_COUNT,
		generatedAt: status.generatedAt,
		eligible: !isProtectedAccount(ctx.permissions, assuranceReachability()),
		hasVerifiedFactor: factors.length > 0,
		emailNoticeAvailable: getServerCapabilities().securityEmail,
	}
})

// ============================================================================
// Emissão
// ============================================================================

/**
 * Emite dez códigos novos e invalida os anteriores.
 *
 * ## Conta protegida não recebe códigos
 *
 * A condição é DERIVADA do registro de classificação (`assuranceReachability()` ×
 * `isProtectedAccount`), nunca de um número de nível PBAC: a execução orçamentária passa por
 * `unit` nível **2**, e amarrar a regra a "nível 3" devolveria ao operador que empenha um
 * caminho de "senha + folha de papel" — exatamente o que a mudança fecha (design.md D9).
 *
 * ## Por que exige AAL2 nesta sessão
 *
 * Emitir códigos é criar dez credenciais que removem o segundo fator. Feito a partir de uma
 * sessão AAL1, bastaria a senha para minerar o caminho de volta e o segundo fator viraria
 * enfeite. A verificação do fator, que acontece imediatamente antes no fluxo de cadastro, já
 * deixa a sessão em AAL2 — então a exigência não custa nada a quem chegou pelo caminho certo.
 */
export const generateRecoveryCodesFn = createServerFn({ method: "POST" }).handler(async (): Promise<GeneratedRecoveryCodesResult> => {
	const ctx = await requireAuth()
	await requireNonRecoverySession()

	if (isProtectedAccount(ctx.permissions, assuranceReachability())) {
		fail("Sua conta alcança operações críticas e não utiliza códigos de recuperação. Cadastre um dispositivo reserva.", 403)
	}

	const factors = await listVerifiedFactors(ctx.userId)
	if (factors.length === 0) fail("Cadastre a verificação em duas etapas antes de gerar códigos de recuperação.", 400)
	if (ctx.aal !== 2) fail("Confirme um código do seu aplicativo autenticador antes de gerar novos códigos de recuperação.", 403)

	return withSensitiveAudit(
		"generateRecoveryCodesFn",
		ctx,
		(assurance) => generateRecoveryCodes(getDb(), ctx, assurance),
		// O ALVO é o próprio ator, e o log guarda apenas a CONTAGEM. Um código, um hash ou
		// um prefixo de código no `target` transformaria a trilha de auditoria numa lista de
		// credenciais — e ela é lida por `admin` nível 3, não pelo dono.
		(result) => ({ count: result.codes.length, invalidated: result.invalidated })
	).catch(handleDomainError)
})

// ============================================================================
// Consumo
// ============================================================================

/**
 * Consome um código de recuperação: remove os fatores verificados e registra a ocorrência.
 *
 * ## Ordem, e por que ela é essa
 *
 * 1. **Limite de tentativas** — antes de qualquer trabalho, e o palpite errado só conta
 *    DEPOIS de recusado (`recordFailure`), para que um código certo não gaste o orçamento.
 * 2. **Consumo do código** — uma única UPDATE com `used_at is null` no `where`: é o banco
 *    que decide quem ganhou a corrida entre duas requisições com o mesmo código.
 * 3. **Remoção dos fatores** pelo admin API.
 * 4. **`refreshSession()`** (design.md D13). Falhar aqui **não** interrompe: o `deleteFactor`
 *    encerra as sessões do titular quando o fator era verificado, então a falha do refresh é
 *    o caso ESPERADO, não uma exceção. Interromper aqui pularia os dois registros logo
 *    abaixo e deixaria uma conta sem fator sem nenhum rastro de como ficou assim.
 * 5. **`mfa_reset_log` com `method = 'recovery-code'`** e, no envelope, o
 *    `sensitive_operation_log` — os dois gravados ANTES de a resposta voltar, como a spec
 *    exige.
 * 6. **E-mail**, por último e fora do envelope: entrega adicional, best-effort declarada
 *    (design.md D16). O canal garantido é o banco.
 *
 * ## O piso de garantia NÃO é aplicado aqui, e não pode ser
 *
 * A classificação no registro existe pelo LOG. Exigir garantia de identidade para consumir
 * um código de recuperação seria pedir o segundo fator a quem acabou de perdê-lo — o impasse
 * exato que o código existe para resolver. Por isso `consumeRecoveryCode` (o domínio) não
 * aceita `AssuranceRequirement` nenhum: não é disciplina de quem chama, é ausência de
 * parâmetro.
 */
export const consumeRecoveryCodeFn = createServerFn({ method: "POST" })
	.validator(ConsumeRecoveryCodeSchema)
	.handler(async ({ data }): Promise<ConsumedRecoveryCodeResult> => {
		const ctx = await requireAuth()
		const user = await requireUser()
		// Sessão nascida de link de recuperação de SENHA não remove fator (spec `mfa-recovery`):
		// quem entrou por e-mail provou acesso à caixa, não conhecimento da senha — e é
		// justamente a caixa que o adversário costuma ter.
		await requireNonRecoverySession()

		if (isProtectedAccount(ctx.permissions, assuranceReachability())) {
			fail("Sua conta não utiliza códigos de recuperação. Use seu dispositivo reserva ou procure um administrador.", 403)
		}

		const attempt = { userId: ctx.userId, origin: requestOrigin() }
		const verdict = RECOVERY_ATTEMPT_LIMITER.assess(attempt)
		if (!verdict.allowed) fail(attemptBlockedMessage(verdict), 429)

		const result = await withSensitiveAudit(
			"consumeRecoveryCodeFn",
			ctx,
			async (): Promise<Omit<ConsumedRecoveryCodeResult, "emailNotified">> => {
				const consumed = await consumeRecoveryCode(getDb(), ctx, data).catch((error: unknown) => {
					// Só o palpite ERRADO conta. Falha de banco não pode consumir o orçamento de
					// tentativas de quem não errou nada.
					if (error instanceof DomainError && error.code === "RECOVERY_CODE_INVALID") RECOVERY_ATTEMPT_LIMITER.recordFailure(attempt)
					return handleDomainError(error)
				})
				RECOVERY_ATTEMPT_LIMITER.recordSuccess(attempt)

				const admin = getAccessControlClient()
				const factors = await listVerifiedFactors(ctx.userId)
				for (const factor of factors) {
					const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: ctx.userId })
					if (error) {
						setResponseStatus(502)
						throw new Error(getAuthErrorMessage(error))
					}
				}

				// Best-effort por construção: o `deleteFactor` de um fator verificado encerra as
				// sessões do titular, então o refresh falhar é o caminho comum. O que importa é
				// que a sessão NÃO siga elevada com o fator já removido — e, encerrada, ela não segue.
				const { error: refreshError } = await getSupabaseAuthClient()
					.auth.refreshSession()
					.catch(() => ({ error: new Error("refresh indisponível") }))

				await recordMfaReset(getDb(), ctx, { targetUserId: ctx.userId, method: "recovery-code" }).catch(handleDomainError)

				return { removedFactors: factors.length, remaining: consumed.remaining, sessionActive: !refreshError }
			},
			(audited) => ({ method: "recovery-code", removedFactors: audited.removedFactors, remainingCodes: audited.remaining })
		)

		// Depois dos DOIS registros, e nunca como condição deles.
		const emailNotified = await sendSecurityNotice({ to: user.email, kind: "mfa-removed-by-recovery-code" })
		return { ...result, emailNotified }
	})
