/**
 * @module permissions.fn
 * Autogestão de acesso do SUCONT. Cada app do ERP gerencia apenas os grants do
 * PRÓPRIO módulo, mesmo compartilhando a tabela access_control.user_permissions.
 * Aqui TODAS as operações são restritas a `module = 'sucont'`. A lógica
 * compartilhada (filtro por módulo, busca por e-mail, upsert de grant unscoped)
 * vem de @iefa/pbac.
 *
 * Gate: administração exige grant `sucont` nível 3 (requireSucontAdmin).
 * Grants do sucont são sempre globais/unscoped; nível 1 (acesso), 2 (editor) ou 3 (admin).
 */

import { grantUnscopedModulePermission, resolveModulePermissions, searchUsersByEmail, type UserPermission } from "@iefa/pbac"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAdmin, requireUserId } from "#/lib/auth.server"
import { getAccessControlClient, getCoreReadClient } from "#/lib/supabase.server"

const MODULE = "sucont" as const

/**
 * Permissões efetivas do PRÓPRIO usuário (deny removido, filtradas pelo módulo
 * `sucont` — grants de outros apps nunca vão para o browser). O `userId` vem da
 * sessão (`requireUserId`), NUNCA do cliente — senão qualquer um leria as
 * permissões de qualquer userId (IDOR). Usado pelo guard de rota e pelo hook.
 */
export const fetchMySucontPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	return resolveModulePermissions(userId, getAccessControlClient(), MODULE)
})

export type SucontUserSearchResult = { id: string; email: string }

/** Busca usuários por e-mail (para conceder acesso). Só admin do sucont. */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(1) }))
	.handler(async ({ data }): Promise<SucontUserSearchResult[]> => {
		await requireSucontAdmin()
		// O sucont não usa nrOrdem — descarta o campo do helper compartilhado.
		return (await searchUsersByEmail(getCoreReadClient(), data.email)).map(({ id, email }) => ({ id, email }))
	})

/**
 * Concede/atualiza grant `sucont` (nível 1–3, global) a um usuário. Só admin.
 * O upsert seguro sob concorrência (update-first → insert → retry-em-23505,
 * apoiado no índice parcial único do DB) vive em `grantUnscopedModulePermission`
 * (@iefa/pbac). Não colide com grants de outros apps na mesma tabela.
 */
export const grantSucontPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1), level: z.number().int().min(1).max(3) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontAdmin()
		return grantUnscopedModulePermission(getAccessControlClient(), { module: MODULE, userId: data.userId, level: data.level })
	})

/** Revoga o grant `sucont` de um usuário. Só admin. */
export const revokeSucontPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontAdmin()
		const { error } = await getAccessControlClient().from("user_permissions").delete().eq("user_id", data.userId).eq("module", MODULE)
		if (error) throw new Error(error.message)
		return { ok: true }
	})
