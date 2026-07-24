/**
 * @module permissions.fn
 * Autogestão de acesso do RUMAER. Cada app do ERP gerencia apenas os grants do
 * PRÓPRIO módulo, mesmo compartilhando a tabela access_control.user_permissions.
 * Aqui TODAS as operações são restritas a `module = 'rumaer'` — o admin do rumaer
 * nunca lê nem toca grants de outro app (sisub etc.). A lógica compartilhada
 * (filtro por módulo, busca por e-mail, upsert de grant unscoped) vem de @iefa/pbac.
 *
 * Gate: administração exige grant `rumaer` nível 3 (requireRumaerAdmin).
 * Grants do rumaer são sempre globais/unscoped; nível 2 (editor) ou 3 (admin).
 */

import { grantUnscopedModulePermission, resolveModulePermissions, searchUsersByEmail, type UserPermission } from "@iefa/pbac"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireRumaerAdmin, requireUserId } from "@/lib/auth.server"
import { getAccessControlClient, getCoreReadClient } from "@/lib/supabase.server"

const MODULE = "rumaer" as const

/**
 * Permissões efetivas do PRÓPRIO usuário (deny removido, filtradas pelo módulo
 * `rumaer` — grants de outros apps nunca vão para o browser). O `userId` vem da
 * sessão (`requireUserId`), NUNCA do cliente — senão qualquer um leria as
 * permissões de qualquer userId (IDOR). Usado pelo guard de rota e pelo hook.
 */
export const fetchMyRumaerPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	return resolveModulePermissions(userId, getAccessControlClient(), MODULE)
})

export type RumaerUserSearchResult = { id: string; email: string; nrOrdem: string | null }

/** Busca usuários por email (para conceder acesso). Só admin do rumaer. */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(1) }))
	.handler(async ({ data }): Promise<RumaerUserSearchResult[]> => {
		await requireRumaerAdmin()
		return searchUsersByEmail(getCoreReadClient(), data.email)
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
 * Concede/atualiza o acesso `rumaer` de um usuário (idempotente). Sempre unscoped —
 * nível 2 = editar uniformes; 3 = administrar grants do rumaer. O upsert seguro
 * sob concorrência (update-first → insert → retry-em-23505; ver migration
 * 20260704140000) vive em `grantUnscopedModulePermission` (@iefa/pbac).
 */
export const grantRumaerPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1), level: z.union([z.literal(2), z.literal(3)]) }))
	.handler(async ({ data }) => {
		await requireRumaerAdmin()
		return grantUnscopedModulePermission(getAccessControlClient(), { module: MODULE, userId: data.userId, level: data.level })
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
