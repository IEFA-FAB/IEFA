/**
 * Permission resolution + admin CRUD for the sisub RBAC system. Drizzle query layer.
 *
 * LEVELS: 0=deny (explicit block), 1=read, 2=write.
 * MODULES: diner | messhall | unit | kitchen | kitchen-production | global |
 *          analytics | local-analytics | storage.
 *
 * Auth posture preserved from the original server functions:
 *   - listEffectiveUserPermissions is UNAUTHENTICATED (foundational lookup used
 *     while bootstrapping a session) — no ctx, no guard.
 *   - the admin operations require global level 2 (was requireGlobalPermissionAdmin).
 *
 * Aliases explícitos no lugar de toWire: `searchUsersByEmail` projeta `user_data.nrOrdem`
 * (coluna camelCase no DB) — camel→snake corromperia a chave do contrato.
 */

import {
	policyInAccessControl,
	policyStatementInAccessControl,
	type SisubDb,
	userDataInCore,
	userPermissionsInAccessControl,
	userPolicyAttachmentInAccessControl,
} from "@iefa/database/drizzle/sisub"
import { resolveEffectivePermissions, type UserPermission } from "@iefa/pbac"
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm"
import { type AssuranceRequirement, NO_ASSURANCE, requireAssurance } from "../guards/require-assurance.ts"
import { requirePermission } from "../guards/require-permission.ts"
import type { CreateUserPermission, FetchUserPermissions, SearchUsersByEmail, UpdateUserPermission } from "../schemas/permissions.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { isExpired, notExpired, runQuery, unwrapPgError } from "../utils/index.ts"
import {
	type AccessAudit,
	assertSisubGrantable,
	defaultAccessAudit,
	runAccessFunction,
	SELF_ADMIN_EXPIRY_MESSAGE,
	SISUB_ADMIN_MODULE,
	selfAdminUpdateRefusal,
} from "./access-change.ts"
import { listUserPolicyPermissions } from "./policies.ts"

/**
 * Effective permission set for a user: applies deny precedence and injects an implicit
 * "diner" allow when no explicit diner rule exists. NOT raw DB rows.
 */
export async function listEffectiveUserPermissions(db: SisubDb, input: FetchUserPermissions): Promise<UserPermission[]> {
	const permissions = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				module: userPermissionsInAccessControl.module,
				level: userPermissionsInAccessControl.level,
				mess_hall_id: userPermissionsInAccessControl.messHallId,
				kitchen_id: userPermissionsInAccessControl.kitchenId,
				unit_id: userPermissionsInAccessControl.unitId,
			})
			.from(userPermissionsInAccessControl)
			// Grant expirado é AUSENTE, não deny: ele nem chega à resolução, então um
			// `level 0` vencido deixa de negar. A comparação é `now()` do BANCO — relógio de
			// processo não decide autorização.
			.where(and(eq(userPermissionsInAccessControl.userId, input.userId), notExpired(userPermissionsInAccessControl.expiresAt)))
	)

	// Segunda origem: os statements das políticas anexadas. A união com os grants inline e
	// a precedência de deny ficam na resolução compartilhada (@iefa/pbac).
	const policyPermissions = await listUserPolicyPermissions(db, input.userId)

	// `module` é text no banco; o contrato do PBAC usa o union de módulos. Os valores são
	// escritos pelo próprio console de permissões, que só oferece módulos válidos.
	return resolveEffectivePermissions(permissions as UserPermission[], policyPermissions)
}

/**
 * Origem de uma permissão efetiva.
 *
 * `implicit` é o comensal que todo usuário válido recebe quando não há regra explícita de
 * `diner` — não vem de linha nenhuma, mas precisa aparecer no console para o conjunto
 * efetivo ficar completo.
 */
export type PermissionOrigin = { kind: "inline" } | { kind: "implicit" } | { kind: "policy"; policyId: string; policyName: string }

export type EffectivePermissionWithOrigin = UserPermission & {
	origins: PermissionOrigin[]
	/** `true` quando um deny de alguma origem anula este allow. */
	denied: boolean
	/** Origens que negam este (módulo, escopo). Vazio quando `denied` é false. */
	deniedBy: PermissionOrigin[]
}

/** Chave de escopo estável para casar permissão ↔ origem. */
function scopeKey(p: { unit_id: number | null; kitchen_id: number | null; mess_hall_id: number | null }): string {
	if (p.unit_id !== null) return `unit:${p.unit_id}`
	if (p.kitchen_id !== null) return `kitchen:${p.kitchen_id}`
	if (p.mess_hall_id !== null) return `mess_hall:${p.mess_hall_id}`
	return "*"
}

/**
 * Permissões efetivas de um usuário COM a origem de cada uma — a resposta canônica para
 * "o que essa pessoa pode fazer, e por quê".
 *
 * Inclui as entradas anuladas por deny, marcadas com `denied` e com quem negou: omiti-las
 * deixaria o administrador sem entender por que um anexo de política não teve efeito.
 *
 * Montada por selects explícitos + merge em TS. A profundidade usuário → anexo → política →
 * statement estoura o limite de 63 chars de alias do Postgres numa query relacional
 * aninhada — problema já conhecido neste repo.
 */
export async function listEffectiveUserPermissionsWithOrigin(
	db: SisubDb,
	ctx: UserContext,
	input: FetchUserPermissions
): Promise<EffectivePermissionWithOrigin[]> {
	requirePermission(ctx, "admin", 2)

	const [inlineRows, policyRows] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					module: userPermissionsInAccessControl.module,
					level: userPermissionsInAccessControl.level,
					mess_hall_id: userPermissionsInAccessControl.messHallId,
					kitchen_id: userPermissionsInAccessControl.kitchenId,
					unit_id: userPermissionsInAccessControl.unitId,
				})
				.from(userPermissionsInAccessControl)
				// Mesmo filtro da resolução canônica: o console tem que mostrar o conjunto que
				// o guard realmente aplica, e não o histórico do que um dia foi concedido.
				.where(and(eq(userPermissionsInAccessControl.userId, input.userId), notExpired(userPermissionsInAccessControl.expiresAt)))
		),
		listUserPolicyStatementsWithSource(db, input.userId),
	])

	type Tagged = { permission: UserPermission; origin: PermissionOrigin }
	const tagged: Tagged[] = [
		...(inlineRows as UserPermission[]).map((permission) => ({ permission, origin: { kind: "inline" } as const })),
		...policyRows.map(({ policyId, policyName, ...permission }) => ({
			permission: permission as UserPermission,
			origin: { kind: "policy", policyId, policyName } as const,
		})),
	]

	// Agrupa por (módulo, escopo) preservando TODAS as origens que concedem ou negam.
	const grouped = new Map<string, { permission: UserPermission; allows: PermissionOrigin[]; denies: PermissionOrigin[] }>()
	for (const { permission, origin } of tagged) {
		const key = `${permission.module}|${scopeKey(permission)}`
		const entry = grouped.get(key) ?? { permission, allows: [], denies: [] }
		if (permission.level > 0) {
			entry.allows.push(origin)
			// Mantém o maior nível concedido para este par.
			if (permission.level > entry.permission.level) entry.permission = permission
		} else {
			entry.denies.push(origin)
		}
		grouped.set(key, entry)
	}

	// Deny sem escopo cobre todos os escopos do módulo — a mesma regra da resolução efetiva.
	const unscopedDenies = new Map<string, PermissionOrigin[]>()
	for (const { permission, origin } of tagged) {
		if (permission.level > 0 || scopeKey(permission) !== "*") continue
		unscopedDenies.set(permission.module, [...(unscopedDenies.get(permission.module) ?? []), origin])
	}

	const rows = Array.from(grouped.values())
		.filter((entry) => entry.allows.length > 0)
		.map((entry) => {
			// Só herda os denies sem escopo quando a própria entrada É escopada — senão o deny
			// sem escopo apareceria duas vezes (já está em `entry.denies`) e a proveniência
			// mostraria a mesma origem repetida.
			const inheritedDenies = scopeKey(entry.permission) === "*" ? [] : (unscopedDenies.get(entry.permission.module) ?? [])
			const deniedBy = [...entry.denies, ...inheritedDenies]
			return { ...entry.permission, origins: entry.allows, denied: deniedBy.length > 0, deniedBy }
		})

	// Comensal implícito: o resolver canônico injeta `diner:1` quando não há regra explícita,
	// e omiti-lo aqui faria o console reportar um conjunto efetivo incompleto — a tela diria
	// que a pessoa não é comensal quando ela é.
	const hasExplicitDiner = tagged.some((t) => t.permission.module === "diner")
	if (!hasExplicitDiner) {
		rows.push({
			module: "diner",
			level: 1,
			mess_hall_id: null,
			kitchen_id: null,
			unit_id: null,
			origins: [{ kind: "implicit" }],
			denied: false,
			deniedBy: [],
		})
	}

	return rows
}

/** Statements das políticas anexadas, cada um carregando a política de origem. */
async function listUserPolicyStatementsWithSource(db: SisubDb, userId: string) {
	return runQuery("FETCH_FAILED", () =>
		db
			.select({
				policyId: policyInAccessControl.id,
				policyName: policyInAccessControl.name,
				module: policyStatementInAccessControl.module,
				level: policyStatementInAccessControl.level,
				mess_hall_id: policyStatementInAccessControl.messHallId,
				kitchen_id: policyStatementInAccessControl.kitchenId,
				unit_id: policyStatementInAccessControl.unitId,
			})
			.from(userPolicyAttachmentInAccessControl)
			.innerJoin(policyInAccessControl, eq(policyInAccessControl.id, userPolicyAttachmentInAccessControl.policyId))
			.innerJoin(policyStatementInAccessControl, eq(policyStatementInAccessControl.policyId, policyInAccessControl.id))
			.where(
				and(
					eq(userPolicyAttachmentInAccessControl.userId, userId),
					isNull(policyInAccessControl.deletedAt),
					notExpired(userPolicyAttachmentInAccessControl.expiresAt)
				)
			)
	)
}

export async function searchUsersByEmail(db: SisubDb, ctx: UserContext, input: SearchUsersByEmail) {
	requirePermission(ctx, "admin", 2)
	// Escapa metacaracteres LIKE (\ % _) p/ que o termo seja tratado como literal — senão
	// "user_admin" casaria "useradmin"/"user1admin" (_ = curinga de 1 char no LIKE).
	const term = input.email.replace(/[\\%_]/g, "\\$&")
	return runQuery("FETCH_FAILED", () =>
		db
			.select({ id: userDataInCore.id, email: userDataInCore.email, nrOrdem: userDataInCore.nrOrdem })
			.from(userDataInCore)
			.where(ilike(userDataInCore.email, `%${term}%`))
			.orderBy(asc(userDataInCore.email))
			.limit(10)
	)
}

export async function fetchUserPermissionsAdmin(db: SisubDb, ctx: UserContext, input: FetchUserPermissions) {
	requirePermission(ctx, "admin", 2)
	return runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: userPermissionsInAccessControl.id,
				module: userPermissionsInAccessControl.module,
				level: userPermissionsInAccessControl.level,
				mess_hall_id: userPermissionsInAccessControl.messHallId,
				kitchen_id: userPermissionsInAccessControl.kitchenId,
				unit_id: userPermissionsInAccessControl.unitId,
				expires_at: userPermissionsInAccessControl.expiresAt,
				expired: isExpired(userPermissionsInAccessControl.expiresAt),
			})
			.from(userPermissionsInAccessControl)
			// SEM filtro de expiração, ao contrário da resolução: esta é a tela de edição.
			// Esconder o grant vencido o tornaria invisível E inalcançável — não daria para
			// renovar nem apagar. Ele volta marcado (`expired`), calculado pelo mesmo `now()`
			// do banco que decide a autorização.
			.where(eq(userPermissionsInAccessControl.userId, input.userId))
			.orderBy(asc(userPermissionsInAccessControl.module))
	)
}

/**
 * Violação da unicidade do grant inline: `user_permissions_allow_uniq` (`level > 0`) ou
 * `user_permissions_deny_uniq` (`level <= 0`), os dois únicos parciais sobre
 * (user_id, module, mess_hall_id, kitchen_id, unit_id) com `nulls not distinct`
 * (migração 20260917185655). Juntos impedem DOIS allows — ou DOIS denies — do mesmo
 * módulo e escopo para a mesma pessoa.
 *
 * São dois, e não um índice geral, porque allow e deny PODEM coexistir na mesma chave:
 * é o deny sobre allow, que `resolveEffectivePermissions` resolve por precedência.
 *
 * Desde 20260921130000 a escrita passa pelas funções auditadas, que traduzem essa violação
 * no token `PERMISSION_ALREADY_EXISTS` (23505). Os dois formatos são reconhecidos: o do
 * índice cru (caminho antigo, e quem ainda escrever direto por manutenção) e o da função.
 */
export function isDuplicateGrantViolation(error: unknown): boolean {
	// O código real fica em `.cause` (DrizzleQueryError) — `unwrapPgError` o resgata.
	const pg = unwrapPgError(error)
	if (pg.code !== "23505") return false
	const constraint = pg.constraint_name ?? ""
	return constraint === "user_permissions_allow_uniq" || constraint === "user_permissions_deny_uniq" || pg.message === "PERMISSION_ALREADY_EXISTS"
}

/** Linha de grant inline que as regras de autoconcessão precisam ler antes de mexer. */
async function loadPermissionRow(db: SisubDb, permissionId: string) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: userPermissionsInAccessControl.id,
				userId: userPermissionsInAccessControl.userId,
				module: userPermissionsInAccessControl.module,
				level: userPermissionsInAccessControl.level,
			})
			.from(userPermissionsInAccessControl)
			.where(eq(userPermissionsInAccessControl.id, permissionId))
			.limit(1)
	)
	return rows[0] ?? null
}

type PermissionChangeResult = { log_id: string; permission_id: string; user_id: string; module?: string; level?: number; previous_level?: number }

/**
 * Concede um grant inline. ESTRITA: repetir (usuário, módulo, escopo, lado) é erro legível,
 * não upsert — reescrever em silêncio o nível ou o prazo de uma concessão existente é
 * exatamente o que o console não deve fazer por um clique de "criar". A escrita e o log de
 * auditoria entram na mesma transação (`access_control.create_user_permission`).
 *
 * O administrador pode conceder a si mesmo (é administrador global do sisub); o que ninguém
 * faz é criar um BLOQUEIO sobre a própria administração.
 */
export async function createUserPermission(
	db: SisubDb,
	ctx: UserContext,
	input: CreateUserPermission,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("createUserPermission")
) {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)
	assertSisubGrantable(ctx.userId, { userId: input.userId, revokesAdministration: input.module === SISUB_ADMIN_MODULE && input.level <= 0 })

	const result = await runAccessFunction<PermissionChangeResult>(
		db,
		sql`access_control.create_user_permission(
			${ctx.userId}::uuid, ${audit.operation}::text, ${input.userId}::uuid, ${input.module}::text, ${input.level}::integer,
			${input.unit_id ?? null}::bigint, ${input.kitchen_id ?? null}::bigint, ${input.mess_hall_id ?? null}::bigint,
			${input.expires_at ?? null}::timestamptz, ${audit.grade}::text
		)`,
		{
			fallbackCode: "INSERT_FAILED",
			overrides: {
				// O caminho existe: `fetchUserPermissionsAdmin` devolve o grant que já está lá —
				// inclusive o vencido, marcado `expired` — e editá-lo é como se renova o acesso.
				PERMISSION_ALREADY_EXISTS: new DomainError(
					"PERMISSION_ALREADY_EXISTS",
					`Já existe uma concessão de "${input.module}" para este usuário neste escopo. Edite a concessão existente em vez de criar outra — se ela estiver vencida, renove o prazo por ali.`
				),
			},
		}
	)
	return { success: true as const, log_id: result.log_id, permission_id: result.permission_id }
}

/**
 * Altera nível, escopo e (opcionalmente) prazo de um grant existente. O ANTES e o DEPOIS vão
 * para o log, na mesma transação da escrita (`access_control.update_user_permission`).
 *
 * `expires_at` é PATCH, não substituição: ausente = não mexe no prazo, `null` = torna o
 * grant permanente. Os escopos seguem sendo substituição porque o diálogo sempre os envia;
 * o prazo, não — um cliente que não conhece o campo apagaria o prazo de todo grant que editasse.
 *
 * Ninguém REDUZ nem ENCERRA a própria administração — rebaixar o próprio `admin`, trocá-lo por
 * bloqueio ou pôr prazo nele (vencido ou futuro): trancaria o ator fora do console — e, sendo o
 * último, todo mundo. Tornar a própria administração permanente pode. Ver
 * `selfAdminUpdateRefusal`.
 */
export async function updateUserPermission(
	db: SisubDb,
	ctx: UserContext,
	input: UpdateUserPermission,
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("updateUserPermission")
) {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)

	const current = await loadPermissionRow(db, input.permissionId)
	if (!current) throw new DomainError("UPDATE_FAILED", `permission ${input.permissionId} not found`)
	const refusal = selfAdminUpdateRefusal(ctx.userId, current, { level: input.level, expiresAt: input.expires_at })
	if (refusal === "EXPIRY") throw new DomainError("GRANT_NOT_ALLOWED", SELF_ADMIN_EXPIRY_MESSAGE)
	assertSisubGrantable(ctx.userId, { userId: current.userId, revokesAdministration: refusal === "LEVEL" })

	const result = await runAccessFunction<PermissionChangeResult>(
		db,
		sql`access_control.update_user_permission(
			${ctx.userId}::uuid, ${audit.operation}::text, ${input.permissionId}::uuid, ${input.level}::integer,
			${input.unit_id ?? null}::bigint, ${input.kitchen_id ?? null}::bigint, ${input.mess_hall_id ?? null}::bigint,
			${input.expires_at ?? null}::timestamptz, ${input.expires_at !== undefined}::boolean, ${audit.grade}::text
		)`,
		{
			fallbackCode: "UPDATE_FAILED",
			overrides: {
				// Mudar o ESCOPO para um que o usuário já tem naquele módulo — ou cruzar a
				// fronteira allow/deny pelo nível (2 → 0, que troca de índice) — colide.
				PERMISSION_ALREADY_EXISTS: new DomainError(
					"PERMISSION_ALREADY_EXISTS",
					"Este usuário já tem outra concessão deste módulo neste escopo. Ajuste ou remova a outra concessão antes de mover esta para cá."
				),
				PERMISSION_NOT_FOUND: new DomainError("UPDATE_FAILED", `permission ${input.permissionId} not found`),
			},
		}
	)
	// O `user_id` volta da LINHA alterada, e não do input — que nem o traz. É ele que permite
	// ao chamador reagir à mudança (a invalidação de códigos de recuperação quando a conta
	// vira protegida, design.md D9) sem precisar confiar num id vindo do cliente.
	return { success: true as const, user_id: result.user_id ?? null, log_id: result.log_id }
}

/**
 * Remove uma concessão e devolve O QUE foi removido. A linha inteira vai para o log, na mesma
 * transação (`access_control.delete_user_permission`): depois do delete, o log é o único
 * lugar onde o acesso revogado ainda existe.
 *
 * Ninguém revoga a própria administração (o allow do próprio `admin`).
 */
export async function deleteUserPermission(
	db: SisubDb,
	ctx: UserContext,
	input: { permissionId: string },
	assurance: AssuranceRequirement = NO_ASSURANCE,
	audit: AccessAudit = defaultAccessAudit("deleteUserPermission")
) {
	requirePermission(ctx, "admin", 2)
	requireAssurance(ctx, assurance)

	const current = await loadPermissionRow(db, input.permissionId)
	if (!current) throw new DomainError("DELETE_FAILED", `permission ${input.permissionId} not found`)
	assertSisubGrantable(ctx.userId, { userId: current.userId, revokesAdministration: current.module === SISUB_ADMIN_MODULE && current.level > 0 })

	const result = await runAccessFunction<PermissionChangeResult>(
		db,
		sql`access_control.delete_user_permission(${ctx.userId}::uuid, ${audit.operation}::text, ${input.permissionId}::uuid, ${audit.grade}::text)`,
		{ fallbackCode: "DELETE_FAILED", overrides: { PERMISSION_NOT_FOUND: new DomainError("DELETE_FAILED", `permission ${input.permissionId} not found`) } }
	)
	return {
		success: true as const,
		log_id: result.log_id,
		removed: { id: result.permission_id, userId: result.user_id, module: result.module ?? "", level: result.level ?? 0 },
	}
}

// ── Leitura em lote: o conjunto efetivo de TODAS as contas ───────────────────

/** Uma conta do sistema com o conjunto de permissões que o guard de fato aplica a ela. */
export interface AccountPermissionSet {
	userId: string
	email: string
	nrOrdem: string | null
	/** Permissões EFETIVAS (inline + políticas, com precedência de deny), como em `hasPermission`. */
	permissions: UserPermission[]
}

/**
 * Conjunto efetivo de permissões de TODAS as contas, em três queries.
 *
 * Alimenta o painel de adoção do segundo fator, que precisa responder "quantas CONTAS
 * PROTEGIDAS ainda não têm fator" — e conta protegida é derivada do registro de classificação
 * cruzado com as permissões efetivas (design.md D9), nunca de um número de nível.
 *
 * Três selects e um merge em TS, e não uma chamada de `listEffectiveUserPermissions` por
 * usuário: o app tem ~800 contas, e o N+1 renderizaria a tela em dezenas de segundos — ou, no
 * SSR, estouraria o orçamento de 60 s do ALB antes de renderizar coisa nenhuma.
 *
 * Os filtros de validade são os MESMOS da resolução canônica (grant vencido é ausente, não
 * deny; política com soft delete não conta), porque um painel que mostrasse um conjunto
 * diferente do que o guard aplica mandaria o administrador cobrar fator de quem não precisa —
 * e, pior, deixaria de cobrar de quem precisa.
 */
export async function listAccountPermissionSets(db: SisubDb, ctx: UserContext): Promise<AccountPermissionSet[]> {
	// `admin` nível 3: a lista é nominal e diz, de cada pessoa, se a conta dela está sem
	// segundo fator — é inventário de fragilidade, e não se entrega a nível 2.
	requirePermission(ctx, "admin", 3)

	const [accounts, inlineRows, policyRows] = await Promise.all([
		runQuery("FETCH_FAILED", () =>
			db.select({ id: userDataInCore.id, email: userDataInCore.email, nrOrdem: userDataInCore.nrOrdem }).from(userDataInCore).orderBy(asc(userDataInCore.email))
		),
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					user_id: userPermissionsInAccessControl.userId,
					module: userPermissionsInAccessControl.module,
					level: userPermissionsInAccessControl.level,
					mess_hall_id: userPermissionsInAccessControl.messHallId,
					kitchen_id: userPermissionsInAccessControl.kitchenId,
					unit_id: userPermissionsInAccessControl.unitId,
				})
				.from(userPermissionsInAccessControl)
				.where(notExpired(userPermissionsInAccessControl.expiresAt))
		),
		runQuery("FETCH_FAILED", () =>
			db
				.select({
					user_id: userPolicyAttachmentInAccessControl.userId,
					module: policyStatementInAccessControl.module,
					level: policyStatementInAccessControl.level,
					mess_hall_id: policyStatementInAccessControl.messHallId,
					kitchen_id: policyStatementInAccessControl.kitchenId,
					unit_id: policyStatementInAccessControl.unitId,
				})
				.from(userPolicyAttachmentInAccessControl)
				.innerJoin(policyInAccessControl, eq(policyInAccessControl.id, userPolicyAttachmentInAccessControl.policyId))
				.innerJoin(policyStatementInAccessControl, eq(policyStatementInAccessControl.policyId, policyInAccessControl.id))
				.where(and(isNull(policyInAccessControl.deletedAt), notExpired(userPolicyAttachmentInAccessControl.expiresAt)))
		),
	])

	const byUser = (rows: { user_id: string }[]) => {
		const map = new Map<string, UserPermission[]>()
		for (const { user_id, ...permission } of rows) {
			const list = map.get(user_id)
			if (list) list.push(permission as UserPermission)
			else map.set(user_id, [permission as UserPermission])
		}
		return map
	}

	const inlineByUser = byUser(inlineRows)
	const policyByUser = byUser(policyRows)

	return accounts.map((account) => ({
		userId: account.id,
		email: account.email,
		nrOrdem: account.nrOrdem,
		permissions: resolveEffectivePermissions(inlineByUser.get(account.id) ?? [], policyByUser.get(account.id) ?? []),
	}))
}
