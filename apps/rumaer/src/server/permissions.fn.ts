/**
 * @module permissions.fn
 * Autogestão de acesso do RUMAER. Cada app do ERP gerencia apenas os grants do
 * PRÓPRIO módulo, mesmo compartilhando a tabela access_control.user_permissions.
 * Aqui TODAS as operações são restritas a `module = 'rumaer'` — o admin do rumaer
 * nunca lê nem toca grants de outro app (sisub etc.). A lógica compartilhada
 * (filtro por módulo, busca por e-mail, concessão auditada) vem de @iefa/pbac.
 *
 * Gate: administração exige grant `rumaer` nível 3 (requireRumaerAdmin).
 * Grants do rumaer são sempre globais/unscoped; nível 2 (editor) ou 3 (admin).
 *
 * ## Auditoria
 *
 * Conceder e revogar passam por `changeModulePermission`: o grant e a linha de
 * `access_control.sensitive_operation_log` entram numa transação só, com o ator da SESSÃO.
 * Escrita direta em `user_permissions` é recusada pelo banco desde 20260921120100.
 * Quem pode mexer em quê (autoconcessão, auto-revogação) está em `lib/permission-change.ts`.
 */

import {
	changeModulePermission,
	GrantNotAllowedError,
	PermissionChangeError,
	resolveModulePermissions,
	searchUsersByEmail,
	type UserPermission,
} from "@iefa/pbac"
import { forbidden } from "@iefa/pbac/start"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireRumaerAdmin, requireUserId } from "@/lib/auth.server"
import { buildRumaerGrant, buildRumaerRevoke, type RumaerPermissionRow as RumaerPermissionFullRow } from "@/lib/permission-change"
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
 * Recusa de política vira 403 com a frase para a tela; falha do banco vira a frase do
 * `PermissionChangeError` (o SQL cru segue em `cause`, para o log do servidor).
 */
function rethrowAccessError(error: unknown): never {
	if (error instanceof GrantNotAllowedError) forbidden(error.message)
	if (error instanceof PermissionChangeError) throw new Error(error.message, { cause: error })
	throw error
}

/**
 * Concede/atualiza o acesso `rumaer` de um usuário (idempotente). Sempre unscoped —
 * nível 2 = editar uniformes; 3 = administrar grants do rumaer. Grant e log numa transação
 * (`changeModulePermission`); a corrida entre dois administradores é absorvida no banco.
 */
export const grantRumaerPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.uuid(), level: z.union([z.literal(2), z.literal(3)]) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireRumaerAdmin()
		try {
			// Ator = sessão (`ctx.userId`); o `data` não tem campo de ator.
			await changeModulePermission(getAccessControlClient(), buildRumaerGrant(ctx.userId, data))
			return { ok: true }
		} catch (error) {
			rethrowAccessError(error)
		}
	})

/**
 * Revoga um grant `rumaer` pela linha que a tela mostrou. O ALVO sai da linha (lida com
 * `module = 'rumaer'`, então um id de outro app não é alcançável daqui), e não do cliente —
 * é o que permite recusar a auto-revogação da administração e registrar de quem era o acesso.
 */
export const revokeRumaerPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ permissionId: z.uuid() }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireRumaerAdmin()
		const { data: row, error } = await getAccessControlClient()
			.from("user_permissions")
			.select("id, user_id, module, level, unit_id, kitchen_id, mess_hall_id")
			.eq("id", data.permissionId)
			.eq("module", "rumaer")
			.maybeSingle()
		if (error) throw new Error(error.message)
		if (!row) throw new Error("Acesso não encontrado — a lista pode estar desatualizada.")
		try {
			await changeModulePermission(getAccessControlClient(), buildRumaerRevoke(ctx.userId, row as RumaerPermissionFullRow))
			return { ok: true }
		} catch (error) {
			rethrowAccessError(error)
		}
	})
