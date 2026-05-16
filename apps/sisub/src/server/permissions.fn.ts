/**
 * @module permissions.fn
 * User permission resolution and admin CRUD for the sisub RBAC system.
 * LEVELS: 0=deny (explicit block), 1=read, 2=write. Deny entries are stripped from fetchUserPermissionsFn output.
 * MODULES: diner | messhall | unit | kitchen | kitchen-production | global | analytics | local-analytics | storage.
 * SCOPE: permissions can be scoped to mess_hall_id, kitchen_id, or unit_id (at most one per row).
 */

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { AppModule, UserPermission } from "@/types/domain/permissions"

const APP_MODULES = ["diner", "messhall", "unit", "kitchen", "kitchen-production", "global", "analytics", "local-analytics", "storage"] as const

// ---------------------------------------------------------------------------
// User-facing: permissões filtradas (sem deny, com implicit allow)
// ---------------------------------------------------------------------------

/**
 * Returns the effective permission set for a user — strips deny entries (level=0) and injects an implicit "diner" allow if no rule exists.
 *
 * @remarks
 * CRITICAL: output is NOT raw DB rows. Two transformations applied in order:
 *   (1) Implicit allow: pushes { module:"diner", level:1, ...null scopes } if no explicit diner rule found.
 *   (2) Deny strip: filters out level=0 entries — callers see only granted permissions.
 * Downstream hasPermission checks use level >= minLevel; safe because deny entries are absent from output.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchUserPermissionsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }): Promise<UserPermission[]> => {
		const { data: rows, error } = await getSupabaseServerClient()
			.from("user_permissions")
			.select("module, level, mess_hall_id, kitchen_id, unit_id")
			.eq("user_id", data.userId)

		if (error) throw new Error(error.message)

		const permissions: UserPermission[] = (rows ?? []) as unknown as UserPermission[]

		// Implicit Allow: todo usuário válido é comensal (módulo "diner"),
		// a menos que haja uma entrada explícita de deny (level 0).
		const hasDinerRule = permissions.some((p) => p.module === "diner")
		if (!hasDinerRule) {
			permissions.push({
				module: "diner",
				level: 1,
				mess_hall_id: null,
				kitchen_id: null,
				unit_id: null,
			})
		}

		// Nível 0 = deny explícito — remove da lista final para simplificar
		// as verificações downstream (hasPermission apenas checa level >= min).
		return permissions.filter((p) => p.level > 0)
	})

// ---------------------------------------------------------------------------
// Admin: busca de usuários por email
// ---------------------------------------------------------------------------

export type UserSearchResult = {
	id: string
	email: string
	nrOrdem: string | null
}

/**
 * Searches users by partial email match (case-insensitive ilike), returning up to 10 results ordered by email. Admin-only use.
 *
 * @throws {Error} on Supabase query failure.
 */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ email: z.string().min(1) }))
	.handler(async ({ data }): Promise<UserSearchResult[]> => {
		const { data: rows, error } = await getSupabaseServerClient()
			.from("user_data")
			.select("id, email, nrOrdem")
			.ilike("email", `%${data.email}%`)
			.order("email")
			.limit(10)

		if (error) throw new Error(error.message)
		return (rows ?? []) as UserSearchResult[]
	})

// ---------------------------------------------------------------------------
// Admin: permissões de um usuário com IDs (para CRUD)
// ---------------------------------------------------------------------------

export type PermissionRow = {
	id: string
	module: AppModule
	level: number
	mess_hall_id: number | null
	kitchen_id: number | null
	unit_id: number | null
}

/**
 * Fetches raw permission rows for a user including row IDs, for admin CRUD operations. Includes deny entries (level=0) — unlike fetchUserPermissionsFn.
 *
 * @throws {Error} on Supabase query failure.
 */
export const fetchUserPermissionsAdminFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }): Promise<PermissionRow[]> => {
		const { data: rows, error } = await getSupabaseServerClient()
			.from("user_permissions")
			.select("id, module, level, mess_hall_id, kitchen_id, unit_id")
			.eq("user_id", data.userId)
			.order("module")

		if (error) throw new Error(error.message)
		return (rows ?? []) as PermissionRow[]
	})

// ---------------------------------------------------------------------------
// Admin: criar permissão
// ---------------------------------------------------------------------------

/**
 * Creates a permission entry for a user. level=0 = explicit deny; level=1 = read; level=2 = write.
 *
 * @remarks
 * SIDE EFFECTS: inserts into user_permissions. Scope determined by which of mess_hall_id / kitchen_id / unit_id is set.
 *
 * @throws {Error} on Supabase insert failure (e.g. duplicate module+user combination).
 */
export const createUserPermissionFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			userId: z.string().min(1),
			module: z.enum(APP_MODULES),
			level: z.number().int().min(0).max(2),
			mess_hall_id: z.number().nullable().optional(),
			kitchen_id: z.number().nullable().optional(),
			unit_id: z.number().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("user_permissions")
			.insert({
				user_id: data.userId,
				module: data.module,
				level: data.level,
				mess_hall_id: data.mess_hall_id ?? null,
				kitchen_id: data.kitchen_id ?? null,
				unit_id: data.unit_id ?? null,
			})

		if (error) throw new Error(error.message)
		return { success: true }
	})

// ---------------------------------------------------------------------------
// Admin: atualizar permissão (nível e escopo)
// ---------------------------------------------------------------------------

/**
 * Updates the level and/or scope of an existing permission row by ID.
 *
 * @throws {Error} on Supabase update failure.
 */
export const updateUserPermissionFn = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			permissionId: z.string().min(1),
			level: z.number().int().min(0).max(2),
			mess_hall_id: z.number().nullable().optional(),
			kitchen_id: z.number().nullable().optional(),
			unit_id: z.number().nullable().optional(),
		})
	)
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient()
			.from("user_permissions")
			.update({
				level: data.level,
				mess_hall_id: data.mess_hall_id ?? null,
				kitchen_id: data.kitchen_id ?? null,
				unit_id: data.unit_id ?? null,
			})
			.eq("id", data.permissionId)

		if (error) throw new Error(error.message)
		return { success: true }
	})

// ---------------------------------------------------------------------------
// Admin: excluir permissão
// ---------------------------------------------------------------------------

/**
 * Hard-deletes a permission row — no soft-delete, immediately revokes access.
 *
 * @throws {Error} on Supabase delete failure.
 */
export const deleteUserPermissionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ permissionId: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { error } = await getSupabaseServerClient().from("user_permissions").delete().eq("id", data.permissionId)

		if (error) throw new Error(error.message)
		return { success: true }
	})
