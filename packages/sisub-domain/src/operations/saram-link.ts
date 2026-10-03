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
import { type SQL, sql } from "drizzle-orm"
import { type AssuranceRequirement, NO_ASSURANCE, requireAssurance } from "../guards/require-assurance.ts"
import { requirePermission } from "../guards/require-permission.ts"
import type {
	AccountKind,
	ConfirmSaramCandidate,
	DecideSaramRequest,
	LinkUserSaram,
	RequestSaramLink,
	SetOwnAccountKind,
	SetUserAccountKind,
	UnlinkUserSaram,
	VerifySaramByCpf,
	WithdrawSaramRequest,
} from "../schemas/saram-link.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { driverFailure, runQuery, unwrapPgError } from "../utils/index.ts"
import { type AccessAudit, defaultAccessAudit, runAccessFunction, toAccessDomainError } from "./access-change.ts"

// ── Tipos do contrato (FASE 2 monta as telas só a partir daqui) ─────────────

/** Identidade da sessão: o servidor a monta do JWT, nunca do payload. */
export type SaramSession = { userId: string; email: string | null; emailConfirmed: boolean }

export type SaramVerification = "email" | "cpf" | "admin" | "legacy"

export type SaramLinkStatusName =
	| "verified"
	| "legacy"
	| "institutional"
	| "pending_request"
	| "contested"
	| "suggestion"
	| "homonyms"
	| "locked_out"
	| "no_match"

export type SaramLinkAction = "confirm_candidate" | "verify_cpf" | "request_link" | "set_institutional" | "set_personal" | "withdraw_request"

export type EmailEligibility = "eligible" | "domain" | "unconfirmed" | "no_key"

export type MilitaryIdentitySummary = { posto: string | null; nomeGuerra: string | null; sgOrg: string | null }

/** Candidato da chave do e-mail. `ref` é opaco: nunca o SARAM. */
export type SaramCandidate = MilitaryIdentitySummary & { ref: number; heldByOther: boolean; holderVerified: boolean }

export type SaramLinkRequestSummary = {
	id: string
	kind: "link" | "dispute"
	saram: string
	justification: string
	createdAt: string
	claimVerifiedBy: "email" | "cpf" | null
}

export type SaramStatus = {
	status: SaramLinkStatusName
	accountKind: AccountKind
	/** SARAM vinculado (verificado ou legacy); `null` sem vínculo. */
	saram: string | null
	verifiedBy: SaramVerification | null
	verifiedAt: string | null
	/** A conta vê os próprios dados militares (`identity`). */
	visible: boolean
	identity: MilitaryIdentitySummary | null
	/** Há um SARAM gravado fora do fluxo verificado (formulário antigo): não vale até verificar. */
	hasUnverifiedSaram: boolean
	request: SaramLinkRequestSummary | null
	candidates: SaramCandidate[]
	requiresCpfSuffix: boolean
	emailEligibility: EmailEligibility
	lockedUntil: string | null
	attemptsLeft: number
	actions: SaramLinkAction[]
}

export type SaramLinkOutcomeName = "linked" | "disputed" | "mismatch" | "locked" | "requested" | "withdrawn" | "pending" | "unchanged" | "changed"

export type SaramLinkOutcome = {
	outcome: SaramLinkOutcomeName
	/** `mismatch`: tentativas restantes na janela de 1 hora. */
	attemptsLeft: number | null
	/** `locked`/`mismatch`: até quando a verificação por CPF está bloqueada. */
	lockedUntil: string | null
	/** `requested`/`disputed`: o pedido aberto. */
	requestId: string | null
	status: SaramStatus
}

// ── Erros estáveis das funções → mensagem para a tela ───────────────────────

const ADMIN_HELP = "Se precisar de ajuda, procure a administração do sistema."

const SARAM_ERRORS: Record<string, { code: string; message: string; notFound?: string }> = {
	SARAM_INVALID: { code: "INVALID_INPUT", message: "O SARAM tem 6 ou 7 dígitos." },
	CPF_INVALID: { code: "INVALID_INPUT", message: "O CPF tem 11 dígitos." },
	CPF_SUFFIX_INVALID: { code: "INVALID_INPUT", message: "Informe os 4 últimos dígitos do seu CPF." },
	JUSTIFICATION_INVALID: { code: "INVALID_INPUT", message: "Explique o pedido em 10 a 1000 caracteres." },
	ACCOUNT_KIND_INVALID: { code: "INVALID_INPUT", message: "Tipo de conta inválido." },
	DECISION_INVALID: { code: "INVALID_INPUT", message: "Decisão inválida." },
	NOTE_REQUIRED: { code: "INVALID_INPUT", message: "Informe o motivo (mínimo de 10 caracteres)." },
	ACCOUNT_INSTITUTIONAL: {
		code: "ACCOUNT_INSTITUTIONAL",
		message: "Conta institucional não tem SARAM. Se esta conta é de uma pessoa, marque-a como pessoal antes.",
	},
	SARAM_ALREADY_LINKED: { code: "SARAM_ALREADY_LINKED", message: `Esta conta já tem SARAM vinculado. Para trocá-lo, procure a administração do sistema.` },
	SARAM_LOCKED: {
		code: "SARAM_LOCKED",
		message: "O SARAM já está vinculado à sua conta e não pode ser alterado por aqui. Para corrigi-lo, procure a administração do sistema.",
	},
	REQUEST_PENDING: { code: "REQUEST_PENDING", message: "Você já tem um pedido de vínculo em análise. Desista dele antes de fazer outro." },
	REQUEST_LIMIT: { code: "REQUEST_LIMIT", message: `Limite de pedidos de vínculo atingido (5 por dia). Tente amanhã. ${ADMIN_HELP}` },
	EMAIL_NOT_ELIGIBLE: {
		code: "EMAIL_NOT_ELIGIBLE",
		message: "A identificação automática só vale para e-mail @fab.mil.br confirmado. Use o SARAM e o CPF, ou peça o vínculo.",
	},
	SARAM_TAKEN: {
		code: "SARAM_TAKEN",
		message: "Este SARAM está verificado em outra conta. Desvincule-o lá antes, ou decida pela contestação.",
	},
	SARAM_LINK_CHANGED: { code: "CONFLICT", message: "O vínculo desta conta mudou desde que a tela foi aberta. Atualize e confira de novo." },
	ACCOUNT_KIND_CHANGED: { code: "CONFLICT", message: "O tipo desta conta mudou desde que a tela foi aberta. Atualize e confira de novo." },
	REQUEST_NOT_PENDING: { code: "CONFLICT", message: "Este pedido já foi decidido ou retirado. Atualize a fila." },
	ACCOUNT_INSTITUTIONAL_NO_MEALS: {
		code: "ACCOUNT_INSTITUTIONAL",
		message: "Conta institucional não se arrancha nem registra presença. Use a conta pessoal de quem vai comer.",
	},
	SARAM_LINK_OUTSIDE_FUNCTION: {
		code: "SARAM_LINK_OUTSIDE_FUNCTION",
		message: `O banco recusou uma mudança de vínculo fora do caminho verificado. ${ADMIN_HELP}`,
	},
	USER_DATA_NOT_FOUND: { code: "USER_DATA_NOT_FOUND", message: `Sua conta ainda não está no cadastro de pessoas. ${ADMIN_HELP}` },
	CANDIDATE_NOT_FOUND: { code: "CANDIDATE_NOT_FOUND", message: "A sugestão mudou (o cadastro de pessoal foi atualizado). Atualize a tela e confira de novo." },
	REQUEST_NOT_FOUND: { code: "NOT_FOUND", message: "", notFound: "saram_link_request" },
}

/** Traduz o erro da função SQL; o SQL cru vai em `details`, para o log. */
export function toSaramDomainError(error: unknown, fallbackCode = "SARAM_LINK_FAILED"): DomainError {
	if (error instanceof DomainError) return error
	const token = unwrapPgError(error).message ?? ""
	const known = SARAM_ERRORS[token]
	if (known?.notFound) return new NotFoundError(known.notFound, "?")
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

/** `jsonb` de `core.saram_link_status` → `SaramStatus`. Exportada para o teste e para o sucont espelhar. */
export function parseSaramStatus(raw: unknown): SaramStatus {
	const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
	const request = o.request && typeof o.request === "object" ? (o.request as Record<string, unknown>) : null
	const candidates = Array.isArray(o.candidates) ? (o.candidates as Array<Record<string, unknown>>) : []
	return {
		status: (str(o.status) ?? "no_match") as SaramLinkStatusName,
		accountKind: (str(o.account_kind) ?? "pessoal") as AccountKind,
		saram: str(o.saram),
		verifiedBy: str(o.verified_by) as SaramVerification | null,
		verifiedAt: str(o.verified_at),
		visible: bool(o.visible),
		identity: toIdentity(o.identity),
		hasUnverifiedSaram: bool(o.has_unverified_saram),
		request: request
			? {
					id: String(request.id),
					kind: (str(request.kind) ?? "link") as "link" | "dispute",
					saram: String(request.saram ?? ""),
					justification: String(request.justification ?? ""),
					createdAt: String(request.created_at ?? ""),
					claimVerifiedBy: str(request.claim_verified_by) as "email" | "cpf" | null,
				}
			: null,
		candidates: candidates.map((c) => ({
			ref: Number(c.ref),
			posto: str(c.posto),
			nomeGuerra: str(c.nome_guerra),
			sgOrg: str(c.sg_org),
			heldByOther: bool(c.held_by_other),
			holderVerified: bool(c.holder_verified),
		})),
		requiresCpfSuffix: bool(o.requires_cpf_suffix),
		emailEligibility: (str(o.email_eligibility) ?? "domain") as EmailEligibility,
		lockedUntil: str(o.locked_until),
		attemptsLeft: Number(o.attempts_left ?? 0),
		actions: Array.isArray(o.actions) ? (o.actions as SaramLinkAction[]) : [],
	}
}

function toOutcome(result: Record<string, unknown>): SaramLinkOutcome {
	return {
		outcome: (str(result.outcome) ?? "unchanged") as SaramLinkOutcomeName,
		attemptsLeft: result.attempts_left == null ? null : Number(result.attempts_left),
		lockedUntil: str(result.locked_until),
		requestId: str(result.request_id),
		status: parseSaramStatus(result.status),
	}
}

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
