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

import { policyInAccessControl, policyStatementInAccessControl, type SisubDb, userPolicyAttachmentInAccessControl } from "@iefa/database/drizzle/sisub"
import type { UserPermission } from "@iefa/pbac"
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type {
	AddPolicyStatement,
	AttachPolicy,
	CreatePolicy,
	DeletePolicy,
	DetachPolicy,
	FetchPolicy,
	ListPolicies,
	ListUserPolicies,
	PolicyStatementInput,
	RemovePolicyStatement,
	UpdatePolicy,
	UpdatePolicyStatement,
} from "../schemas/policies.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError, NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery } from "../utils/index.ts"

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
	requirePermission(ctx, "global", 2)

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
	requirePermission(ctx, "global", 2)

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

/** Políticas anexadas a um usuário. */
export async function listUserPolicies(db: SisubDb, ctx: UserContext, input: ListUserPolicies): Promise<PolicyRow[]> {
	requirePermission(ctx, "global", 2)

	return runQuery("FETCH_FAILED", () =>
		db
			.select(POLICY_COLS)
			.from(userPolicyAttachmentInAccessControl)
			.innerJoin(policyInAccessControl, eq(policyInAccessControl.id, userPolicyAttachmentInAccessControl.policyId))
			.where(and(eq(userPolicyAttachmentInAccessControl.userId, input.userId), isNull(policyInAccessControl.deletedAt)))
			.orderBy(asc(policyInAccessControl.name))
	) as Promise<PolicyRow[]>
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
			.where(and(eq(userPolicyAttachmentInAccessControl.userId, userId), isNull(policyInAccessControl.deletedAt)))
	)

	// `module` é text no banco; o contrato do PBAC usa o union de módulos. Os valores só
	// entram pelo console, que oferece apenas módulos válidos.
	return rows as UserPermission[]
}

// ── Escrita: política ────────────────────────────────────────────────────────

export async function createPolicy(db: SisubDb, ctx: UserContext, input: CreatePolicy): Promise<PolicyRow> {
	requirePermission(ctx, "global", 2)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(policyInAccessControl)
			.values({ name: input.name, description: input.description ?? null, managed: false })
			.returning(POLICY_COLS)
	)
	return row as PolicyRow
}

export async function updatePolicy(db: SisubDb, ctx: UserContext, input: UpdatePolicy): Promise<PolicyRow> {
	requirePermission(ctx, "global", 2)
	await assertPolicyEditable(db, input.policyId)

	const updates: { name?: string; description?: string | null; updatedAt: string } = { updatedAt: new Date().toISOString() }
	if (input.name != null) updates.name = input.name
	// nullable: undefined = não mexe; null = limpa a descrição.
	if (input.description !== undefined) updates.description = input.description

	const row = await insertOneOrFail("UPDATE_FAILED", `policy ${input.policyId} not found`, () =>
		db.update(policyInAccessControl).set(updates).where(eq(policyInAccessControl.id, input.policyId)).returning(POLICY_COLS)
	)
	return row as PolicyRow
}

/**
 * Soft delete. A política deixa de compor as permissões efetivas de qualquer usuário
 * imediatamente — a resolução filtra `deleted_at IS NULL` — sem apagar os anexos, para que
 * uma remoção acidental seja reversível.
 */
export async function deletePolicy(db: SisubDb, ctx: UserContext, input: DeletePolicy): Promise<void> {
	requirePermission(ctx, "global", 2)
	await assertPolicyEditable(db, input.policyId)

	await mutateOrFail("DELETE_FAILED", `policy ${input.policyId} not found`, () =>
		db
			.update(policyInAccessControl)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(eq(policyInAccessControl.id, input.policyId), isNull(policyInAccessControl.deletedAt)))
			.returning({ id: policyInAccessControl.id })
	)
}

// ── Escrita: statements ──────────────────────────────────────────────────────

function statementValues(statement: PolicyStatementInput) {
	return {
		module: statement.module,
		level: statement.level,
		unitId: statement.unit_id ?? null,
		kitchenId: statement.kitchen_id ?? null,
		messHallId: statement.mess_hall_id ?? null,
	}
}

export async function addPolicyStatement(db: SisubDb, ctx: UserContext, input: AddPolicyStatement): Promise<PolicyStatementRow> {
	requirePermission(ctx, "global", 2)
	await assertPolicyEditable(db, input.policyId)

	const row = await insertOneOrFail("INSERT_FAILED", "no row returned", () =>
		db
			.insert(policyStatementInAccessControl)
			.values({ policyId: input.policyId, ...statementValues(input.statement) })
			.returning(STATEMENT_COLS)
	)
	return row as PolicyStatementRow
}

/** Resolve a política dona de um statement — a autorização é sempre pela política. */
async function resolveStatementPolicy(db: SisubDb, statementId: string): Promise<string> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ policyId: policyStatementInAccessControl.policyId })
			.from(policyStatementInAccessControl)
			.where(eq(policyStatementInAccessControl.id, statementId))
			.limit(1)
	)
	const row = rows[0]
	if (!row) throw new NotFoundError("policy_statement", statementId)
	return row.policyId
}

export async function updatePolicyStatement(db: SisubDb, ctx: UserContext, input: UpdatePolicyStatement): Promise<PolicyStatementRow> {
	requirePermission(ctx, "global", 2)
	await assertPolicyEditable(db, await resolveStatementPolicy(db, input.statementId))

	const row = await insertOneOrFail("UPDATE_FAILED", `policy_statement ${input.statementId} not found`, () =>
		db
			.update(policyStatementInAccessControl)
			.set(statementValues(input.statement))
			.where(eq(policyStatementInAccessControl.id, input.statementId))
			.returning(STATEMENT_COLS)
	)
	return row as PolicyStatementRow
}

export async function removePolicyStatement(db: SisubDb, ctx: UserContext, input: RemovePolicyStatement): Promise<void> {
	requirePermission(ctx, "global", 2)
	await assertPolicyEditable(db, await resolveStatementPolicy(db, input.statementId))

	await mutateOrFail("DELETE_FAILED", `policy_statement ${input.statementId} not found`, () =>
		db
			.delete(policyStatementInAccessControl)
			.where(eq(policyStatementInAccessControl.id, input.statementId))
			.returning({ id: policyStatementInAccessControl.id })
	)
}

// ── Escrita: anexo ───────────────────────────────────────────────────────────

/**
 * Anexa uma política a um usuário. Idempotente: o unique `(user_id, policy_id)` absorve a
 * repetição, então anexar duas vezes não falha nem duplica.
 *
 * Política GERENCIADA pode ser anexada — a imutabilidade é do conteúdo, não do uso. É
 * justamente assim que o "Conjunto Treino" é concedido.
 */
export async function attachPolicy(db: SisubDb, ctx: UserContext, input: AttachPolicy): Promise<{ success: true }> {
	requirePermission(ctx, "global", 2)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: policyInAccessControl.id, deletedAt: policyInAccessControl.deletedAt })
			.from(policyInAccessControl)
			.where(eq(policyInAccessControl.id, input.policyId))
			.limit(1)
	)
	const policy = rows[0]
	if (!policy || policy.deletedAt !== null) throw new NotFoundError("policy", input.policyId)

	await runQuery("INSERT_FAILED", () =>
		db
			.insert(userPolicyAttachmentInAccessControl)
			.values({ userId: input.userId, policyId: input.policyId, createdBy: ctx.userId })
			.onConflictDoNothing()
			.then(() => undefined)
	)
	return { success: true as const }
}

export async function detachPolicy(db: SisubDb, ctx: UserContext, input: DetachPolicy): Promise<{ success: true }> {
	requirePermission(ctx, "global", 2)

	await mutateOrFail("DELETE_FAILED", `attachment ${input.userId}/${input.policyId} not found`, () =>
		db
			.delete(userPolicyAttachmentInAccessControl)
			.where(and(eq(userPolicyAttachmentInAccessControl.userId, input.userId), eq(userPolicyAttachmentInAccessControl.policyId, input.policyId)))
			.returning({ id: userPolicyAttachmentInAccessControl.id })
	)
	return { success: true as const }
}
