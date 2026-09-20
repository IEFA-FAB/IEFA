import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveEffectivePermissions } from "./effective-permissions.ts"
import type { UserPermission } from "./types.ts"

/**
 * Filtro PostgREST das concessões ainda válidas.
 *
 * `expires_at is null` = concessão permanente (o default e o valor de tudo que existia antes
 * da coluna). `expires_at > 'now'` usa o valor de entrada especial do Postgres, resolvido
 * pelo BANCO para o instante da transação: a comparação nunca depende do relógio do processo,
 * que não é fonte da verdade para autorização, e a linha vencida sequer trafega.
 *
 * Linha vencida é AUSENTE, não deny: um `level 0` expirado deixa de negar pelo mesmo caminho
 * por que um allow expirado deixa de conceder. Filtrar na origem é o que garante isso — se a
 * linha chegasse ao resolver, ela entraria na fase de coleta de denies.
 */
const ACTIVE_GRANT_FILTER = "expires_at.is.null,expires_at.gt.now"

/**
 * Busca e resolve as permissões efetivas de um usuário diretamente no banco.
 * Sem dependência de TanStack — usável em qualquer runtime Bun/Node.
 *
 * Aceita qualquer cliente Supabase (qualquer schema/db) para máxima compatibilidade.
 * Aplica as mesmas regras do sisub, pela resolução compartilhada:
 *   1. Implicit Allow: injeta "diner" level 1 se nenhuma regra explícita existir.
 *   2. Precedência de deny: um level=0 anula os allows que ele cobre, em vez de ser
 *      apenas descartado — ver `effective-permissions.ts`.
 *   3. Prazo: linha com `expires_at` no passado não é lida — ver `ACTIVE_GRANT_FILTER`.
 *
 * @param userId   - UUID do usuário autenticado
 * @param supabase - Cliente Supabase com service role (bypass RLS)
 */
// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
export async function resolveUserPermissions(userId: string, supabase: SupabaseClient<any, any>): Promise<UserPermission[]> {
	const { data: rows, error } = await supabase
		.from("user_permissions")
		.select("module, level, mess_hall_id, kitchen_id, unit_id")
		.eq("user_id", userId)
		.or(ACTIVE_GRANT_FILTER)

	if (error) throw new Error(`Falha ao buscar permissões: ${error.message}`)

	// Resolução compartilhada com o sisub (comensal implícito + precedência de deny).
	// Sem políticas anexadas — o caso de rumaer e sucont — o resultado é o mesmo de antes,
	// exceto quando allow e deny coexistem para um módulo: aí o deny passa a vencer.
	return resolveEffectivePermissions((rows ?? []) as UserPermission[])
}
