/**
 * @module mfa.fn
 * Verificação em duas etapas (TOTP) da conta do próprio usuário.
 *
 * CLIENT: `getSupabaseAuthClient()` — client SSR de auth, per-request, com a chave
 * publishable. É ele que lê a sessão do cookie e, no `verify`/`refreshSession`, grava os
 * cookies novos. Nenhuma fn deste arquivo aceita id de usuário: o titular sai SEMPRE da
 * sessão (`requireAuth()`/`requireUser()`).
 *
 * ## Por que o fluxo é servidor, e não o `supabase.auth.mfa` do navegador
 *
 * Duas coisas só existem aqui: a reautenticação por senha antes do PRIMEIRO fator
 * (design.md D14) e o registro em `access_control.sensitive_operation_log`. Feitas no
 * navegador, as duas seriam opcionais para quem chama o GoTrue direto — e um controle que o
 * cliente pode pular não é controle.
 *
 * Limite conhecido, e ele é da plataforma: quem tem o access token pode chamar a API do
 * GoTrue por fora do app. O que este módulo garante é que o CAMINHO DO SISUB pede a senha e
 * deixa rastro, não que o GoTrue deixe de existir.
 *
 * ## Depois de verificar ou remover, a tela recarrega INTEIRA
 *
 * `verify` e `refreshSession` emitem um par de tokens novo, que este módulo grava nos cookies.
 * O client do navegador, porém, guarda a sessão ANTIGA em memória e só a releria do cookie num
 * boot novo — e continuaria renovando com um refresh token já rodado. Por isso a UI destas
 * telas conclui com recarga de página (`window.location`), e não com `router.invalidate()`.
 *
 * @domain external
 * @migration n-a
 */

import { getAuthErrorMessage } from "@iefa/auth-kit"
import { isProtectedAccount } from "@iefa/pbac"
import { getRecoveryCodeStatus } from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { setResponseStatus } from "@tanstack/react-start/server"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { requireAuth, requireUser } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { verifyAccountPassword } from "@/lib/reauthentication.server"
import { getSessionClaims, requireNonRecoverySession } from "@/lib/session-claims.server"
import { getSupabaseAuthClient } from "@/lib/supabase.server"
import { assuranceReachability } from "@/server/assurance-registry"

// ============================================================================
// Tipos expostos à UI
// ============================================================================

/** Fator cadastrado, na projeção que a tela de segurança consome. */
export type MfaFactor = {
	id: string
	friendlyName: string | null
	factorType: string
	status: "verified" | "unverified"
	createdAt: string
	updatedAt: string
}

export type MfaOverview = {
	/** Apenas fatores VERIFICADOS: um cadastro abandonado não protege nada e não se lista. */
	factors: MfaFactor[]
	verifiedCount: number
	/** Garantia da sessão ATUAL. 2 = segundo fator já verificado nesta sessão. */
	aal: 1 | 2
	/**
	 * Conta que alcança operação classificada como `"session"`/`"fresh"` — derivada do
	 * registro de classificação, nunca de um número de nível PBAC (design.md D9).
	 */
	isProtectedAccount: boolean
	/** `true` quando falta o fator reserva OBRIGATÓRIO (conta protegida com um fator só). */
	needsBackupFactor: boolean
	/** `false` quando a sessão nasceu de link de recuperação — nem cadastra nem remove. */
	canManageFactors: boolean
	/**
	 * `true` quando o desafio pode oferecer o atalho "Usar um código de recuperação".
	 *
	 * Depende de duas coisas ao mesmo tempo, e as duas precisam vir daqui: a conta NÃO pode
	 * ser protegida (design.md D9 — para ela os caminhos são o fator reserva e o reset
	 * administrativo) e precisa haver código não usado. Oferecer o atalho sem código restante
	 * levaria a pessoa, no pior momento possível, a uma tela sem saída.
	 */
	canUseRecoveryCode: boolean
	/** Códigos de recuperação ainda válidos. Só a contagem — nunca o hash, nunca o código. */
	recoveryCodesAvailable: number
}

/** Sessão ativa do titular, na projeção da tela de segurança. */
export type ActiveSession = {
	id: string
	createdAt: string | null
	lastSeenAt: string | null
	userAgent: string | null
	ip: string | null
	aal: string | null
	/** `true` para a sessão de onde a tela está sendo aberta. */
	isCurrent: boolean
}

export type ActiveSessionList = {
	sessions: ActiveSession[]
	/**
	 * `false` quando a lista não pôde ser consultada.
	 *
	 * Existe para que a tela diga "não foi possível listar" em vez de mostrar um estado
	 * vazio — estado vazio que mente sobre falha é pior do que erro visível: ele afirma
	 * "você não tem outras sessões" justamente quando o sistema não sabe.
	 */
	available: boolean
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Traduz o erro do GoTrue e sinaliza o status HTTP antes de lançar.
 *
 * `setResponseStatus` + `throw new Error` (nunca `throw new Response`): numa server function
 * do TanStack Start, a Response crua volta marcada como `x-tss-raw` e o RPC client RESOLVE a
 * promise com ela. Ver `lib/domain-errors.ts`.
 */
function failAuth(error: unknown, status = 400): never {
	setResponseStatus(status)
	throw new Error(getAuthErrorMessage(error))
}

/** Erro de regra deste módulo (não veio do GoTrue), com o status já sinalizado. */
function fail(message: string, status = 400): never {
	setResponseStatus(status)
	throw new Error(message)
}

type RawFactor = { id: string; friendly_name?: string; factor_type: string; status: string; created_at: string; updated_at: string }

function toMfaFactor(factor: RawFactor): MfaFactor {
	return {
		id: factor.id,
		friendlyName: factor.friendly_name ?? null,
		factorType: factor.factor_type,
		status: factor.status === "verified" ? "verified" : "unverified",
		createdAt: factor.created_at,
		updatedAt: factor.updated_at,
	}
}

/** Fatores da conta autenticada (verificados e não verificados). */
async function fetchFactors(): Promise<MfaFactor[]> {
	const { data, error } = await getSupabaseAuthClient().auth.mfa.listFactors()
	if (error) failAuth(error)
	return (data?.all ?? []).map((factor) => toMfaFactor(factor as RawFactor))
}

const VERIFICATION_CODE = z
	.string()
	.trim()
	// O usuário digita com espaço ("123 456") mais vezes do que se imagina, e o GoTrue
	// recusaria um código correto por causa disso.
	.transform((value) => value.replaceAll(/\s/g, ""))
	.pipe(z.string().regex(/^\d{6}$/, "O código tem 6 dígitos."))

const FRIENDLY_NAME = z.string().trim().min(1, "Dê um nome ao dispositivo.").max(60, "Máximo de 60 caracteres.")

// ============================================================================
// Leitura
// ============================================================================

/**
 * Estado da verificação em duas etapas da conta autenticada.
 *
 * Alimenta a tela de segurança, o cartão do perfil e o desafio do login. Leitura pura —
 * nenhuma elevação é exigida para abri-la (design.md D3: rota e leitura NUNCA disparam
 * pedido de segundo fator).
 */
export const getMfaOverviewFn = createServerFn({ method: "GET" }).handler(async (): Promise<MfaOverview> => {
	const ctx = await requireAuth()
	const [factors, claims, recovery] = await Promise.all([
		fetchFactors(),
		getSessionClaims(),
		// Falha de leitura dos códigos NÃO derruba a visão geral: ela alimenta o desafio do
		// login, e um erro aqui trancaria a tela que a pessoa precisa para entrar. Sem o dado,
		// o atalho de recuperação simplesmente não aparece.
		getRecoveryCodeStatus(getDb(), ctx).catch(() => ({ available: 0, generatedAt: null })),
	])

	const verified = factors.filter((factor) => factor.status === "verified")
	const protectedAccount = isProtectedAccount(ctx.permissions, assuranceReachability())

	return {
		factors: verified,
		verifiedCount: verified.length,
		aal: ctx.aal,
		isProtectedAccount: protectedAccount,
		// Conta protegida com UM fator é conta a um aparelho perdido de ficar irrecuperável:
		// o fator reserva é obrigatório (spec `mfa-enrollment`), e a tela não oferece pular.
		needsBackupFactor: protectedAccount && verified.length > 0 && verified.length < 2,
		canManageFactors: !claims.originatedFromRecovery,
		canUseRecoveryCode: !protectedAccount && recovery.available > 0,
		recoveryCodesAvailable: recovery.available,
	}
})

/**
 * Sessões ativas do titular.
 *
 * Lida direto de `auth.sessions` porque o GoTrue não expõe a lista por API nenhuma — nem no
 * client, nem no `auth.admin`. É SQL cru por falta de alternativa, e não por preferência: o
 * schema `auth` não está no schema Drizzle do domínio e não é exposto ao PostgREST. A
 * consulta é escopada por `ctx.userId` (nunca por um id do payload) e devolve `available:
 * false` se falhar, em vez de uma lista vazia que afirmaria não haver outras sessões.
 */
export const listActiveSessionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<ActiveSessionList> => {
	const ctx = await requireAuth()
	const claims = await getSessionClaims()

	try {
		const rows = await getDb().execute<{
			id: string
			created_at: string | null
			last_seen_at: string | null
			user_agent: string | null
			ip: string | null
			aal: string | null
		}>(sql`
			select s.id::text as id,
			       s.created_at::text as created_at,
			       coalesce(s.refreshed_at, s.updated_at, s.created_at)::text as last_seen_at,
			       s.user_agent as user_agent,
			       host(s.ip) as ip,
			       s.aal::text as aal
			  from auth.sessions s
			 where s.user_id = ${ctx.userId}::uuid
			 order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc
			 limit 20
		`)

		return {
			available: true,
			sessions: [...rows].map((row) => ({
				id: row.id,
				createdAt: row.created_at,
				lastSeenAt: row.last_seen_at,
				userAgent: row.user_agent,
				ip: row.ip,
				aal: row.aal,
				isCurrent: claims.sessionId !== null && claims.sessionId === row.id,
			})),
		}
	} catch {
		// Sem permissão de leitura no schema `auth`, ou o formato da tabela mudou. A tela
		// segue oferecendo "encerrar as outras sessões", que não depende desta consulta.
		return { available: false, sessions: [] }
	}
})

// ============================================================================
// Cadastro
// ============================================================================

/**
 * Inicia o cadastro de um fator TOTP e devolve o segredo para o aplicativo autenticador.
 *
 * ## A senha é exigida no PRIMEIRO fator, e só nele
 *
 * Sem fator verificado na conta, `enroll` roda a partir de AAL1 — e uma sessão roubada
 * cadastraria o TOTP do atacante, desconectando o titular de tudo ao verificar (design.md
 * D14). A senha, conferida imediatamente antes, é o que fecha essa janela. Do segundo fator
 * em diante o GoTrue já responde `403 insufficient_aal` fora de AAL2, e repetir a senha ali
 * seria atrito sem ganho.
 *
 * Nada de sessão do titular é encerrado quando a senha não confere: a conferência roda num
 * client sem estado, e a recusa acontece ANTES do `enroll`.
 */
export const startMfaEnrollmentFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			friendlyName: FRIENDLY_NAME,
			/** Obrigatória apenas no primeiro fator — validada no handler, que sabe quantos existem. */
			password: z.string().optional(),
		})
	)
	.handler(async ({ data }): Promise<{ factorId: string; secret: string; uri: string }> => {
		const user = await requireUser()
		await requireNonRecoverySession()

		const factors = await fetchFactors()
		const hasVerifiedFactor = factors.some((factor) => factor.status === "verified")

		if (!hasVerifiedFactor) {
			if (!data.password) fail("Confirme a senha da sua conta para cadastrar o primeiro dispositivo.", 400)
			// O e-mail vem da SESSÃO. Aceitá-lo do payload transformaria isto num oráculo de
			// senha de qualquer conta do sistema.
			const passwordMatches = await verifyAccountPassword(user.email ?? "", data.password)
			if (!passwordMatches) fail("Senha incorreta.", 403)
		}

		// Cadastro abandonado antes da verificação deixa um fator `unverified` para trás, e o
		// GoTrue recusa um nome repetido — a pessoa ficaria presa num erro que ela não tem
		// como entender nem resolver pela tela. Limpeza best-effort, só do NÃO verificado.
		const supabase = getSupabaseAuthClient()
		for (const stale of factors) {
			if (stale.status === "unverified" && stale.friendlyName === data.friendlyName) {
				await supabase.auth.mfa.unenroll({ factorId: stale.id }).catch(() => undefined)
			}
		}

		// `totp` e nada mais: a spec proíbe `phone` (SMS não é fator de posse confiável e
		// custa por mensagem).
		const { data: enrolled, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: data.friendlyName })
		if (error || !enrolled) failAuth(error, 400)

		// `qr_code` do GoTrue é um SVG que só entraria na tela por `dangerouslySetInnerHTML`.
		// A URI basta: quem desenha o QR é o `qrcode.react`, que o app já usa.
		return { factorId: enrolled.id, secret: enrolled.totp.secret, uri: enrolled.totp.uri }
	})

/**
 * Conclui o cadastro: desafia o fator recém-criado e verifica o código de 6 dígitos.
 *
 * Concluído, o fator fica `verified`, a sessão ATUAL sobe para AAL2 e o GoTrue encerra as
 * demais sessões do titular — por isso a tela avisa antes do botão.
 *
 * ## O piso do registro NÃO é repassado a guard nenhum aqui, e é de propósito
 *
 * `withSensitiveAudit` entrega a `run` o piso que o registro declara, para o chamador o
 * repassar à domain operation. Esta operação não tem domain operation: quem a executa é o
 * GoTrue, e o piso dele já é o certo (`unenroll` e `enroll` de segundo fator exigem AAL2 por
 * conta própria). Aplicar o piso do registro aqui criaria um impasse: a verificação do
 * PRIMEIRO fator é justamente o que PRODUZ o AAL2 — exigi-lo antes trancaria toda conta sem
 * fator fora do cadastro, para sempre. A classificação existe pelo LOG (spec de auditoria:
 * cadastro de fator é evento de segurança registrado).
 */
export const verifyMfaEnrollmentFn = createServerFn({ method: "POST" })
	.validator(z.object({ factorId: z.string().min(1), code: VERIFICATION_CODE }))
	.handler(async ({ data }): Promise<{ factorId: string }> => {
		const ctx = await requireAuth()
		await requireNonRecoverySession()

		return withSensitiveAudit(
			"verifyMfaEnrollmentFn",
			ctx,
			async () => {
				const supabase = getSupabaseAuthClient()
				const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.factorId })
				if (challengeError || !challenge) failAuth(challengeError, 400)

				const { error } = await supabase.auth.mfa.verify({ factorId: data.factorId, challengeId: challenge.id, code: data.code })
				if (error) failAuth(error, 400)

				return { factorId: data.factorId }
			},
			(result) => ({ factorId: result.factorId, factorType: "totp" })
		)
	})

/**
 * Descarta um cadastro iniciado e não concluído.
 *
 * Chamada quando o usuário fecha a tela no meio do caminho. Recusa remover fator VERIFICADO —
 * remoção de verdade é `unenrollMfaFactorFn`, que é auditada.
 */
export const cancelMfaEnrollmentFn = createServerFn({ method: "POST" })
	.validator(z.object({ factorId: z.string().min(1) }))
	.handler(async ({ data }): Promise<{ success: true }> => {
		await requireUser()
		const factors = await fetchFactors()
		const target = factors.find((factor) => factor.id === data.factorId)
		if (!target) return { success: true }
		if (target.status === "verified") fail("Este dispositivo já está verificado. Use a remoção para excluí-lo.", 400)

		const { error } = await getSupabaseAuthClient().auth.mfa.unenroll({ factorId: data.factorId })
		if (error) failAuth(error, 400)
		return { success: true }
	})

// ============================================================================
// Remoção
// ============================================================================

/**
 * Remove um fator do próprio usuário.
 *
 * `mfa.unenroll()` exige AAL2 — é o GoTrue quem aplica esse piso, e ele é o certo. Removido o
 * ÚLTIMO fator verificado, `refreshSession()` é OBRIGATÓRIO (design.md D13): o rebaixamento de
 * AAL2 para AAL1 só valeria no próximo refresh, e até lá a sessão seguiria elevada por até uma
 * hora com o fator já removido.
 */
export const unenrollMfaFactorFn = createServerFn({ method: "POST" })
	.validator(z.object({ factorId: z.string().min(1) }))
	.handler(async ({ data }): Promise<{ factorId: string; sessionDowngraded: boolean }> => {
		const ctx = await requireAuth()
		await requireNonRecoverySession()

		return withSensitiveAudit(
			"unenrollMfaFactorFn",
			ctx,
			async () => {
				const supabase = getSupabaseAuthClient()
				const factors = await fetchFactors()
				const target = factors.find((factor) => factor.id === data.factorId)
				if (!target) fail("Dispositivo não encontrado nesta conta.", 404)

				const verifiedCount = factors.filter((factor) => factor.status === "verified").length
				const removingLastVerified = target.status === "verified" && verifiedCount <= 1

				const { error } = await supabase.auth.mfa.unenroll({ factorId: data.factorId })
				if (error) failAuth(error, 403)

				if (removingLastVerified) {
					// Falha aqui não desfaz a remoção; o que ela deixa é uma sessão elevada por
					// mais tempo do que devia, e isso tem que aparecer.
					const { error: refreshError } = await supabase.auth.refreshSession()
					if (refreshError) failAuth(refreshError, 400)
				}

				return { factorId: data.factorId, sessionDowngraded: removingLastVerified }
			},
			(result) => ({ factorId: result.factorId, factorType: "totp", sessionDowngraded: result.sessionDowngraded })
		)
	})

// ============================================================================
// Desafio de login e sessões
// ============================================================================

/**
 * Verifica o código de 6 dígitos de um fator JÁ cadastrado — o desafio do login.
 *
 * Não é cadastro nem remoção: nada é criado nem apagado, a sessão apenas sobe para AAL2. Por
 * isso não entra no registro de operações sensíveis — uma linha por login esvaziaria a única
 * lista que um auditor precisa conseguir ler.
 */
export const verifyMfaChallengeFn = createServerFn({ method: "POST" })
	.validator(z.object({ factorId: z.string().min(1), code: VERIFICATION_CODE }))
	.handler(async ({ data }): Promise<{ success: true }> => {
		await requireUser()

		const supabase = getSupabaseAuthClient()
		const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: data.factorId })
		if (challengeError || !challenge) failAuth(challengeError, 400)

		const { error } = await supabase.auth.mfa.verify({ factorId: data.factorId, challengeId: challenge.id, code: data.code })
		if (error) failAuth(error, 400)

		return { success: true }
	})

/**
 * Encerra todas as sessões do titular EXCETO esta.
 *
 * Escopo `others` de propósito: `global` derrubaria também quem está na tela, e o usuário que
 * clicou em "encerrar as outras" seria deslogado pelo próprio botão.
 */
export const signOutOtherSessionsFn = createServerFn({ method: "POST" }).handler(async (): Promise<{ success: true }> => {
	await requireUser()

	const { error } = await getSupabaseAuthClient().auth.signOut({ scope: "others" })
	if (error) failAuth(error, 400)
	return { success: true }
})
