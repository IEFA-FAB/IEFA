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
import { getAccessControlClient, getCoreClient } from "#/lib/supabase.server"

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
		return (await searchUsersByEmail(getCoreClient(), data.email)).map(({ id, email }) => ({ id, email }))
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
		const ctx = await requireSucontAdmin()
		assertNotSelf(ctx.userId, data.userId)
		return grantUnscopedModulePermission(getAccessControlClient(), { module: MODULE, userId: data.userId, level: data.level })
	})

/** Revoga o grant `sucont` de um usuário. Só admin, e nunca o próprio. */
export const revokeSucontPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireSucontAdmin()
		assertNotSelf(ctx.userId, data.userId)
		const { error } = await getAccessControlClient().from("user_permissions").delete().eq("user_id", data.userId).eq("module", MODULE)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

/**
 * Recusa a alteração do próprio acesso.
 *
 * Rebaixar-se para nível 1 ou revogar o próprio grant tranca o administrador para
 * fora desta tela — e, se ele for o último nível 3, tranca TODO MUNDO para fora
 * dela, sem caminho de volta pela interface: o conserto passa a ser SQL no banco
 * de produção. O gate mora no servidor, e não só no botão desabilitado, porque a
 * chamada é alcançável direto pelo endpoint.
 *
 * Não é uma trava de "último admin" — contar administradores teria corrida entre a
 * contagem e o delete. Ninguém mexe no próprio acesso; outro administrador mexe.
 */
function assertNotSelf(actorId: string, targetId: string): void {
	if (actorId === targetId) throw new Error("Você não pode alterar o próprio acesso. Peça a outro administrador do SUCONT.")
}

export type SucontGrant = {
	userId: string
	email: string
	level: number
	/** ISO 8601, ou `null` para grant sem prazo. Vencido é AUSÊNCIA de acesso, não deny. */
	expiresAt: string | null
}

/**
 * Todos os grants `sucont` com o e-mail de quem os tem — a lista de conferência
 * da tela de permissões. Só admin.
 *
 * Devolve inclusive o grant VENCIDO: para a resolução ele não existe (a tela
 * marca como "expirado"), mas omiti-lo da lista faria a linha desaparecer sem
 * que ninguém a tivesse revogado, e o administrador procuraria um acesso que
 * continua gravado.
 *
 * Duas consultas em vez de um join: `user_permissions` e `user_data` estão em
 * schemas diferentes (`access_control` e `core`), cada um com o seu client — o
 * PostgREST não atravessa schema no `select` aninhado.
 */
export const listSucontGrantsFn = createServerFn({ method: "GET" }).handler(async (): Promise<SucontGrant[]> => {
	await requireSucontAdmin()

	const { data: rows, error } = await getAccessControlClient().from("user_permissions").select("user_id, level, expires_at").eq("module", MODULE)
	if (error) throw new Error(error.message)

	const grants = (rows ?? []) as Array<{ user_id: string; level: number; expires_at: string | null }>
	if (grants.length === 0) return []

	const { data: users, error: usersError } = await getCoreClient()
		.from("user_data")
		.select("id, email")
		.in(
			"id",
			grants.map((g) => g.user_id)
		)
	if (usersError) throw new Error(usersError.message)

	const emailById = new Map((users ?? []).map((u: { id: string; email: string | null }) => [u.id, u.email ?? ""]))

	return grants
		.map((g) => ({ userId: g.user_id, email: emailById.get(g.user_id) ?? "", level: g.level, expiresAt: g.expires_at }))
		.sort((a, b) => b.level - a.level || a.email.localeCompare(b.email, "pt-BR"))
})
