/**
 * Permission resolution + admin CRUD for the sisub RBAC system.
 *
 * LEVELS: 0=deny (explicit block), 1=read, 2=write.
 * MODULES: diner | messhall | unit | kitchen | kitchen-production | global |
 *          analytics | local-analytics | storage.
 *
 * Auth posture preserved from the original server functions:
 *   - listEffectiveUserPermissions is UNAUTHENTICATED (foundational lookup used
 *     while bootstrapping a session) — no ctx, no guard.
 *   - the admin operations require global level 2 (was requireGlobalPermissionAdmin).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { requirePermission } from "../guards/require-permission.ts"
import type { CreateUserPermission, FetchUserPermissions, SearchUsersByEmail, UpdateUserPermission } from "../schemas/permissions.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

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
export async function listEffectiveUserPermissions(client: AnyClient, input: FetchUserPermissions): Promise<EffectivePermission[]> {
	const { data: rows, error } = await client.from("user_permissions").select("module, level, mess_hall_id, kitchen_id, unit_id").eq("user_id", input.userId)

	if (error) throw new DomainError("FETCH_FAILED", error.message)

	const permissions: EffectivePermission[] = (rows ?? []) as unknown as EffectivePermission[]

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

export async function searchUsersByEmail(client: AnyClient, ctx: UserContext, input: SearchUsersByEmail) {
	requirePermission(ctx, "global", 2)
	const { data, error } = await client.from("user_data").select("id, email, nrOrdem").ilike("email", `%${input.email}%`).order("email").limit(10)
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

export async function fetchUserPermissionsAdmin(client: AnyClient, ctx: UserContext, input: FetchUserPermissions) {
	requirePermission(ctx, "global", 2)
	const { data, error } = await client
		.from("user_permissions")
		.select("id, module, level, mess_hall_id, kitchen_id, unit_id")
		.eq("user_id", input.userId)
		.order("module")
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? []
}

export async function createUserPermission(client: AnyClient, ctx: UserContext, input: CreateUserPermission) {
	requirePermission(ctx, "global", 2)
	const { error } = await client.from("user_permissions").insert({
		user_id: input.userId,
		module: input.module,
		level: input.level,
		mess_hall_id: input.mess_hall_id ?? null,
		kitchen_id: input.kitchen_id ?? null,
		unit_id: input.unit_id ?? null,
	})
	if (error) throw new DomainError("INSERT_FAILED", error.message)
	return { success: true as const }
}

export async function updateUserPermission(client: AnyClient, ctx: UserContext, input: UpdateUserPermission) {
	requirePermission(ctx, "global", 2)
	const { error } = await client
		.from("user_permissions")
		.update({
			level: input.level,
			mess_hall_id: input.mess_hall_id ?? null,
			kitchen_id: input.kitchen_id ?? null,
			unit_id: input.unit_id ?? null,
		})
		.eq("id", input.permissionId)
	if (error) throw new DomainError("UPDATE_FAILED", error.message)
	return { success: true as const }
}

export async function deleteUserPermission(client: AnyClient, ctx: UserContext, input: { permissionId: string }) {
	requirePermission(ctx, "global", 2)
	const { error } = await client.from("user_permissions").delete().eq("id", input.permissionId)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
	return { success: true as const }
}
