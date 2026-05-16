import type { SupabaseClient } from "@supabase/supabase-js"
import type { UserPermission } from "./types.ts"

/**
 * Busca e resolve as permissões efetivas de um usuário diretamente no banco.
 * Sem dependência de TanStack — usável em qualquer runtime Bun/Node.
 *
 * Aceita qualquer cliente Supabase (qualquer schema/db) para máxima compatibilidade.
 * Aplica as mesmas regras do fetchUserPermissionsFn do sisub:
 *   1. Implicit Allow: injeta "diner" level 1 se nenhuma regra explícita existir.
 *   2. Deny Strip: remove entradas level=0 antes de retornar.
 *
 * @param userId   - UUID do usuário autenticado
 * @param supabase - Cliente Supabase com service role (bypass RLS)
 */
// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
export async function resolveUserPermissions(userId: string, supabase: SupabaseClient<any, any>): Promise<UserPermission[]> {
	const { data: rows, error } = await supabase.from("user_permissions").select("module, level, mess_hall_id, kitchen_id, unit_id").eq("user_id", userId)

	if (error) throw new Error(`Falha ao buscar permissões: ${error.message}`)

	const permissions: UserPermission[] = (rows ?? []) as UserPermission[]

	// Implicit Allow: todo usuário válido é comensal
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

	// Deny Strip: level 0 = deny explícito — remove para simplificar checks downstream
	return permissions.filter((p) => p.level > 0)
}
