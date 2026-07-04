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
	const all = await resolveUserPermissions(userId, getAccessControlClient())
	// Só devolve grants do rumaer: a tabela é compartilhada e mandar grants de outros
	// apps (global, kitchen, …) para o browser vazaria autorização cross-app sem uso aqui.
	return all.filter((p) => p.module === MODULE)
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
 * Concede/atualiza o acesso `rumaer` de um usuário (idempotente). Sempre unscoped —
 * nível 2 = editar uniformes; 3 = administrar grants do rumaer.
 *
 * Padrão update-first → insert → retry-em-23505 para ser seguro sob concorrência.
 * O select-then-insert simples tem corrida (dois admins simultâneos podem ambos ver
 * "não existe" e inserir). Não usamos upsert(onConflict) porque o PostgREST não infere
 * índice ÚNICO PARCIAL (o unscoped rumaer é garantido por índice parcial — ver migration
 * 20260704140000). A garantia dura fica no DB (índice único); a corrida perde com 23505 e
 * reaplica como update.
 */
export const grantRumaerPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.string().min(1), level: z.union([z.literal(2), z.literal(3)]) }))
	.handler(async ({ data }) => {
		await requireRumaerAdmin()
		const client = getAccessControlClient()

		const applyUpdate = () => client.from("user_permissions").update({ level: data.level }).eq("user_id", data.userId).eq("module", MODULE).select("id")

		// 1. atualiza o grant existente, se houver
		const { data: updated, error: updErr } = await applyUpdate()
		if (updErr) throw new Error(updErr.message)
		if (updated && updated.length > 0) return { ok: true as const }

		// 2. não existia → insere (índice único parcial impede duplicata de fato)
		const { error: insErr } = await client
			.from("user_permissions")
			.insert({ user_id: data.userId, module: MODULE, level: data.level, mess_hall_id: null, kitchen_id: null, unit_id: null })
		if (!insErr) return { ok: true as const }

		// 3. corrida: outro request inseriu primeiro (unique_violation) → reaplica como update
		if (insErr.code === "23505") {
			const { error: retryErr } = await applyUpdate()
			if (retryErr) throw new Error(retryErr.message)
			return { ok: true as const }
		}
		throw new Error(insErr.message)
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
