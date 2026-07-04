/**
 * @module permissions.fn
 * Autogestão de acesso do RUMAER. Cada app do ERP gerencia apenas os grants do
 * PRÓPRIO módulo, mesmo compartilhando a tabela access_control.user_permissions.
 * Aqui TODAS as operações são restritas a `module = 'rumaer'` — o admin do rumaer
 * nunca lê nem toca grants de outro app (sisub etc.).
 *
 * Gate: administração exige grant `rumaer` nível 3 (requireRumaerAdmin).
 * Grants do rumaer são sempre globais/unscoped; nível 2 (editor) ou 3 (admin).
 */

import { resolveUserPermissions, type UserPermission } from "@iefa/pbac"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireRumaerAdmin, requireUserId } from "@/lib/auth.server"
import { getAccessControlClient, getCoreReadClient } from "@/lib/supabase.server"

const MODULE = "rumaer" as const

/**
 * Permissões efetivas do PRÓPRIO usuário (deny removido, "diner" implícito injetado).
 * O `userId` vem da sessão (`requireUserId`), NUNCA do cliente — senão qualquer um
 * leria as permissões de qualquer userId (IDOR). Usado pelo guard de rota e pelo hook.
 */
export const fetchMyRumaerPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	return resolveUserPermissions(userId, getAccessControlClient())
})

export type RumaerUserSearchResult = { id: string; email: string; nrOrdem: string | null }

/** Busca usuários por email (para conceder acesso). Só admin do rumaer. */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(1) }))
	.handler(async ({ data }): Promise<RumaerUserSearchResult[]> => {
		await requireRumaerAdmin()
		// Escapa metacaracteres do LIKE (\ % _) p/ tratar o termo como literal.
		const term = data.email.replace(/[\\%_]/g, "\\$&")
		const { data: rows, error } = await getCoreReadClient()
			.from("user_data")
			.select("id, email, nrOrdem")
			.ilike("email", `%${term}%`)
			.order("email", { ascending: true })
			.limit(10)
		if (error) throw new Error(error.message)
		return (rows ?? []).map((r) => ({ id: r.id, email: r.email ?? "", nrOrdem: r.nrOrdem ?? null }))
	})

export type RumaerPermissionRow = { id: string; level: number }

/** Grants `rumaer` de um usuário (apenas do módulo rumaer). Só admin do rumaer. */
export const fetchUserRumaerPermissionsFn = createServerFn({ method: "GET" })
	.validator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }): Promise<RumaerPermissionRow[]> => {
		await requireRumaerAdmin()
		const { data: rows, error } = await getAccessControlClient()
			.from("user_permissions")
			.select("id, level")
			.eq("user_id", data.userId)
			.eq("module", MODULE)
			.order("level", { ascending: false })
		if (error) throw new Error(error.message)
		return (rows ?? []) as RumaerPermissionRow[]
	})

/**
 * Concede/atualiza o acesso `rumaer` de um usuário (idempotente).
 * Nível 2 = editar uniformes; 3 = administrar grants do rumaer. Sempre unscoped.
 */
export const grantRumaerPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1), level: z.union([z.literal(2), z.literal(3)]) }))
	.handler(async ({ data }) => {
		await requireRumaerAdmin()
		const client = getAccessControlClient()
		const { data: existing, error: selErr } = await client.from("user_permissions").select("id").eq("user_id", data.userId).eq("module", MODULE).maybeSingle()
		if (selErr) throw new Error(selErr.message)

		if (existing) {
			const { error } = await client.from("user_permissions").update({ level: data.level }).eq("id", existing.id).eq("module", MODULE)
			if (error) throw new Error(error.message)
		} else {
			const { error } = await client
				.from("user_permissions")
				.insert({ user_id: data.userId, module: MODULE, level: data.level, mess_hall_id: null, kitchen_id: null, unit_id: null })
			if (error) throw new Error(error.message)
		}
		return { ok: true as const }
	})

/** Revoga um grant `rumaer`. O `.eq("module", ...)` garante que só grants do rumaer sejam apagados. */
export const revokeRumaerPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ permissionId: z.string().uuid() }))
	.handler(async ({ data }) => {
		await requireRumaerAdmin()
		const { error } = await getAccessControlClient().from("user_permissions").delete().eq("id", data.permissionId).eq("module", MODULE)
		if (error) throw new Error(error.message)
		return { ok: true as const }
	})
