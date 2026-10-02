/**
 * Autorização de cadastro de e-mail fora de `@fab.mil.br` (`access_control.signup_allowlist`).
 *
 * ## Por que existe
 *
 * Desde 20261001100100 o hook "Before User Created" do Supabase Auth recusa criar conta de e-mail
 * que não seja `@fab.mil.br` — em TODO caminho, inclusive `auth.admin.inviteUserByEmail`. A lista
 * é a exceção explícita, por e-mail, para parceiros (GS1, por exemplo): o administrador autoriza
 * e convida; o hook deixa passar.
 *
 * ## Autorização e auditoria
 *
 * `admin` nível 2, a mesma linha das concessões de permissão. Autorizar e revogar são mudança de
 * ACESSO: passam pelas funções SQL auditadas (`authorize_external_signup` /
 * `revoke_external_signup`), que gravam a mudança e a linha de
 * `access_control.sensitive_operation_log` na MESMA transação, com o ator da sessão
 * (`ctx.userId`). O banco recusa escrita direta na tabela (trigger de 20261001100000).
 *
 * Revogar NÃO apaga a conta já criada: só impede criação nova. Bloquear quem já tem conta é
 * outra operação (permissões, bloqueio de módulo, ou exclusão da conta no dashboard).
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { sql } from "drizzle-orm"
import { type AssuranceRequirement, NO_ASSURANCE, requireAssurance } from "../guards/require-assurance.ts"
import { requirePermission } from "../guards/require-permission.ts"
import type { AuthorizeExternalSignup, RevokeExternalSignup } from "../schemas/signup-allowlist.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import { type AccessAudit, defaultAccessAudit, runAccessFunction } from "./access-change.ts"

/** Linha da lista como a tela a mostra. */
export type SignupAllowlistRow = {
	id: string
	email: string
	reason: string
	created_at: string
	authorized_by_email: string | null
	revoked_at: string | null
	revoked_by_email: string | null
	/** Já existe conta com este e-mail no Auth (criada pelo convite, pelo cadastro ou antes). */
	has_account: boolean
}

/** Erros de contrato das duas funções, na língua de quem está na tela. */
const SIGNUP_OVERRIDES = {
	SIGNUP_ALLOWLIST_INSTITUTIONAL: new DomainError(
		"SIGNUP_INSTITUTIONAL_EMAIL",
		"E-mails @fab.mil.br já podem se cadastrar sem autorização. Não é preciso autorizá-los aqui."
	),
	SIGNUP_ALLOWLIST_ALREADY_ACTIVE: new DomainError("CONFLICT", "Este e-mail já tem uma autorização ativa."),
	ACCESS_CHANGE_INVALID: new DomainError("INVALID_INPUT", "E-mail ou motivo inválido. Confira os dois campos e tente de novo."),
}

/** Autorizações, as ativas primeiro. Leitura do console de acesso (`admin` nível 2). */
export async function listSignupAllowlist(db: SisubDb, ctx: UserContext): Promise<SignupAllowlistRow[]> {
	requirePermission(ctx, "admin", 2)
	const rows = await runQuery("FETCH_FAILED", () =>
		// `accounts`: uma passada só em auth.users. O GoTrue pode guardar e-mail com caixa (o
		// cadastro antigo não normalizava), então a comparação é por `lower()`, e um `exists`
		// correlacionado com `lower()` faria uma varredura por linha da lista.
		db.execute(sql`
			with accounts as (
				select distinct lower(u.email) as email from auth.users u
				where lower(u.email) in (select l.email from access_control.signup_allowlist l)
			)
			select
				a.id,
				a.email,
				a.reason,
				a.created_at,
				authorizer.email as authorized_by_email,
				a.revoked_at,
				revoker.email as revoked_by_email,
				acc.email is not null as has_account
			from access_control.signup_allowlist a
			left join accounts acc on acc.email = a.email
			left join auth.users authorizer on authorizer.id = a.authorized_by
			left join auth.users revoker on revoker.id = a.revoked_by
			order by (a.revoked_at is null) desc, a.created_at desc
			limit 500
		`)
	)
	return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
		id: String(row.id),
		email: String(row.email),
		reason: String(row.reason),
		created_at: toIso(row.created_at) ?? "",
		authorized_by_email: (row.authorized_by_email as string | null) ?? null,
		revoked_at: toIso(row.revoked_at),
		revoked_by_email: (row.revoked_by_email as string | null) ?? null,
		has_account: Boolean(row.has_account),
	}))
}

/** O driver devolve `timestamptz` como `Date` (ou texto, se o parser for trocado). */
function toIso(value: unknown): string | null {
	if (value == null) return null
	return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * Autoriza o e-mail a ganhar conta. O convite é do chamador, DEPOIS desta chamada: o hook só
 * enxerga a autorização gravada.
 */
export async function authorizeExternalSignup(
	db: SisubDb,
	ctx: UserContext,
	input: AuthorizeExternalSignup,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("authorizeExternalSignup")
): Promise<{ id: string; email: string; log_id: string }> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	const result = await runAccessFunction<{ id: string; email: string; log_id: string }>(
		db,
		sql`access_control.authorize_external_signup(
			${ctx.userId}::uuid, ${audit.operation}::text, ${input.email}::text, ${input.reason}::text, ${audit.grade}::text
		)`,
		{ fallbackCode: "INSERT_FAILED", overrides: SIGNUP_OVERRIDES }
	)
	return { id: result.id, email: result.email, log_id: result.log_id }
}

/**
 * Revoga a autorização. A conta que já existe NÃO é apagada. Revogar a já revogada não é erro
 * nem é registrado (nada aconteceu).
 */
export async function revokeExternalSignup(
	db: SisubDb,
	ctx: UserContext,
	input: RevokeExternalSignup,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("revokeExternalSignup")
): Promise<{ log_id: string | null; changed: boolean }> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	const result = await runAccessFunction<{ log_id: string | null; changed: boolean }>(
		db,
		sql`access_control.revoke_external_signup(${ctx.userId}::uuid, ${audit.operation}::text, ${input.id}::uuid, ${audit.grade}::text)`,
		{
			fallbackCode: "REVOKE_FAILED",
			overrides: { SIGNUP_ALLOWLIST_NOT_FOUND: new DomainError("NOT_FOUND", "Autorização não encontrada. Atualize a lista e tente de novo.") },
		}
	)
	return { log_id: result.log_id ?? null, changed: Boolean(result.changed) }
}
