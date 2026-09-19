/**
 * Políticas nomeadas de acesso — CRUD + anexo a usuários. Camada Drizzle.
 *
 * Modelo IAM: `policy` é a *managed policy*, `policy_statement` são suas permissões,
 * `user_policy_attachment` liga política a usuário. `user_permissions` continua sendo a
 * *inline policy*. As permissões efetivas são a união das duas origens, com deny de
 * precedência absoluta — a resolução vive em `@iefa/pbac`.
 *
 * Toda operação exige `global:2`: quem administra acesso administra acesso.
 *
 * Políticas `managed` (criadas por seed, hoje só o "Conjunto Treino") são imutáveis. Sem
 * isso, alguém trocaria o escopo dos statements e transformaria a política que define o
 * ambiente de treino num passe de escrita para a FAB inteira.
 */

import {
	policyInAccessControl,
	policyStatementInAccessControl,
	type SisubDb,
	userDataInCore,
	userPolicyAttachmentInAccessControl,
} from "@iefa/database/drizzle/sisub"
import type { UserPermission } from "@iefa/pbac"
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm"
import { type AssuranceRequirement, NO_ASSURANCE, requireAssurance } from "../guards/require-assurance.ts"
import { requirePermission } from "../guards/require-permission.ts"
import { unscopedModuleViolation } from "../schemas/permissions.ts"
import type {
	AddPolicyStatement,
	AttachPolicy,
	CreatePolicy,
	DeletePolicy,
	DetachPolicy,
	FetchManagedPolicy,
	FetchPolicy,
	ListPolicies,
	ListPolicyMembers,
	ListUserPolicies,
	PolicyStatementInput,
	RemovePolicyStatement,
	RestorePolicy,
	UpdatePolicy,
	UpdatePolicyStatement,
} from "../schemas/policies.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { isExpired, notExpired, runQuery } from "../utils/index.ts"
import { type AccessAudit, defaultAccessAudit, runAccessFunction, SELF_ADMIN_EXPIRY_MESSAGE } from "./access-change.ts"
import { isAttached, loadActorAccessSnapshot, refuseIfLosesAdministration, wouldLoseAdministration } from "./self-admin-guard.ts"

export type PolicyStatementRow = {
	id: string
	module: string
	level: number
	unit_id: number | null
	kitchen_id: number | null
	mess_hall_id: number | null
}

export type PolicyRow = {
	id: string
	name: string
	description: string | null
	managed: boolean
	created_at: string
	deleted_at: string | null
}

export type PolicySummary = PolicyRow & { statement_count: number; attachment_count: number }
export type PolicyDetail = PolicyRow & { statements: PolicyStatementRow[] }

const POLICY_COLS = {
	id: policyInAccessControl.id,
	name: policyInAccessControl.name,
	description: policyInAccessControl.description,
	managed: policyInAccessControl.managed,
	created_at: policyInAccessControl.createdAt,
	deleted_at: policyInAccessControl.deletedAt,
} as const

const STATEMENT_COLS = {
	id: policyStatementInAccessControl.id,
	module: policyStatementInAccessControl.module,
	level: policyStatementInAccessControl.level,
	unit_id: policyStatementInAccessControl.unitId,
	kitchen_id: policyStatementInAccessControl.kitchenId,
	mess_hall_id: policyStatementInAccessControl.messHallId,
} as const

/**
 * Carrega a política e recusa a mutação se ela for gerenciada.
 *
 * @throws {NotFoundError} política inexistente ou já removida.
 * @throws {DomainError} política gerenciada.
 */
async function assertPolicyEditable(db: SisubDb, policyId: string): Promise<PolicyRow> {
	const rows = await runQuery("FETCH_FAILED", () => db.select(POLICY_COLS).from(policyInAccessControl).where(eq(policyInAccessControl.id, policyId)).limit(1))
	const policy = rows[0]
	if (!policy || policy.deleted_at !== null) throw new NotFoundError("policy", policyId)
	if (policy.managed) {
		throw new DomainError("POLICY_MANAGED", `Política "${policy.name}" é gerenciada pelo sistema e não pode ser alterada`)
	}
	return policy as PolicyRow
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Lista as políticas com contagem de statements e de usuários anexados. */
export async function listPolicies(db: SisubDb, ctx: UserContext, input: ListPolicies): Promise<PolicySummary[]> {
	requirePermission(ctx, "admin", 2)

	const policies = await runQuery("FETCH_FAILED", () => {
		const query = db.select(POLICY_COLS).from(policyInAccessControl).orderBy(asc(policyInAccessControl.name))
		return input.includeDeleted ? query : query.where(isNull(policyInAccessControl.deletedAt))
	})
	if (policies.length === 0) return []

	const ids = policies.map((p) => p.id)

	// Contagens em duas queries agregadas, não numa relacional aninhada: a profundidade
	// usuário → anexo → política → statement estoura o limite de 63 chars de alias do
	// Postgres (NAMEDATALEN), problema já conhecido neste repo.
	const [statementCounts, attachmentCounts] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({ policyId: policyStatementInAccessControl.policyId, total: count() })
				.from(policyStatementInAccessControl)
				.where(inArray(policyStatementInAccessControl.policyId, ids))
				.groupBy(policyStatementInAccessControl.policyId)
		),
		runQuery("FETCH_FAILED", () =>
			db
				.select({ policyId: userPolicyAttachmentInAccessControl.policyId, total: count() })
				.from(userPolicyAttachmentInAccessControl)
				.where(inArray(userPolicyAttachmentInAccessControl.policyId, ids))
				.groupBy(userPolicyAttachmentInAccessControl.policyId)
		),
	])

	const statementsById = new Map(statementCounts.map((r) => [r.policyId, Number(r.total)]))
	const attachmentsById = new Map(attachmentCounts.map((r) => [r.policyId, Number(r.total)]))

	return policies.map((p) => ({
		...(p as PolicyRow),
		statement_count: statementsById.get(p.id) ?? 0,
		attachment_count: attachmentsById.get(p.id) ?? 0,
	}))
}

/** Política com seus statements. */
export async function fetchPolicy(db: SisubDb, ctx: UserContext, input: FetchPolicy): Promise<PolicyDetail> {
	requirePermission(ctx, "admin", 2)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.select(POLICY_COLS).from(policyInAccessControl).where(eq(policyInAccessControl.id, input.policyId)).limit(1)
	)
	const policy = rows[0]
	if (!policy || policy.deleted_at !== null) throw new NotFoundError("policy", input.policyId)

	const statements = await runQuery("FETCH_FAILED", () =>
		db
			.select(STATEMENT_COLS)
			.from(policyStatementInAccessControl)
			.where(eq(policyStatementInAccessControl.policyId, input.policyId))
			.orderBy(asc(policyStatementInAccessControl.module))
	)

	return { ...(policy as PolicyRow), statements: statements as PolicyStatementRow[] }
}

/** Política anexada a um usuário, com o prazo DO ANEXO (não da política). */
export type AttachedPolicyRow = PolicyRow & { expires_at: string | null; expired: boolean }

/**
 * Políticas anexadas a um usuário.
 *
 * SEM filtro de expiração: é a superfície de edição do console. Um anexo vencido precisa
 * continuar visível para poder ser renovado ou desanexado — escondê-lo deixaria a linha
 * viva no banco e inalcançável na tela. Ele volta marcado com `expired`, calculado pelo
 * mesmo `now()` do banco que a resolução usa.
 */
export async function listUserPolicies(db: SisubDb, ctx: UserContext, input: ListUserPolicies): Promise<AttachedPolicyRow[]> {
	requirePermission(ctx, "admin", 2)

	return runQuery("FETCH_FAILED", () =>
		db
			.select({
				...POLICY_COLS,
				expires_at: userPolicyAttachmentInAccessControl.expiresAt,
				expired: isExpired(userPolicyAttachmentInAccessControl.expiresAt),
			})
			.from(userPolicyAttachmentInAccessControl)
			.innerJoin(policyInAccessControl, eq(policyInAccessControl.id, userPolicyAttachmentInAccessControl.policyId))
			.where(and(eq(userPolicyAttachmentInAccessControl.userId, input.userId), isNull(policyInAccessControl.deletedAt)))
			.orderBy(asc(policyInAccessControl.name))
	) as Promise<AttachedPolicyRow[]>
}

/** Usuário com uma política anexada — a visão REVERSA de `listUserPolicies`. */
export type PolicyMember = {
	user_id: string
	email: string | null
	nrOrdem: string | null
	attached_at: string
	/** Prazo do anexo. `null` = permanente. */
	expires_at: string | null
	/** `true` quando o anexo já venceu — só aparece com `includeExpired`. */
	expired: boolean
}

/**
 * Quem tem esta política anexada.
 *
 * Sem isto, "quem está em treino" só era respondível abrindo usuário por usuário: só existia
 * a direção usuário → políticas. Uma política de turma precisa da direção contrária para
 * ser administrável.
 *
 * `includeExpired` default `false`: a pergunta "quem TEM esta política" tem que ser
 * respondida pelo mesmo critério da autorização, e um anexo vencido não concede nada. O
 * console passa `true` — lá o anexo vencido precisa aparecer (marcado com `expired`) para
 * poder ser removido ou renovado.
 */
export async function listPolicyMembers(db: SisubDb, ctx: UserContext, input: ListPolicyMembers): Promise<PolicyMember[]> {
	requirePermission(ctx, "admin", 2)

	const scope = input.includeExpired
		? eq(userPolicyAttachmentInAccessControl.policyId, input.policyId)
		: and(eq(userPolicyAttachmentInAccessControl.policyId, input.policyId), notExpired(userPolicyAttachmentInAccessControl.expiresAt))

	return runQuery("FETCH_FAILED", () =>
		db
			.select({
				user_id: userPolicyAttachmentInAccessControl.userId,
				email: userDataInCore.email,
				nrOrdem: userDataInCore.nrOrdem,
				attached_at: userPolicyAttachmentInAccessControl.createdAt,
				expires_at: userPolicyAttachmentInAccessControl.expiresAt,
				expired: isExpired(userPolicyAttachmentInAccessControl.expiresAt),
			})
			.from(userPolicyAttachmentInAccessControl)
			// LEFT: o anexo aponta para auth.users; se o perfil em core.user_data não existir,
			// a pessoa ainda tem a política e precisa aparecer para poder ser removida.
			.leftJoin(userDataInCore, eq(userDataInCore.id, userPolicyAttachmentInAccessControl.userId))
			.where(scope)
			.orderBy(asc(userDataInCore.email))
	) as Promise<PolicyMember[]>
}

/**
 * Política gerenciada pelo nome exato.
 *
 * O painel de treino precisa do id do "Conjunto Treino" para listar e gerenciar a turma, e
 * o id é gerado por migration — diferente em cada ambiente. Resolver pelo nome evita
 * hard-code de UUID no cliente, do mesmo jeito que a migration resolve os escopos por
 * `is_training` em vez de literal.
 */
export async function fetchManagedPolicyByName(db: SisubDb, ctx: UserContext, input: FetchManagedPolicy): Promise<PolicyDetail> {
	requirePermission(ctx, "admin", 1)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select(POLICY_COLS)
			.from(policyInAccessControl)
			.where(and(eq(policyInAccessControl.name, input.name), eq(policyInAccessControl.managed, true), isNull(policyInAccessControl.deletedAt)))
			.limit(1)
	)
	const policy = rows[0]
	if (!policy) throw new NotFoundError("managed policy", input.name)

	const statements = await runQuery("FETCH_FAILED", () =>
		db
			.select(STATEMENT_COLS)
			.from(policyStatementInAccessControl)
			.where(eq(policyStatementInAccessControl.policyId, policy.id))
			.orderBy(asc(policyStatementInAccessControl.module))
	)

	return { ...(policy as PolicyRow), statements: statements as PolicyStatementRow[] }
}

/**
 * Statements de todas as políticas anexadas a um usuário, já na forma de `UserPermission`.
 *
 * É a SEGUNDA origem que a resolução efetiva consome, ao lado dos grants inline. Selects
 * explícitos + merge em TS, nunca query relacional aninhada (limite de alias do Postgres).
 *
 * Sem `ctx`: é lookup fundacional usado durante o bootstrap da sessão, mesma postura de
 * `listEffectiveUserPermissions`.
 */
export async function listUserPolicyPermissions(db: SisubDb, userId: string): Promise<UserPermission[]> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				module: policyStatementInAccessControl.module,
				level: policyStatementInAccessControl.level,
				mess_hall_id: policyStatementInAccessControl.messHallId,
				kitchen_id: policyStatementInAccessControl.kitchenId,
				unit_id: policyStatementInAccessControl.unitId,
			})
			.from(userPolicyAttachmentInAccessControl)
			.innerJoin(policyInAccessControl, eq(policyInAccessControl.id, userPolicyAttachmentInAccessControl.policyId))
			.innerJoin(policyStatementInAccessControl, eq(policyStatementInAccessControl.policyId, policyInAccessControl.id))
			// Anexo expirado é AUSENTE, não deny: nenhum statement dele entra na resolução, nem
			// os de `level 0`. A comparação é `now()` do BANCO.
			.where(
				and(
					eq(userPolicyAttachmentInAccessControl.userId, userId),
					isNull(policyInAccessControl.deletedAt),
					notExpired(userPolicyAttachmentInAccessControl.expiresAt)
				)
			)
	)

	// `module` é text no banco; o contrato do PBAC usa o union de módulos. Os valores só
	// entram pelo console, que oferece apenas módulos válidos.
	return rows as UserPermission[]
}

// ── Auto-tranca: a própria administração por política ───────────────────────
//
// Toda escrita que pode mexer no conjunto efetivo do PRÓPRIO ator — statement de uma política
// anexada a ele, anexar/desanexar a si mesmo, remover/restaurar política anexada a ele — é
// simulada antes (`self-admin-guard.ts`): se o ator deixaria de ter `admin` (por um allow que
// sai OU por um deny que entra), a escrita é recusada. Mudança que não toca o ator não carrega
// nem a foto do acesso dele além do necessário para saber que não toca.

/** Statement de uma política, lido para a regra de auto-tranca e para a autorização. */
async function loadStatement(db: SisubDb, statementId: string): Promise<{ policyId: string; module: string; level: number }> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ policyId: policyStatementInAccessControl.policyId, module: policyStatementInAccessControl.module, level: policyStatementInAccessControl.level })
			.from(policyStatementInAccessControl)
			.where(eq(policyStatementInAccessControl.id, statementId))
			.limit(1)
	)
	const row = rows[0]
	if (!row) throw new NotFoundError("policy_statement", statementId)
	return row
}

// ── Escrita ──────────────────────────────────────────────────────────────────
//
// Toda escrita de política, statement e anexo passa por uma função SQL auditada
// (20260921130000): a mudança e a linha de `access_control.sensitive_operation_log` entram na
// MESMA transação, com o ator da sessão (`ctx.userId`). Mudar o que uma política concede muda
// o acesso de TODOS os anexados, e o log registra quem são (`affected_user_ids`). Desde
// 20260921130100 o banco recusa escrita direta nestas tabelas.
//
// As checagens de política gerenciada/removida continuam aqui ANTES da chamada — é o que dá a
// mensagem com o nome da política — e são refeitas pela função sob trava, que é a que vale.

type PolicyFunctionRow = {
	log_id: string
	id: string
	name: string
	description: string | null
	managed: boolean
	created_at: string
	deleted_at: string | null
}

function toPolicyRow(row: PolicyFunctionRow): PolicyRow {
	return { id: row.id, name: row.name, description: row.description, managed: row.managed, created_at: row.created_at, deleted_at: row.deleted_at }
}

type StatementFunctionRow = {
	log_id: string
	statement_id: string
	module: string
	level: number
	unit_id: number | null
	kitchen_id: number | null
	mess_hall_id: number | null
}

function toStatementRow(row: StatementFunctionRow): PolicyStatementRow {
	return { id: row.statement_id, module: row.module, level: row.level, unit_id: row.unit_id, kitchen_id: row.kitchen_id, mess_hall_id: row.mess_hall_id }
}

export async function createPolicy(
	db: SisubDb,
	ctx: UserContext,
	input: CreatePolicy,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("createPolicy")
): Promise<PolicyRow> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)

	const row = await runAccessFunction<PolicyFunctionRow>(
		db,
		sql`access_control.create_policy(${ctx.userId}::uuid, ${audit.operation}::text, ${input.name}::text, ${input.description ?? null}::text, ${audit.grade}::text)`,
		{ fallbackCode: "INSERT_FAILED" }
	)
	return toPolicyRow(row)
}

export async function updatePolicy(
	db: SisubDb,
	ctx: UserContext,
	input: UpdatePolicy,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("updatePolicy")
): Promise<PolicyRow> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	await assertPolicyEditable(db, input.policyId)

	// nullable: undefined = não mexe; null = limpa a descrição. Nome nulo/ausente = não mexe.
	const row = await runAccessFunction<PolicyFunctionRow>(
		db,
		sql`access_control.update_policy(
			${ctx.userId}::uuid, ${audit.operation}::text, ${input.policyId}::uuid, ${input.name ?? null}::text,
			${input.description ?? null}::text, ${input.description !== undefined}::boolean, ${audit.grade}::text
		)`,
		{ fallbackCode: "UPDATE_FAILED", notFoundId: input.policyId }
	)
	return toPolicyRow(row)
}

/**
 * Soft delete. A política deixa de compor as permissões efetivas de qualquer usuário
 * imediatamente — a resolução filtra `deleted_at IS NULL` — sem apagar os anexos, para que
 * uma remoção acidental seja reversível. É revogação em massa: o log registra quem estava
 * anexado e o que a política concedia.
 */
export async function deletePolicy(
	db: SisubDb,
	ctx: UserContext,
	input: DeletePolicy,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("deletePolicy")
): Promise<void> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	await assertPolicyEditable(db, input.policyId)
	const snapshot = await loadActorAccessSnapshot(db, ctx.userId)
	if (isAttached(snapshot, input.policyId)) refuseIfLosesAdministration(snapshot, { kind: "policy-deleted", policyId: input.policyId, deleted: true })

	await runAccessFunction(db, sql`access_control.delete_policy(${ctx.userId}::uuid, ${audit.operation}::text, ${input.policyId}::uuid, ${audit.grade}::text)`, {
		fallbackCode: "DELETE_FAILED",
		notFoundId: input.policyId,
	})
}

/**
 * Reverte o soft delete — e com ele, devolve o acesso a TODOS os anexados. É concessão em
 * massa, registrada como tal (com os afetados) na mesma transação.
 *
 * `deletePolicy` preserva statements e anexos justamente para que uma remoção acidental seja
 * reversível — sem esta operação, a identidade e os anexos ficavam retidos e inalcançáveis,
 * o que é o pior dos dois mundos: nem apagado, nem recuperável.
 *
 * Recusa se o nome já foi reutilizado por outra política viva: o índice único parcial
 * rejeitaria o update de qualquer forma, e um erro de constraint cru não diria o motivo.
 */
export async function restorePolicy(
	db: SisubDb,
	ctx: UserContext,
	input: RestorePolicy,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("restorePolicy")
): Promise<PolicyRow> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.select(POLICY_COLS).from(policyInAccessControl).where(eq(policyInAccessControl.id, input.policyId)).limit(1)
	)
	const policy = rows[0]
	if (!policy) throw new NotFoundError("policy", input.policyId)
	if (policy.deleted_at === null) throw new DomainError("POLICY_NOT_DELETED", `Política "${policy.name}" não está removida`)

	const clash = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: policyInAccessControl.id })
			.from(policyInAccessControl)
			.where(and(eq(policyInAccessControl.name, policy.name), isNull(policyInAccessControl.deletedAt)))
			.limit(1)
	)
	const nameTaken = new DomainError("POLICY_NAME_TAKEN", `Já existe uma política ativa chamada "${policy.name}" — renomeie-a antes de restaurar esta`)
	if (clash.length > 0) throw nameTaken

	// Restaurar devolve os statements da política a todos os anexados — inclusive um deny de
	// `admin` sobre o próprio ator.
	const snapshot = await loadActorAccessSnapshot(db, ctx.userId)
	if (isAttached(snapshot, input.policyId)) refuseIfLosesAdministration(snapshot, { kind: "policy-deleted", policyId: input.policyId, deleted: false })

	const row = await runAccessFunction<PolicyFunctionRow>(
		db,
		sql`access_control.restore_policy(${ctx.userId}::uuid, ${audit.operation}::text, ${input.policyId}::uuid, ${audit.grade}::text)`,
		{ fallbackCode: "UPDATE_FAILED", notFoundId: input.policyId, overrides: { POLICY_NAME_TAKEN: nameTaken } }
	)
	return toPolicyRow(row)
}

// ── Escrita: statements ──────────────────────────────────────────────────────

/**
 * `admin`/`global` não aceitam escopo (ver `UNSCOPED_ONLY_MODULES`). O schema já recusa e o
 * banco tem o CHECK (migration 20260921160420); repetido aqui porque a operação não depende de
 * o chamador ter passado pelo `.validator`, e a mensagem do CHECK não diz o que corrigir.
 */
function assertStatementScopeAllowed(statement: PolicyStatementInput): void {
	const violation = unscopedModuleViolation(statement.module, statement)
	if (violation) throw new DomainError("SCOPE_NOT_ALLOWED", violation)
}

export async function addPolicyStatement(
	db: SisubDb,
	ctx: UserContext,
	input: AddPolicyStatement,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("addPolicyStatement")
): Promise<PolicyStatementRow> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	await assertPolicyEditable(db, input.policyId)

	const statement = input.statement
	assertStatementScopeAllowed(statement)
	// Um `admin:0` numa política anexada ao ator o bloquearia na hora (deny vence allow).
	const snapshot = await loadActorAccessSnapshot(db, ctx.userId)
	if (isAttached(snapshot, input.policyId)) {
		refuseIfLosesAdministration(snapshot, {
			kind: "statement-upsert",
			policyId: input.policyId,
			statement: {
				id: "(novo)",
				module: statement.module,
				level: statement.level,
				unit_id: statement.unit_id ?? null,
				kitchen_id: statement.kitchen_id ?? null,
				mess_hall_id: statement.mess_hall_id ?? null,
			},
		})
	}
	const row = await runAccessFunction<StatementFunctionRow>(
		db,
		sql`access_control.add_policy_statement(
			${ctx.userId}::uuid, ${audit.operation}::text, ${input.policyId}::uuid, ${statement.module}::text, ${statement.level}::integer,
			${statement.unit_id ?? null}::bigint, ${statement.kitchen_id ?? null}::bigint, ${statement.mess_hall_id ?? null}::bigint, ${audit.grade}::text
		)`,
		{ fallbackCode: "INSERT_FAILED", notFoundId: input.policyId }
	)
	return toStatementRow(row)
}

export async function updatePolicyStatement(
	db: SisubDb,
	ctx: UserContext,
	input: UpdatePolicyStatement,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("updatePolicyStatement")
): Promise<PolicyStatementRow> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	const current = await loadStatement(db, input.statementId)
	await assertPolicyEditable(db, current.policyId)

	const statement = input.statement
	assertStatementScopeAllowed(statement)
	// Rebaixar o statement de `admin` de uma política anexada ao ator — ou transformar QUALQUER
	// statement dela em `admin:0` — o deixaria sem administração.
	const snapshot = await loadActorAccessSnapshot(db, ctx.userId)
	if (isAttached(snapshot, current.policyId)) {
		refuseIfLosesAdministration(snapshot, {
			kind: "statement-upsert",
			policyId: current.policyId,
			statement: {
				id: input.statementId,
				module: statement.module,
				level: statement.level,
				unit_id: statement.unit_id ?? null,
				kitchen_id: statement.kitchen_id ?? null,
				mess_hall_id: statement.mess_hall_id ?? null,
			},
		})
	}
	const row = await runAccessFunction<StatementFunctionRow>(
		db,
		sql`access_control.update_policy_statement(
			${ctx.userId}::uuid, ${audit.operation}::text, ${input.statementId}::uuid, ${statement.module}::text, ${statement.level}::integer,
			${statement.unit_id ?? null}::bigint, ${statement.kitchen_id ?? null}::bigint, ${statement.mess_hall_id ?? null}::bigint, ${audit.grade}::text
		)`,
		{ fallbackCode: "UPDATE_FAILED", notFoundId: input.statementId }
	)
	return toStatementRow(row)
}

export async function removePolicyStatement(
	db: SisubDb,
	ctx: UserContext,
	input: RemovePolicyStatement,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("removePolicyStatement")
): Promise<void> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	const current = await loadStatement(db, input.statementId)
	await assertPolicyEditable(db, current.policyId)
	const snapshot = await loadActorAccessSnapshot(db, ctx.userId)
	if (isAttached(snapshot, current.policyId)) refuseIfLosesAdministration(snapshot, { kind: "statement-delete", statementId: input.statementId })

	await runAccessFunction(
		db,
		sql`access_control.remove_policy_statement(${ctx.userId}::uuid, ${audit.operation}::text, ${input.statementId}::uuid, ${audit.grade}::text)`,
		{ fallbackCode: "DELETE_FAILED", notFoundId: input.statementId }
	)
}

// ── Escrita: anexo ───────────────────────────────────────────────────────────

/**
 * Anexa uma política a um usuário. Idempotente: o unique `(user_id, policy_id)` absorve a
 * repetição, então anexar duas vezes não falha nem duplica.
 *
 * Reanexar REESCREVE o prazo, e é essa a forma de estender, encurtar ou tornar permanente um
 * acesso já concedido — sem isso, `expires_at` só poderia ser definido no primeiro anexo e um
 * acesso com prazo errado teria que ser desanexado e reanexado, perdendo `created_at` e
 * `created_by`. O log distingue as duas coisas (`change: "attach"` × `"expiry"`, com o prazo
 * anterior) — é a diferença entre conceder e renovar.
 *
 * Política GERENCIADA pode ser anexada — a imutabilidade é do conteúdo, não do uso. É
 * justamente assim que o "Conjunto Treino" é concedido.
 */
export async function attachPolicy(
	db: SisubDb,
	ctx: UserContext,
	input: AttachPolicy,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("attachPolicy")
): Promise<{ success: true; change: "attach" | "expiry"; log_id: string }> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	// Anexar a SI MESMO: a política pode trazer um `admin:0` (que o bloqueia na hora), e pôr
	// prazo no próprio anexo de uma política que dá administração a encerraria depois. Anexar-se
	// com prazo a uma política que NÃO é a fonte da administração continua permitido.
	if (input.userId === ctx.userId) {
		const snapshot = await loadActorAccessSnapshot(db, ctx.userId, input.policyId)
		const ending = input.expires_at != null
		const change = { kind: "attach", policyId: input.policyId, ending } as const
		if (wouldLoseAdministration(snapshot, change)) {
			// A frase específica quando é SÓ o prazo que tranca (sem prazo, a mudança passaria).
			const onlyTheExpiry = ending && !wouldLoseAdministration(snapshot, { ...change, ending: false })
			refuseIfLosesAdministration(snapshot, change, onlyTheExpiry ? SELF_ADMIN_EXPIRY_MESSAGE : undefined)
		}
	}

	const result = await runAccessFunction<{ log_id: string; change: "attach" | "expiry" }>(
		db,
		sql`access_control.attach_policy(
			${ctx.userId}::uuid, ${audit.operation}::text, ${input.userId}::uuid, ${input.policyId}::uuid,
			${input.expires_at ?? null}::timestamptz, ${audit.grade}::text
		)`,
		{ fallbackCode: "INSERT_FAILED", notFoundId: input.policyId }
	)
	return { success: true as const, change: result.change, log_id: result.log_id }
}

export async function detachPolicy(
	db: SisubDb,
	ctx: UserContext,
	input: DetachPolicy,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("detachPolicy")
): Promise<{ success: true; log_id: string }> {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	if (input.userId === ctx.userId) refuseIfLosesAdministration(await loadActorAccessSnapshot(db, ctx.userId), { kind: "detach", policyId: input.policyId })

	const result = await runAccessFunction<{ log_id: string }>(
		db,
		sql`access_control.detach_policy(${ctx.userId}::uuid, ${audit.operation}::text, ${input.userId}::uuid, ${input.policyId}::uuid, ${audit.grade}::text)`,
		{
			fallbackCode: "DELETE_FAILED",
			overrides: { ATTACHMENT_NOT_FOUND: new DomainError("DELETE_FAILED", `attachment ${input.userId}/${input.policyId} not found`) },
		}
	)
	return { success: true as const, log_id: result.log_id }
}
