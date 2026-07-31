import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveEffectivePermissions } from "./effective-permissions.ts"
import type { UserPermission } from "./types.ts"

/**
 * Busca e resolve as permissões efetivas de um usuário diretamente no banco.
 * Sem dependência de TanStack — usável em qualquer runtime Bun/Node.
 *
 * Aceita qualquer cliente Supabase (qualquer schema/db) para máxima compatibilidade.
 * Aplica as mesmas regras do sisub, pela resolução compartilhada:
 *   1. Implicit Allow: injeta "diner" level 1 se nenhuma regra explícita existir.
 *   2. Precedência de deny: um level=0 anula os allows que ele cobre, em vez de ser
 *      apenas descartado — ver `effective-permissions.ts`.
 *
 * @param userId   - UUID do usuário autenticado
 * @param supabase - Cliente Supabase com service role (bypass RLS)
 */
// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
export async function resolveUserPermissions(userId: string, supabase: SupabaseClient<any, any>): Promise<UserPermission[]> {
	const { data: rows, error } = await supabase.from("user_permissions").select("module, level, mess_hall_id, kitchen_id, unit_id").eq("user_id", userId)

	if (error) throw new Error(`Falha ao buscar permissões: ${error.message}`)

	// Resolução compartilhada com o sisub (comensal implícito + precedência de deny).
	// Sem políticas anexadas — o caso de rumaer e sucont — o resultado é o mesmo de antes,
	// exceto quando allow e deny coexistem para um módulo: aí o deny passa a vencer.
	return resolveEffectivePermissions((rows ?? []) as UserPermission[])
}
