/**
 * @module signup-allowlist.fn
 * Autorização de cadastro de e-mail FORA de `@fab.mil.br`, no console de acesso do sisub.
 *
 * Desde 20261001100100 o hook "Before User Created" do Supabase Auth recusa criar conta de
 * e-mail que não seja institucional — inclusive pelo convite do admin API. Para um parceiro
 * (GS1, por exemplo) ganhar conta, o administrador AUTORIZA o e-mail (função auditada, log na
 * mesma transação) e o sisub CONVIDA (`auth.admin.inviteUserByEmail`), nessa ordem: o hook só
 * enxerga a autorização já gravada.
 *
 * Mesma linha das fns de permissão: `admin` nível 2, garantia `fresh` pelo registro,
 * `withAtomicAudit` (quem grava o log é a função SQL). Revogar NÃO apaga a conta já criada.
 *
 * @domain core
 * @migration 20261001100000_signup_allowlist
 */

import { getAuthErrorMessage } from "@iefa/auth-kit"
import {
	AuthorizeExternalSignupSchema,
	authorizeExternalSignup,
	listSignupAllowlist,
	RevokeExternalSignupSchema,
	revokeExternalSignup,
	type SignupAllowlistRow,
} from "@iefa/sisub-domain"
import { createServerFn } from "@tanstack/react-start"
import { withAtomicAudit } from "@/lib/audit.server"
import { requireAuthWithPermission } from "@/lib/auth.server"
import { getDb } from "@/lib/db.server"
import { handleDomainError } from "@/lib/domain-errors"
import { SISUB_PUBLIC_URL } from "@/lib/security-email.server"
import { getAccessControlClient } from "@/lib/supabase.server"
import { enforcedAssuranceFor } from "@/server/assurance-registry"

export type { SignupAllowlistRow }

/**
 * Desfecho do convite, que acontece DEPOIS da autorização gravada e nunca a desfaz:
 *   - `sent`: o Auth enviou o e-mail de convite;
 *   - `account-exists`: o e-mail já tem conta (as contas antigas fora da FAB continuam entrando);
 *   - `failed`: o convite falhou (limite de e-mail, SMTP). A autorização fica, mas a pessoa
 *     depende do convite — os formulários de cadastro dos apps só aceitam @fab.mil.br. Reenviar
 *     é revogar e autorizar de novo.
 */
export type ExternalSignupInvite = { status: "sent" } | { status: "account-exists" } | { status: "failed"; message: string }

export type AuthorizeExternalSignupResult = { id: string; email: string; invite: ExternalSignupInvite }

/**
 * Para onde o link do convite volta: a tela de definir senha. A pessoa convidada não tem senha;
 * o link abre uma sessão e a tela pede a senha nova. O convite do admin API não tem code
 * verifier, então o GoTrue volta no fluxo IMPLÍCITO (`#access_token=…&type=invite`) — que o
 * client PKCE do navegador recusa sozinho; `/auth/reset-password` o consome à mão
 * (`readImplicitSession`, `lib/auth-otp.ts`). O caminho já está na allow-list de redirect do
 * projeto (é o mesmo da recuperação de senha).
 */
const INVITE_REDIRECT = `${SISUB_PUBLIC_URL}/auth/reset-password`

async function invite(email: string): Promise<ExternalSignupInvite> {
	const { error } = await getAccessControlClient().auth.admin.inviteUserByEmail(email, { redirectTo: INVITE_REDIRECT })
	if (!error) return { status: "sent" }
	if (error.code === "email_exists" || /already been registered/i.test(error.message)) return { status: "account-exists" }
	return { status: "failed", message: getAuthErrorMessage(error) }
}

export const listSignupAllowlistFn = createServerFn({ method: "GET" }).handler(async (): Promise<SignupAllowlistRow[]> => {
	const ctx = await requireAuthWithPermission("admin", 2)
	return listSignupAllowlist(getDb(), ctx).catch(handleDomainError)
})

export const authorizeExternalSignupFn = createServerFn({ method: "POST" })
	.validator(AuthorizeExternalSignupSchema)
	.handler(async ({ data }): Promise<AuthorizeExternalSignupResult> => {
		const ctx = await requireAuthWithPermission("admin", 2, undefined, enforcedAssuranceFor("authorizeExternalSignupFn"))
		const authorized = await withAtomicAudit("authorizeExternalSignupFn", ({ assurance, audit }) =>
			authorizeExternalSignup(getDb(), ctx, data, assurance, audit)
		).catch(handleDomainError)
		// Fora da transação, e depois dela: o hook do Auth lê a autorização JÁ gravada.
		return { id: authorized.id, email: authorized.email, invite: await invite(authorized.email) }
	})

export const revokeExternalSignupFn = createServerFn({ method: "POST" })
	.validator(RevokeExternalSignupSchema)
	.handler(async ({ data }) => {
		const ctx = await requireAuthWithPermission("admin", 2, undefined, enforcedAssuranceFor("revokeExternalSignupFn"))
		return withAtomicAudit("revokeExternalSignupFn", ({ assurance, audit }) => revokeExternalSignup(getDb(), ctx, data, assurance, audit)).catch(
			handleDomainError
		)
	})
