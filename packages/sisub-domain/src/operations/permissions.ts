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
import { and, asc, eq, ilike, isNull } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { CreateUserPermission, FetchUserPermissions, SearchUsersByEmail, UpdateUserPermission } from "../schemas/permissions.ts"
import type { UserContext } from "../types/context.ts"
import { mutateOrFail, runQuery } from "../utils/index.ts"
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
			.where(eq(userPermissionsInAccessControl.userId, input.userId))
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
				.where(eq(userPermissionsInAccessControl.userId, input.userId))
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
			.where(and(eq(userPolicyAttachmentInAccessControl.userId, userId), isNull(policyInAccessControl.deletedAt)))
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
			})
			.from(userPermissionsInAccessControl)
			.where(eq(userPermissionsInAccessControl.userId, input.userId))
			.orderBy(asc(userPermissionsInAccessControl.module))
	)
}

export async function createUserPermission(db: SisubDb, ctx: UserContext, input: CreateUserPermission) {
	requirePermission(ctx, "admin", 2)
	await runQuery("INSERT_FAILED", () =>
		db.insert(userPermissionsInAccessControl).values({
			userId: input.userId,
			module: input.module,
			level: input.level,
			messHallId: input.mess_hall_id ?? null,
			kitchenId: input.kitchen_id ?? null,
			unitId: input.unit_id ?? null,
		})
	)
	return { success: true as const }
}

export async function updateUserPermission(db: SisubDb, ctx: UserContext, input: UpdateUserPermission) {
	requirePermission(ctx, "admin", 2)
	await mutateOrFail("UPDATE_FAILED", `permission ${input.permissionId} not found`, () =>
		db
			.update(userPermissionsInAccessControl)
			.set({
				level: input.level,
				messHallId: input.mess_hall_id ?? null,
				kitchenId: input.kitchen_id ?? null,
				unitId: input.unit_id ?? null,
			})
			.where(eq(userPermissionsInAccessControl.id, input.permissionId))
			.returning({ id: userPermissionsInAccessControl.id })
	)
	return { success: true as const }
}

export async function deleteUserPermission(db: SisubDb, ctx: UserContext, input: { permissionId: string }) {
	requirePermission(ctx, "admin", 2)
	await mutateOrFail("DELETE_FAILED", `permission ${input.permissionId} not found`, () =>
		db
			.delete(userPermissionsInAccessControl)
			.where(eq(userPermissionsInAccessControl.id, input.permissionId))
			.returning({ id: userPermissionsInAccessControl.id })
	)
	return { success: true as const }
}
