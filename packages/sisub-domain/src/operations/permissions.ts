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

import { type SisubDb, userDataInCore, userPermissionsInAccessControl } from "@iefa/database/drizzle/sisub"
import { resolveEffectivePermissions, type UserPermission } from "@iefa/pbac"
import { asc, eq, ilike } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { CreateUserPermission, FetchUserPermissions, SearchUsersByEmail, UpdateUserPermission } from "../schemas/permissions.ts"
import type { UserContext } from "../types/context.ts"
import { mutateOrFail, runQuery } from "../utils/index.ts"

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

	// Resolução compartilhada com rumaer/sucont (@iefa/pbac): comensal implícito +
	// precedência de deny. Quando as políticas nomeadas existirem, os statements delas
	// entram aqui como uma segunda origem — a assinatura de `resolveEffectivePermissions`
	// é variádica justamente para isso.
	// `module` é text no banco; o contrato do PBAC usa o union de módulos. Os valores são
	// escritos pelo próprio console de permissões, que só oferece módulos válidos.
	return resolveEffectivePermissions(permissions as UserPermission[])
}

export async function searchUsersByEmail(db: SisubDb, ctx: UserContext, input: SearchUsersByEmail) {
	requirePermission(ctx, "global", 2)
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
	requirePermission(ctx, "global", 2)
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
	requirePermission(ctx, "global", 2)
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
	requirePermission(ctx, "global", 2)
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
	requirePermission(ctx, "global", 2)
	await mutateOrFail("DELETE_FAILED", `permission ${input.permissionId} not found`, () =>
		db
			.delete(userPermissionsInAccessControl)
			.where(eq(userPermissionsInAccessControl.id, input.permissionId))
			.returning({ id: userPermissionsInAccessControl.id })
	)
	return { success: true as const }
}
