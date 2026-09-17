/**
 * @module access.fn
 * Gestão dos acessos ao copiloto: os grants `alpha` e `alpha-admin` em
 * `access_control.user_permissions`.
 *
 * Cada app do ERP administra só os PRÓPRIOS módulos, mesmo com a tabela compartilhada.
 * O módulo pedido pelo cliente é validado contra a lista daqui — sem isso, um
 * administrador do α concederia `global` do sisub pela mesma chamada.
 *
 * Gate: `alpha-admin` nível 3 (`requireAlphaAdmin`). Grants do α são sempre globais.
 */

import { grantUnscopedModulePermission, resolveModulePermissions, searchUsersByEmail, type UserEmailSearchRow, type UserPermission } from "@iefa/pbac"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireAlphaAdmin, requireUserId } from "@/lib/auth.server"
import { getAccessControlClient, getCoreReadClient } from "@/lib/supabase.server"

const ALPHA_MODULES = ["alpha", "alpha-admin"] as const
type AlphaModule = (typeof ALPHA_MODULES)[number]

/**
 * Módulo + nível concedíveis, validados JUNTOS: `alpha` vai de 1 a 3 (requisitante,
 * licitações, ACI) e `alpha-admin` só existe em 3. Aceitar `alpha-admin` 2 gravaria um
 * grant que nenhum guard lê.
 */
const GrantTargetSchema = z.discriminatedUnion("module", [
	z.object({ module: z.literal("alpha"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
	z.object({ module: z.literal("alpha-admin"), level: z.literal(3) }),
])

export type AlphaGrantTarget = z.infer<typeof GrantTargetSchema>

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient, como no @iefa/pbac
type AnySupabaseClient = SupabaseClient<any, any>

/**
 * Permissões do PRÓPRIO usuário nos módulos do α — o `userId` vem da sessão, nunca do
 * cliente. Alimenta a navegação (mostrar "Acessos" só a quem administra).
 */
export const fetchMyAlphaPermissionsFn = createServerFn({ method: "GET" }).handler(async (): Promise<UserPermission[]> => {
	const userId = await requireUserId()
	return resolveModulePermissions(userId, getAccessControlClient(), [...ALPHA_MODULES])
})

/** Busca por e-mail no cadastro do ERP, para conceder acesso. Só administrador. */
export const searchUsersByEmailFn = createServerFn({ method: "GET" })
	.validator(z.object({ email: z.string().min(3) }))
	.handler(async ({ data }): Promise<UserEmailSearchRow[]> => {
		await requireAlphaAdmin()
		return searchUsersByEmail(getCoreReadClient(), data.email)
	})

/** Concede ou ajusta UM grant (idempotente, `expires_at` zerado). Nunca o próprio. */
export const grantAlphaPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.uuid() }).and(GrantTargetSchema))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireAlphaAdmin()
		assertNotSelf(ctx.userId, data.userId)
		return grantUnscopedModulePermission(getAccessControlClient(), { module: data.module, userId: data.userId, level: data.level })
	})

/**
 * Revoga o grant INLINE de um módulo. Nunca o próprio, e sempre com `module`: um
 * `delete` sem ele, numa tabela compartilhada, alcançaria o ERP inteiro.
 */
export const revokeAlphaPermissionFn = createServerFn({ method: "POST" })
	.validator(z.object({ userId: z.uuid(), module: z.enum(ALPHA_MODULES) }))
	.handler(async ({ data }): Promise<{ ok: true }> => {
		const ctx = await requireAlphaAdmin()
		assertNotSelf(ctx.userId, data.userId)
		const { error } = await getAccessControlClient()
			.from("user_permissions")
			.delete()
			.eq("user_id", data.userId)
			.eq("module", data.module)
			.is("unit_id", null)
			.is("kitchen_id", null)
			.is("mess_hall_id", null)
		if (error) throw new Error(error.message)
		return { ok: true }
	})

/**
 * Ninguém altera o próprio acesso. Rebaixar-se ou revogar-se tranca o administrador para
 * fora desta tela — e, se ele for o último, tranca todo mundo, com conserto só por SQL.
 * Contar administradores teria corrida entre a contagem e o delete; a regra é outra
 * pessoa mexer.
 */
function assertNotSelf(actorId: string, targetId: string): void {
	if (actorId === targetId) throw new Error("Você não pode alterar o próprio acesso. Peça a outro administrador.")
}

export type AlphaGrant = {
	userId: string
	module: AlphaModule
	/** E-mail institucional; vazio só quando a conta não tem e-mail no GoTrue. */
	email: string
	level: number
	/** ISO 8601, ou `null` sem prazo. Vencido é ausência de acesso, não deny. */
	expiresAt: string | null
	/**
	 * `policy` é acesso emprestado por política anexada, e NÃO se revoga aqui: apagar a
	 * linha de `user_permissions` não desfaz o anexo, e a chamada responderia sucesso com
	 * o acesso de pé.
	 */
	source: "inline" | "policy"
	policyName?: string
}

/**
 * Todos os grants do α, identificados por e-mail. Só administrador.
 *
 * Lê as DUAS origens que `resolveUserPermissions` lê — grant inline e política anexada.
 * Inclui o grant vencido (a tela o marca), para a linha não sumir sem que ninguém a
 * tenha revogado.
 */
export const listAlphaGrantsFn = createServerFn({ method: "GET" }).handler(async (): Promise<AlphaGrant[]> => {
	await requireAlphaAdmin()
	const accessControl = getAccessControlClient()

	const [inline, byPolicy] = await Promise.all([fetchInlineGrants(accessControl), fetchPolicyGrants(accessControl)])
	const all = [...inline, ...byPolicy]
	if (all.length === 0) return []

	const userIds = [...new Set(all.map((g) => g.userId))]
	const core = getCoreReadClient()
	const { data: users, error } = await core.from("user_data").select("id, email").in("id", userIds)
	if (error) throw new Error(error.message)

	const emailById = new Map(((users ?? []) as Array<{ id: string; email: string | null }>).map((u) => [u.id, u.email ?? ""]))
	const fallback = await fetchEmailsFromAuth(
		core,
		userIds.filter((id) => !emailById.get(id))
	)

	return all
		.map((g) => ({ ...g, email: emailById.get(g.userId) || fallback.get(g.userId) || "" }))
		.sort((a, b) => (a.email || a.userId).localeCompare(b.email || b.userId, "pt-BR") || a.module.localeCompare(b.module))
})

/** Chamadas simultâneas ao GoTrue na busca de e-mail — o suficiente para a lista não esperar em fila, sem abrir uma conexão por pessoa. */
const AUTH_LOOKUP_CONCURRENCY = 5

/**
 * E-mail pela API de administração do GoTrue, para quem ainda não tem linha em
 * `core.user_data` (a linha nasce no login do sisub). Só leitura.
 *
 * Em lotes, e não tudo de uma vez: um `Promise.all` sobre a lista inteira dispara uma
 * requisição por pessoa faltante ao mesmo tempo, e é o GoTrue que paga — justo na tela
 * que se abre depois de conceder acesso a muita gente.
 */
async function fetchEmailsFromAuth(core: AnySupabaseClient, userIds: readonly string[]): Promise<Map<string, string>> {
	const found = new Map<string, string>()

	for (let i = 0; i < userIds.length; i += AUTH_LOOKUP_CONCURRENCY) {
		const batch = userIds.slice(i, i + AUTH_LOOKUP_CONCURRENCY)
		const resolved = await Promise.all(
			batch.map(async (id) => {
				const { data, error } = await core.auth.admin.getUserById(id)
				return [id, error ? "" : (data.user?.email ?? "")] as const
			})
		)
		for (const [id, email] of resolved) if (email !== "") found.set(id, email)
	}

	return found
}

type PartialGrant = Omit<AlphaGrant, "email">

async function fetchInlineGrants(accessControl: AnySupabaseClient): Promise<PartialGrant[]> {
	const { data, error } = await accessControl
		.from("user_permissions")
		.select("module, user_id, level, expires_at")
		.in("module", [...ALPHA_MODULES])
		.is("unit_id", null)
		.is("kitchen_id", null)
		.is("mess_hall_id", null)
	if (error) throw new Error(error.message)
	return ((data ?? []) as Array<{ module: AlphaModule; user_id: string; level: number; expires_at: string | null }>).map((row) => ({
		userId: row.user_id,
		module: row.module,
		level: row.level,
		expiresAt: row.expires_at,
		source: "inline" as const,
	}))
}

async function fetchPolicyGrants(accessControl: AnySupabaseClient): Promise<PartialGrant[]> {
	const { data: statements, error: statementError } = await accessControl
		.from("policy_statement")
		.select("policy_id, module, level")
		.in("module", [...ALPHA_MODULES])
	if (statementError) {
		// Banco sem o modelo de políticas: mesma degradação do `@iefa/pbac`. Aqui só
		// encolhe uma lista de conferência — nunca concede acesso.
		if (statementError.code === "PGRST205" || statementError.code === "42P01") return []
		throw new Error(statementError.message)
	}

	// Maior nível por (política, módulo) — a semântica da resolução.
	const byPolicyModule = new Map<string, { policyId: string; module: AlphaModule; level: number }>()
	for (const row of (statements ?? []) as Array<{ policy_id: string; module: AlphaModule; level: number }>) {
		const key = `${row.policy_id}:${row.module}`
		const current = byPolicyModule.get(key)
		if (!current || row.level > current.level) byPolicyModule.set(key, { policyId: row.policy_id, module: row.module, level: row.level })
	}
	if (byPolicyModule.size === 0) return []

	const ids = [...new Set([...byPolicyModule.values()].map((v) => v.policyId))]
	const [policies, attachments] = await Promise.all([
		accessControl.from("policy").select("id, name").in("id", ids).is("deleted_at", null),
		accessControl.from("user_policy_attachment").select("user_id, policy_id, expires_at").in("policy_id", ids),
	])
	if (policies.error) throw new Error(policies.error.message)
	if (attachments.error) throw new Error(attachments.error.message)

	const nameById = new Map(((policies.data ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]))
	return ((attachments.data ?? []) as Array<{ user_id: string; policy_id: string; expires_at: string | null }>)
		.filter((row) => nameById.has(row.policy_id))
		.flatMap((row) =>
			[...byPolicyModule.values()]
				.filter((statement) => statement.policyId === row.policy_id)
				.map((statement) => ({
					userId: row.user_id,
					module: statement.module,
					level: statement.level,
					expiresAt: row.expires_at,
					source: "policy" as const,
					policyName: nameById.get(row.policy_id),
				}))
		)
}
