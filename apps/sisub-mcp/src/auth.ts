/**
 * Auth module: valida JWT Supabase e carrega permissões PBAC do usuário.
 *
 * Flow por chamada de tool:
 *   JWT (header ou env var)
 *     → getAuthClient().auth.getUser(jwt)   — valida token com anon key
 *     → SELECT user_permissions WHERE user_id = ?   — carrega PBAC
 *     → UserContext { userId, permissions }
 */

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"
import { getAuthClient, getDataClient } from "./supabase.ts"
import type { UserContext, UserPermission } from "./types.ts"

/**
 * Valida o JWT do usuário e carrega suas permissões PBAC.
 * Lança McpError se o token for inválido ou expirado.
 */
export async function resolveUserContext(jwt: string): Promise<UserContext> {
	if (!jwt) {
		throw new McpError(ErrorCode.InvalidRequest, "JWT não fornecido. Passe Authorization: Bearer <token>")
	}

	// 1. Validar JWT via anon client (getUser() verifica assinatura e expiração)
	const authClient = getAuthClient()
	const {
		data: { user },
		error: authError,
	} = await authClient.auth.getUser(jwt)

	if (authError || !user) {
		throw new McpError(ErrorCode.InvalidRequest, "Token JWT inválido ou expirado")
	}

	// 2. Carregar permissões PBAC via service role client
	const db = getDataClient()
	// biome-ignore lint/suspicious/noExplicitAny: user_permissions não está nos tipos gerados do Supabase ainda
	const { data: rows, error: permError } = await (db as any)
		.from("user_permissions")
		.select("module, level, mess_hall_id, kitchen_id, unit_id")
		.eq("user_id", user.id)

	if (permError) {
		// M3: não expor detalhes do banco ao cliente — logar internamente
		process.stderr.write(`[sisub-mcp] Erro ao carregar permissões para user ${user.id}: ${permError.message}\n`)
		throw new McpError(ErrorCode.InternalError, "Erro interno ao carregar permissões. Tente novamente.")
	}

	const permissions: UserPermission[] = (rows ?? []) as UserPermission[]

	// Implicit Allow: todo usuário autenticado é comensal (módulo "diner"),
	// a menos que haja deny explícito (level 0) já registrado.
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

	return {
		userId: user.id,
		// Nível 0 = deny explícito — remove da lista para simplificar hasPermission()
		permissions: permissions.filter((p) => p.level > 0),
	}
}
