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
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAdmin, requireUserId } from "#/lib/auth.server"
import { getAccessControlClient, getCoreClient } from "#/lib/supabase.server"

const MODULE = "sucont" as const

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient, como no @iefa/pbac
type AnySupabaseClient = SupabaseClient<any, any>

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
	/**
	 * De onde o acesso vem. `policy` é acesso emprestado por uma política anexada ao
	 * usuário, e NÃO é revogável por esta tela — apagar a linha de `user_permissions`
	 * não desfaz um anexo de política, e a chamada devolveria sucesso com o acesso
	 * intacto.
	 */
	source: "inline" | "policy"
	/** Nome da política que empresta o acesso. Só em `source: "policy"`. */
	policyName?: string
}

/**
 * Todos os grants `sucont` com o e-mail de quem os tem — a lista de conferência
 * da tela de permissões. Só admin.
 *
 * As DUAS origens do modelo, como `resolveUserPermissions` faz: o grant inline em
 * `user_permissions` e os statements de política anexada ao usuário. Ler só a
 * primeira era o defeito: quem recebeu `sucont` por política simplesmente não
 * aparecia aqui, e o "Revogar" respondia sucesso enquanto o acesso continuava de pé.
 *
 * Devolve inclusive o grant VENCIDO: para a resolução ele não existe (a tela marca
 * como "expirado"), mas omiti-lo faria a linha sumir sem que ninguém a tivesse
 * revogado, e o administrador procuraria um acesso que continua gravado.
 *
 * Consultas planas em vez de embed: `user_permissions` e `user_data` moram em
 * schemas diferentes (`access_control` e `core`), cada um com o seu client, e o
 * PostgREST não atravessa schema no `select` aninhado.
 */
export const listSucontGrantsFn = createServerFn({ method: "GET" }).handler(async (): Promise<SucontGrant[]> => {
	await requireSucontAdmin()
	const accessControl = getAccessControlClient()

	const [inline, byPolicy] = await Promise.all([fetchInlineGrants(accessControl), fetchPolicyGrants(accessControl)])
	const all = [...inline, ...byPolicy]
	if (all.length === 0) return []

	const { data: users, error: usersError } = await getCoreClient()
		.from("user_data")
		.select("id, email")
		.in("id", [...new Set(all.map((g) => g.userId))])
	if (usersError) throw new Error(usersError.message)

	const emailById = new Map((users ?? []).map((u: { id: string; email: string | null }) => [u.id, u.email ?? ""]))

	return all.map((g) => ({ ...g, email: emailById.get(g.userId) ?? "" })).sort((a, b) => b.level - a.level || a.email.localeCompare(b.email, "pt-BR"))
})

type PartialGrant = Omit<SucontGrant, "email">

/** Grants gravados direto na linha do usuário. */
async function fetchInlineGrants(accessControl: AnySupabaseClient): Promise<PartialGrant[]> {
	const { data, error } = await accessControl.from("user_permissions").select("user_id, level, expires_at").eq("module", MODULE)
	if (error) throw new Error(error.message)
	return ((data ?? []) as Array<{ user_id: string; level: number; expires_at: string | null }>).map((row) => ({
		userId: row.user_id,
		level: row.level,
		expiresAt: row.expires_at,
		source: "inline" as const,
	}))
}

/**
 * Acesso emprestado por política anexada — o caminho inverso do que
 * `resolveUserPermissions` percorre: sai dos statements de `sucont`, chega nos
 * usuários.
 *
 * Banco sem o modelo de políticas responde "nenhuma política", não erro: é a mesma
 * degradação tolerada em `@iefa/pbac`, e aqui ela só encolhe uma lista de
 * conferência — nunca concede acesso.
 */
async function fetchPolicyGrants(accessControl: AnySupabaseClient): Promise<PartialGrant[]> {
	const { data: statements, error: statementError } = await accessControl.from("policy_statement").select("policy_id, level").eq("module", MODULE)
	if (statementError) {
		if (isMissingTable(statementError)) return []
		throw new Error(statementError.message)
	}

	const levelByPolicy = new Map<string, number>()
	for (const row of (statements ?? []) as Array<{ policy_id: string; level: number }>) {
		// Uma política pode ter mais de um statement do módulo; vale o maior nível,
		// que é a semântica da resolução.
		levelByPolicy.set(row.policy_id, Math.max(levelByPolicy.get(row.policy_id) ?? 0, row.level))
	}
	if (levelByPolicy.size === 0) return []

	const ids = [...levelByPolicy.keys()]
	const [{ data: policies, error: policyError }, { data: attachments, error: attachmentError }] = await Promise.all([
		accessControl.from("policy").select("id, name").in("id", ids).is("deleted_at", null),
		accessControl.from("user_policy_attachment").select("user_id, policy_id, expires_at").in("policy_id", ids),
	])
	if (policyError) throw new Error(policyError.message)
	if (attachmentError) throw new Error(attachmentError.message)

	// Política com soft delete não empresta nada — mesma regra da resolução.
	const nameById = new Map((policies ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

	return ((attachments ?? []) as Array<{ user_id: string; policy_id: string; expires_at: string | null }>)
		.filter((row) => nameById.has(row.policy_id))
		.map((row) => ({
			userId: row.user_id,
			level: levelByPolicy.get(row.policy_id) ?? 0,
			expiresAt: row.expires_at,
			source: "policy" as const,
			policyName: nameById.get(row.policy_id),
		}))
}

/** `PGRST205`/`42P01`: o banco não tem o modelo de políticas. Ver `@iefa/pbac`. */
function isMissingTable(error: { code?: string }): boolean {
	return error.code === "PGRST205" || error.code === "42P01"
}
