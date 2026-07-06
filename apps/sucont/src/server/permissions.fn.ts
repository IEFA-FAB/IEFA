/**
 * @module permissions.fn
 * Autogestão de acesso do SUCONT. Cada app do ERP gerencia apenas os grants do
 * PRÓPRIO módulo, mesmo compartilhando a tabela access_control.user_permissions.
 * Aqui TODAS as operações são restritas a `module = 'sucont'`.
 *
 * Gate: administração exige grant `sucont` nível 3 (requireSucontAdmin).
 * Grants do sucont são sempre globais/unscoped; nível 1 (acesso), 2 (editor) ou 3 (admin).
 */

import { resolveUserPermissions, type UserPermission } from "@iefa/pbac"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAdmin, requireUserId } from "#/lib/auth.server"
import { getAccessControlClient, getCoreReadClient } from "#/lib/supabase.server"

const MODULE = "sucont" as const

/**
 * Permissões efetivas do PRÓPRIO usuário (deny removido, "diner" implícito injetado).
 * O `userId` vem da sessão (`requireUserId`), NUNCA do cliente — senão qualquer um
 * leria as permissões de qualquer userId (IDOR). Usado pelo guard de rota e pelo hook.
 */
export const fetchMySucontPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	const all = await resolveUserPermissions(userId, getAccessControlClient())
	// Só devolve grants do sucont: a tabela é compartilhada e mandar grants de outros
	// apps (global, kitchen, …) para o browser vazaria autorização cross-app sem uso aqui.
	return all.filter((p) => p.module === MODULE)
})

export type SucontUserSearchResult = { id: string; email: string }

/** Busca usuários por e-mail (para conceder acesso). Só admin do sucont. */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(1) }))
	.handler(async ({ data }): Promise<SucontUserSearchResult[]> => {
		await requireSucontAdmin()
		// Escapa metacaracteres do LIKE (\ % _) p/ tratar o termo como literal.
		const term = data.email.replace(/[\\%_]/g, "\\$&")
		const { data: rows, error } = await getCoreReadClient()
			.from("user_data")
			.select("id, email")
			.ilike("email", `%${term}%`)
			.order("email", { ascending: true })
			.limit(10)
		if (error) throw new Error(error.message)
		return (rows ?? []).map((r) => ({ id: r.id, email: r.email ?? "" }))
	})

/** Concede/atualiza grant `sucont` (nível 1–3, global) a um usuário. Só admin. */
export const grantSucontPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1), level: z.number().int().min(1).max(3) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontAdmin()
		const client = getAccessControlClient()

		// Update-first → insert; o índice parcial único garante 1 grant global por
		// usuário/módulo. Não colide com grants de outros apps na mesma tabela.
		const { data: updated, error: updErr } = await client
			.from("user_permissions")
			.update({ level: data.level })
			.eq("user_id", data.userId)
			.eq("module", MODULE)
			.is("mess_hall_id", null)
			.is("kitchen_id", null)
			.is("unit_id", null)
			.select("id")
		if (updErr) throw new Error(updErr.message)
		if (updated && updated.length > 0) return { ok: true }

		const { error: insErr } = await client.from("user_permissions").insert({ user_id: data.userId, module: MODULE, level: data.level })
		if (insErr) throw new Error(insErr.message)
		return { ok: true }
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
