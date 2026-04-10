import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import type { AppModule, UserPermission } from "@/types/domain/permissions"

const APP_MODULES = ["diner", "messhall", "unit", "kitchen", "kitchen-production", "global", "analytics", "local-analytics", "storage"] as const

// ---------------------------------------------------------------------------
// User-facing: permissões filtradas (sem deny, com implicit allow)
// ---------------------------------------------------------------------------

export const fetchUserPermissionsFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }): Promise<UserPermission[]> => {
		// biome-ignore lint/suspicious/noExplicitAny: user_permissions table not yet in generated Supabase types
		const { data: rows, error } = await (getSupabaseServerClient() as any)
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

export const fetchUserPermissionsAdminFn = createServerFn({ method: "GET" })
	.inputValidator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }): Promise<PermissionRow[]> => {
		// biome-ignore lint/suspicious/noExplicitAny: user_permissions table not yet in generated Supabase types
		const { data: rows, error } = await (getSupabaseServerClient() as any)
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
		// biome-ignore lint/suspicious/noExplicitAny: user_permissions table not yet in generated Supabase types
		const { error } = await (getSupabaseServerClient() as any).from("user_permissions").insert({
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
		// biome-ignore lint/suspicious/noExplicitAny: user_permissions table not yet in generated Supabase types
		const { error } = await (getSupabaseServerClient() as any)
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

export const deleteUserPermissionFn = createServerFn({ method: "POST" })
	.inputValidator(z.object({ permissionId: z.string().min(1) }))
	.handler(async ({ data }) => {
		// biome-ignore lint/suspicious/noExplicitAny: user_permissions table not yet in generated Supabase types
		const { error } = await (getSupabaseServerClient() as any).from("user_permissions").delete().eq("id", data.permissionId)

		if (error) throw new Error(error.message)
		return { success: true }
	})
