/**
 * Vínculo de SARAM verificado e tipo de conta (change `saram-verified-link`, migration
 * 20261003100000).
 *
 * ## A regra mora no banco
 *
 * Cada operação daqui é UMA chamada a uma função `core.*` (uma transação): a chave do e-mail usa
 * o nome completo do cadastro e a conferência usa o CPF, e nenhum dos dois sai do banco (LGPD,
 * `military-roster-personal-data`). O sucont chama as MESMAS funções por RPC
 * (`apps/sucont/src/server/user.fn.ts`), então sisub e sucont não divergem. Este módulo aplica o
 * PBAC das operações de administrador, traduz os erros estáveis e tipa o retorno.
 *
 * ## Identidade
 *
 * `SaramSession` (conta, e-mail, e-mail confirmado) vem SEMPRE da sessão, no servidor. O ator das
 * operações de administrador é `ctx.userId`; nenhuma aceita ator por parâmetro.
 *
 * Os tipos do banco (`db:types`, `db:drizzle:pull`) só existem depois do apply: as chamadas são
 * `db.execute(sql…)` e o retorno é o `jsonb` das funções, tipado aqui.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import {
	type EmailEligibility,
	type MilitaryIdentitySummary,
	parseSaramOutcome,
	parseSaramStatus,
	SARAM_ERROR_MESSAGES,
	type SaramCandidate,
	type SaramLinkAction,
	type SaramLinkOutcome,
	type SaramLinkOutcomeName,
	type SaramLinkRequestSummary,
	type SaramLinkStatusName,
	type SaramStatus,
	type SaramVerification,
} from "@iefa/database/saram-link"
import { type SQL, sql } from "drizzle-orm"
import { type AssuranceRequirement, NO_ASSURANCE, requireAssurance } from "../guards/require-assurance.ts"
import { requirePermission } from "../guards/require-permission.ts"
import type {
	AccountKind,
	ConfirmSaramCandidate,
	DecideSaramRequest,
	LinkUserSaram,
	RequestSaramLink,
	SearchSaramAccounts,
	SetOwnAccountKind,
	SetUserAccountKind,
	UnlinkUserSaram,
	VerifySaramByCpf,
	WithdrawSaramRequest,
} from "../schemas/saram-link.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { driverFailure, runQuery, unwrapPgError } from "../utils/index.ts"
import { type AccessAudit, defaultAccessAudit, runAccessFunction, toAccessDomainError } from "./access-change.ts"

// ── Tipos do contrato (`@iefa/database/saram-link`, compartilhado com o sucont e o rumaer) ──

export type {
	EmailEligibility,
	MilitaryIdentitySummary,
	SaramCandidate,
	SaramLinkAction,
	SaramLinkOutcome,
	SaramLinkOutcomeName,
	SaramLinkRequestSummary,
	SaramLinkStatusName,
	SaramStatus,
	SaramVerification,
}
export { parseSaramStatus }

/** Identidade da sessão: o servidor a monta do JWT, nunca do payload. */
export type SaramSession = { userId: string; email: string | null; emailConfirmed: boolean }

// ── Erros estáveis das funções → mensagem para a tela ───────────────────────

const SARAM_ERRORS: Record<string, { code: string; message: string }> = {
	SARAM_INVALID: { code: "INVALID_INPUT", message: SARAM_ERROR_MESSAGES.SARAM_INVALID },
	CPF_INVALID: { code: "INVALID_INPUT", message: SARAM_ERROR_MESSAGES.CPF_INVALID },
	CPF_SUFFIX_INVALID: { code: "INVALID_INPUT", message: SARAM_ERROR_MESSAGES.CPF_SUFFIX_INVALID },
	JUSTIFICATION_INVALID: { code: "INVALID_INPUT", message: SARAM_ERROR_MESSAGES.JUSTIFICATION_INVALID },
	ACCOUNT_KIND_INVALID: { code: "INVALID_INPUT", message: SARAM_ERROR_MESSAGES.ACCOUNT_KIND_INVALID },
	DECISION_INVALID: { code: "INVALID_INPUT", message: SARAM_ERROR_MESSAGES.DECISION_INVALID },
	NOTE_REQUIRED: { code: "INVALID_INPUT", message: SARAM_ERROR_MESSAGES.NOTE_REQUIRED },
	ACCOUNT_INSTITUTIONAL: { code: "ACCOUNT_INSTITUTIONAL", message: SARAM_ERROR_MESSAGES.ACCOUNT_INSTITUTIONAL },
	SARAM_ALREADY_LINKED: { code: "SARAM_ALREADY_LINKED", message: SARAM_ERROR_MESSAGES.SARAM_ALREADY_LINKED },
	SARAM_LOCKED: { code: "SARAM_LOCKED", message: SARAM_ERROR_MESSAGES.SARAM_LOCKED },
	REQUEST_PENDING: { code: "REQUEST_PENDING", message: SARAM_ERROR_MESSAGES.REQUEST_PENDING },
	REQUEST_LIMIT: { code: "REQUEST_LIMIT", message: SARAM_ERROR_MESSAGES.REQUEST_LIMIT },
	EMAIL_NOT_ELIGIBLE: { code: "EMAIL_NOT_ELIGIBLE", message: SARAM_ERROR_MESSAGES.EMAIL_NOT_ELIGIBLE },
	SARAM_TAKEN: { code: "SARAM_TAKEN", message: SARAM_ERROR_MESSAGES.SARAM_TAKEN },
	SARAM_LINK_CHANGED: { code: "CONFLICT", message: SARAM_ERROR_MESSAGES.SARAM_LINK_CHANGED },
	ACCOUNT_KIND_CHANGED: { code: "CONFLICT", message: SARAM_ERROR_MESSAGES.ACCOUNT_KIND_CHANGED },
	REQUEST_NOT_PENDING: { code: "CONFLICT", message: SARAM_ERROR_MESSAGES.REQUEST_NOT_PENDING },
	ACCOUNT_INSTITUTIONAL_NO_MEALS: { code: "ACCOUNT_INSTITUTIONAL", message: SARAM_ERROR_MESSAGES.ACCOUNT_INSTITUTIONAL_NO_MEALS },
	SARAM_LINK_OUTSIDE_FUNCTION: { code: "SARAM_LINK_OUTSIDE_FUNCTION", message: SARAM_ERROR_MESSAGES.SARAM_LINK_OUTSIDE_FUNCTION },
	USER_DATA_NOT_FOUND: { code: "USER_DATA_NOT_FOUND", message: SARAM_ERROR_MESSAGES.USER_DATA_NOT_FOUND },
	CANDIDATE_NOT_FOUND: { code: "CANDIDATE_NOT_FOUND", message: SARAM_ERROR_MESSAGES.CANDIDATE_NOT_FOUND },
	// Desistir de pedido que já não está pendente: conflito com mensagem (a tela relê o estado),
	// não 404 cru.
	REQUEST_NOT_FOUND: { code: "CONFLICT", message: SARAM_ERROR_MESSAGES.REQUEST_NOT_FOUND },
}

/** Traduz o erro da função SQL; o SQL cru vai em `details`, para o log. */
export function toSaramDomainError(error: unknown, fallbackCode = "SARAM_LINK_FAILED"): DomainError {
	if (error instanceof DomainError) return error
	const token = unwrapPgError(error).message ?? ""
	const known = SARAM_ERRORS[token]
	if (known) return new DomainError(known.code, known.message, error)
	// Tokens do envelope de auditoria (ator inexistente, contexto de auditoria).
	if (token.startsWith("ACCESS_")) return toAccessDomainError(error, { fallbackCode })
	// Fora do contrato (conexão, timeout): diagnóstico no log, mensagem genérica para a tela.
	return driverFailure(fallbackCode, error)
}

/** Uma função `core.*` = uma transação; o `jsonb` dela, com os erros do vínculo traduzidos. */
function callSaramFunction(db: SisubDb, call: SQL, fallbackCode: string): Promise<Record<string, unknown>> {
	return runAccessFunction<Record<string, unknown>>(db, call, {}, (error) => toSaramDomainError(error, fallbackCode))
}

// ── Conversão do jsonb (snake_case) para o contrato ─────────────────────────

const str = (v: unknown): string | null => (v == null ? null : String(v))
const bool = (v: unknown): boolean => v === true || v === "true"

function toIdentity(v: unknown): MilitaryIdentitySummary | null {
	if (!v || typeof v !== "object") return null
	const o = v as Record<string, unknown>
	return { posto: str(o.posto), nomeGuerra: str(o.nome_guerra), sgOrg: str(o.sg_org) }
}

const toOutcome = (result: Record<string, unknown>): SaramLinkOutcome => parseSaramOutcome(result)

const session = (s: SaramSession) => sql`${s.userId}::uuid, ${s.email}::text, ${s.emailConfirmed}::boolean`

// ── Comensal (a própria conta) ──────────────────────────────────────────────

/** Estado do vínculo e as ações possíveis. A FASE 2 monta a tela só a partir disto. */
export async function fetchMySaramStatus(db: SisubDb, s: SaramSession): Promise<SaramStatus> {
	const rows = await runQuery("FETCH_FAILED", () => db.execute(sql`select core.saram_link_status(${session(s)}) as result`))
	const raw = (rows as unknown as Array<{ result: unknown }>)[0]?.result
	return parseSaramStatus(typeof raw === "string" ? JSON.parse(raw) : raw)
}

/** Confirma o candidato da chave do e-mail (com os 4 últimos dígitos do CPF, se homônimo). */
export async function confirmSaramCandidate(db: SisubDb, s: SaramSession, input: ConfirmSaramCandidate): Promise<SaramLinkOutcome> {
	return toOutcome(
		await callSaramFunction(
			db,
			sql`core.confirm_saram_candidate(${session(s)}, ${input.candidateRef}::bigint, ${input.cpfSuffix ?? null}::text)`,
			"SARAM_LINK_FAILED"
		)
	)
}

/** SARAM + CPF completo, conferidos no banco; tentativas limitadas. */
export async function verifySaramByCpf(db: SisubDb, s: SaramSession, input: VerifySaramByCpf): Promise<SaramLinkOutcome> {
	return toOutcome(await callSaramFunction(db, sql`core.verify_saram_by_cpf(${session(s)}, ${input.saram}::text, ${input.cpf}::text)`, "SARAM_LINK_FAILED"))
}

/** Pedido de vínculo (ou contestação, se o SARAM está em outra conta) para o administrador. */
export async function requestSaramLink(db: SisubDb, s: SaramSession, input: RequestSaramLink): Promise<SaramLinkOutcome> {
	return toOutcome(
		await callSaramFunction(db, sql`core.request_saram_link(${session(s)}, ${input.saram}::text, ${input.justification}::text)`, "SARAM_REQUEST_FAILED")
	)
}

export async function withdrawSaramRequest(db: SisubDb, s: SaramSession, input: WithdrawSaramRequest): Promise<SaramLinkOutcome> {
	return toOutcome(await callSaramFunction(db, sql`core.withdraw_saram_request(${session(s)}, ${input.requestId}::uuid)`, "SARAM_REQUEST_FAILED"))
}

/** A própria conta se declara institucional (perde SARAM e arranchamentos futuros) ou volta a pessoal. */
export async function setOwnAccountKind(db: SisubDb, s: SaramSession, input: SetOwnAccountKind): Promise<SaramLinkOutcome> {
	return toOutcome(await callSaramFunction(db, sql`core.set_own_account_kind(${session(s)}, ${input.kind}::text)`, "ACCOUNT_KIND_FAILED"))
}

/**
 * SARAM digitado no formulário antigo: vincula por e-mail se for o candidato único da chave do
 * e-mail; senão abre pedido para o administrador. Nunca grava sem verificação.
 */
export async function claimSaram(db: SisubDb, s: SaramSession, saram: string): Promise<SaramLinkOutcome> {
	return toOutcome(await callSaramFunction(db, sql`core.claim_saram(${session(s)}, ${saram}::text)`, "UPSERT_FAILED"))
}

/**
 * SARAM cujos dados militares a conta pode ver (verificado, ou legacy sem verificado concorrente).
 * É por aqui que o perfil lê o cadastro — nunca pela coluna crua.
 */
export async function fetchVisibleSaram(db: SisubDb, input: { userId: string }): Promise<string | null> {
	const rows = await runQuery("FETCH_FAILED", () => db.execute(sql`select core.visible_saram(${input.userId}::uuid) as saram`))
	const value = (rows as unknown as Array<{ saram: string | null }>)[0]?.saram
	return value && value.trim().length > 0 ? value : null
}

/**
 * Recusa antecipada (o trigger do banco é a garantia): conta institucional não tem
 * arranchamento nem presença própria.
 */
export async function assertAccountCanEat(db: SisubDb, userId: string): Promise<void> {
	const rows = await runQuery("FETCH_FAILED", () => db.execute(sql`select account_kind from core.user_data where id = ${userId}::uuid`))
	const kind = (rows as unknown as Array<{ account_kind: string | null }>)[0]?.account_kind
	if (kind === "institucional") {
		const refusal = SARAM_ERRORS.ACCOUNT_INSTITUTIONAL_NO_MEALS
		throw new DomainError(refusal.code, refusal.message)
	}
}

// ── Administrador (admin:2, auditado na mesma transação) ────────────────────

export type SaramQueueRequest = {
	id: string
	kind: "link" | "dispute"
	saram: string
	justification: string
	claimVerifiedBy: "email" | "cpf" | null
	createdAt: string
	updatedAt: string
	requester: { userId: string; email: string | null; accountKind: AccountKind; saram: string | null; verifiedBy: SaramVerification | null }
	holders: Array<{ userId: string; email: string | null; verifiedBy: SaramVerification | null }>
	identity: MilitaryIdentitySummary | null
}

export type SaramQueueLegacy = {
	userId: string
	email: string
	saram: string
	createdAt: string
	/** O mesmo SARAM está verificado em outra conta: esta não vê os dados e deve ser desvinculada. */
	verifiedElsewhere: boolean
	sharedWith: number
	identity: MilitaryIdentitySummary | null
}

export type SaramReviewQueue = {
	requests: SaramQueueRequest[]
	legacy: SaramQueueLegacy[]
	/** SARAM gravado fora do fluxo verificado (app antigo, durante o deploy). */
	unverified: Array<{ userId: string; email: string; saram: string }>
	/** Contas pessoais @fab.mil.br sem vínculo cujo e-mail não bate com ninguém do cadastro. */
	institutionalCandidates: Array<{ userId: string; email: string; createdAt: string }>
	institutional: Array<{ userId: string; email: string }>
}

const list = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [])

export function parseSaramReviewQueue(raw: unknown): SaramReviewQueue {
	const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
	return {
		requests: list(o.requests).map((r) => {
			const req = (r.requester ?? {}) as Record<string, unknown>
			return {
				id: String(r.id),
				kind: (str(r.kind) ?? "link") as "link" | "dispute",
				saram: String(r.saram ?? ""),
				justification: String(r.justification ?? ""),
				claimVerifiedBy: str(r.claim_verified_by) as "email" | "cpf" | null,
				createdAt: String(r.created_at ?? ""),
				updatedAt: String(r.updated_at ?? ""),
				requester: {
					userId: String(req.user_id),
					email: str(req.email),
					accountKind: (str(req.account_kind) ?? "pessoal") as AccountKind,
					saram: str(req.saram),
					verifiedBy: str(req.verified_by) as SaramVerification | null,
				},
				holders: list(r.holders).map((h) => ({ userId: String(h.user_id), email: str(h.email), verifiedBy: str(h.verified_by) as SaramVerification | null })),
				identity: toIdentity(r.identity),
			}
		}),
		legacy: list(o.legacy).map((l) => ({
			userId: String(l.user_id),
			email: String(l.email ?? ""),
			saram: String(l.saram ?? ""),
			createdAt: String(l.created_at ?? ""),
			verifiedElsewhere: bool(l.verified_elsewhere),
			sharedWith: Number(l.shared_with ?? 0),
			identity: toIdentity(l.identity),
		})),
		unverified: list(o.unverified).map((u) => ({ userId: String(u.user_id), email: String(u.email ?? ""), saram: String(u.saram ?? "") })),
		institutionalCandidates: list(o.institutional_candidates).map((c) => ({
			userId: String(c.user_id),
			email: String(c.email ?? ""),
			createdAt: String(c.created_at ?? ""),
		})),
		institutional: list(o.institutional).map((c) => ({ userId: String(c.user_id), email: String(c.email ?? "") })),
	}
}

/** Fila do console de vínculos. */
export async function listSaramReviewQueue(db: SisubDb, ctx: UserContext): Promise<SaramReviewQueue> {
	requirePermission(ctx, "admin", 2)
	const rows = await runQuery("FETCH_FAILED", () => db.execute(sql`select core.saram_review_queue() as result`))
	const raw = (rows as unknown as Array<{ result: unknown }>)[0]?.result
	return parseSaramReviewQueue(typeof raw === "string" ? JSON.parse(raw) : raw)
}

/** Conta encontrada pela busca do console: o que o administrador precisa para agir sobre ela. */
export type SaramSearchAccount = {
	userId: string
	email: string
	accountKind: AccountKind
	/** SARAM gravado na conta (verificado, legacy ou gravado fora do fluxo). */
	saram: string | null
	verifiedBy: SaramVerification | null
	/** O mesmo SARAM está verificado em outra conta. */
	verifiedElsewhere: boolean
	hasPendingRequest: boolean
	identity: MilitaryIdentitySummary | null
}

const SEARCH_LIMIT = 20

/** `%`/`_`/`\` digitados são literais, não curinga. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Busca de conta para o console (admin:2): por parte do e-mail, nome de guerra ou SARAM exato.
 * Até 20 resultados, os de e-mail mais curto primeiro (o endereço digitado inteiro sobe ao topo).
 */
export async function searchSaramAccounts(db: SisubDb, ctx: UserContext, input: SearchSaramAccounts): Promise<SaramSearchAccount[]> {
	requirePermission(ctx, "admin", 2)
	const query = input.query.trim()
	const pattern = `%${escapeLike(query.toLowerCase())}%`
	const rows = (await runQuery("FETCH_FAILED", () =>
		db.execute(sql`
			select ud.id as user_id, ud.email, ud.account_kind, ud.saram, ud.saram_verified_by,
				mi.posto, mi.nome_guerra, mi.sg_org,
				exists (
					select 1 from core.user_data o
					where o.saram = ud.saram and o.id <> ud.id and o.saram_verified_by in ('email', 'cpf', 'admin')
				) as verified_elsewhere,
				exists (select 1 from core.saram_link_request r where r.user_id = ud.id and r.status = 'pending') as has_pending
			from core.user_data ud
			left join lateral (
				select m.posto, m.nome_guerra, m.sg_org from core.military_identity m
				where m.saram = ud.saram
				order by m.data_atualizacao desc nulls last
				limit 1
			) mi on true
			where lower(ud.email) like ${pattern}
				or ud.saram = ${query}
				or lower(mi.nome_guerra) like ${pattern}
			order by length(ud.email), ud.email
			limit ${SEARCH_LIMIT}
		`)
	)) as unknown as Array<Record<string, unknown>>
	return rows.map((r) => ({
		userId: String(r.user_id),
		email: String(r.email ?? ""),
		accountKind: (r.account_kind === "institucional" ? "institucional" : "pessoal") as AccountKind,
		saram: str(r.saram),
		verifiedBy: str(r.saram_verified_by) as SaramVerification | null,
		verifiedElsewhere: bool(r.verified_elsewhere),
		hasPendingRequest: bool(r.has_pending),
		identity: r.posto == null && r.nome_guerra == null && r.sg_org == null ? null : toIdentity(r),
	}))
}

export type SaramAdminResult = { outcome: string; logId: string | null }

function toAdminResult(result: Record<string, unknown>): SaramAdminResult {
	return { outcome: String(result.outcome ?? ""), logId: str(result.log_id) }
}

/** Aprova (vincula com `admin`, tirando o SARAM de quem o tiver) ou recusa um pedido pendente. */
export async function decideSaramRequest(
	db: SisubDb,
	ctx: UserContext,
	input: DecideSaramRequest,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("decideSaramRequest")
): Promise<SaramAdminResult> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	return toAdminResult(
		await callSaramFunction(
			db,
			sql`core.decide_saram_request(${ctx.userId}::uuid, ${audit.operation}::text, ${input.requestId}::uuid, ${input.decision}::text, ${input.note ?? null}::text, ${audit.grade}::text)`,
			"SARAM_DECISION_FAILED"
		)
	)
}

/** Vínculo manual (ou confirmação de legacy, com o mesmo SARAM). */
export async function linkUserSaram(
	db: SisubDb,
	ctx: UserContext,
	input: LinkUserSaram,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("linkUserSaram")
): Promise<SaramAdminResult> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	return toAdminResult(
		await callSaramFunction(
			db,
			sql`core.admin_link_saram(${ctx.userId}::uuid, ${audit.operation}::text, ${input.userId}::uuid, ${input.saram}::text, ${input.expectedSaram}::text, ${input.reason}::text, ${audit.grade}::text)`,
			"SARAM_LINK_FAILED"
		)
	)
}

export async function unlinkUserSaram(
	db: SisubDb,
	ctx: UserContext,
	input: UnlinkUserSaram,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("unlinkUserSaram")
): Promise<SaramAdminResult> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	return toAdminResult(
		await callSaramFunction(
			db,
			sql`core.admin_unlink_saram(${ctx.userId}::uuid, ${audit.operation}::text, ${input.userId}::uuid, ${input.expectedSaram}::text, ${input.reason}::text, ${audit.grade}::text)`,
			"SARAM_LINK_FAILED"
		)
	)
}

export async function setUserAccountKind(
	db: SisubDb,
	ctx: UserContext,
	input: SetUserAccountKind,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("setUserAccountKind")
): Promise<SaramAdminResult> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	return toAdminResult(
		await callSaramFunction(
			db,
			sql`core.admin_set_account_kind(${ctx.userId}::uuid, ${audit.operation}::text, ${input.userId}::uuid, ${input.kind}::text, ${input.expectedKind}::text, ${input.reason}::text, ${audit.grade}::text)`,
			"ACCOUNT_KIND_FAILED"
		)
	)
}
