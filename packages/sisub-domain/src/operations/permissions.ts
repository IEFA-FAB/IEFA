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

import { type SisubDb, userDataInSisub, userPermissionsInSisub } from "@iefa/database/drizzle/sisub"
import { asc, eq, ilike } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { CreateUserPermission, FetchUserPermissions, SearchUsersByEmail, UpdateUserPermission } from "../schemas/permissions.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

type EffectivePermission = {
	module: string
	level: number
	mess_hall_id: number | null
	kitchen_id: number | null
	unit_id: number | null
}

/**
 * Effective permission set for a user: strips deny entries (level=0) and injects
 * an implicit "diner" allow when no explicit diner rule exists. NOT raw DB rows.
 */
export async function listEffectiveUserPermissions(db: SisubDb, input: FetchUserPermissions): Promise<EffectivePermission[]> {
	const permissions = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				module: userPermissionsInSisub.module,
				level: userPermissionsInSisub.level,
				mess_hall_id: userPermissionsInSisub.messHallId,
				kitchen_id: userPermissionsInSisub.kitchenId,
				unit_id: userPermissionsInSisub.unitId,
			})
			.from(userPermissionsInSisub)
			.where(eq(userPermissionsInSisub.userId, input.userId))
	)

	// Implicit Allow: every valid user is a diner (module "diner") unless there
	// is an explicit deny entry (level 0).
	const hasDinerRule = permissions.some((p) => p.module === "diner")
	if (!hasDinerRule) {
		permissions.push({ module: "diner", level: 1, mess_hall_id: null, kitchen_id: null, unit_id: null })
	}

	// Level 0 = explicit deny — drop from the final list so downstream
	// hasPermission checks (level >= min) stay simple.
	return permissions.filter((p) => p.level > 0)
}

export async function searchUsersByEmail(db: SisubDb, ctx: UserContext, input: SearchUsersByEmail) {
	requirePermission(ctx, "global", 2)
	// Escapa metacaracteres LIKE (\ % _) p/ que o termo seja tratado como literal — senão
	// "user_admin" casaria "useradmin"/"user1admin" (_ = curinga de 1 char no LIKE).
	const term = input.email.replace(/[\\%_]/g, "\\$&")
	return runQuery("FETCH_FAILED", () =>
		db
			.select({ id: userDataInSisub.id, email: userDataInSisub.email, nrOrdem: userDataInSisub.nrOrdem })
			.from(userDataInSisub)
			.where(ilike(userDataInSisub.email, `%${term}%`))
			.orderBy(asc(userDataInSisub.email))
			.limit(10)
	)
}

export async function fetchUserPermissionsAdmin(db: SisubDb, ctx: UserContext, input: FetchUserPermissions) {
	requirePermission(ctx, "global", 2)
	return runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: userPermissionsInSisub.id,
				module: userPermissionsInSisub.module,
				level: userPermissionsInSisub.level,
				mess_hall_id: userPermissionsInSisub.messHallId,
				kitchen_id: userPermissionsInSisub.kitchenId,
				unit_id: userPermissionsInSisub.unitId,
			})
			.from(userPermissionsInSisub)
			.where(eq(userPermissionsInSisub.userId, input.userId))
			.orderBy(asc(userPermissionsInSisub.module))
	)
}

export async function createUserPermission(db: SisubDb, ctx: UserContext, input: CreateUserPermission) {
	requirePermission(ctx, "global", 2)
	await runQuery("INSERT_FAILED", () =>
		db.insert(userPermissionsInSisub).values({
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
	const updated = await runQuery("UPDATE_FAILED", () =>
		db
			.update(userPermissionsInSisub)
			.set({
				level: input.level,
				messHallId: input.mess_hall_id ?? null,
				kitchenId: input.kitchen_id ?? null,
				unitId: input.unit_id ?? null,
			})
			.where(eq(userPermissionsInSisub.id, input.permissionId))
			.returning({ id: userPermissionsInSisub.id })
	)
	if (updated.length === 0) throw new DomainError("UPDATE_FAILED", `permission ${input.permissionId} not found`)
	return { success: true as const }
}

export async function deleteUserPermission(db: SisubDb, ctx: UserContext, input: { permissionId: string }) {
	requirePermission(ctx, "global", 2)
	const deleted = await runQuery("DELETE_FAILED", () =>
		db.delete(userPermissionsInSisub).where(eq(userPermissionsInSisub.id, input.permissionId)).returning({ id: userPermissionsInSisub.id })
	)
	if (deleted.length === 0) throw new DomainError("DELETE_FAILED", `permission ${input.permissionId} not found`)
	return { success: true as const }
}
