/**
 * Helpers compartilhados de LEITURA de acesso por módulo (rumaer, sucont, contrate, …).
 *
 * Cada app do ERP gerencia apenas os grants do PRÓPRIO módulo, mesmo compartilhando
 * a tabela `access_control.user_permissions`. Estes helpers concentram a lógica
 * idêntica entre os apps; cada app fornece os clientes Supabase e mantém os
 * próprios gates de admin e schemas de validação (níveis permitidos etc.).
 *
 * ESCRITA não mora aqui. Conceder e revogar passam por `changeModulePermission`
 * (`permission-change.ts`), que grava o grant e o log de auditoria numa transação. Os
 * antigos `grantModulePermission`/`grantUnscopedModulePermission`/`revokeModulePermission`
 * escreviam direto na tabela, sem ator nem log, e saíram quando a escrita sem auditoria
 * passou a ser recusada pelo banco (20260921130100).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveUserPermissions } from "./resolve-permissions.ts"
import type { AppModule, UserPermission } from "./types.ts"

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
type AnySupabaseClient = SupabaseClient<any, any>

/**
 * Permissões efetivas do usuário FILTRADAS pelos módulos do app (deny removido,
 * "diner" implícito injetado pela resolução). A tabela é compartilhada: devolver
 * grants de outros apps (global, kitchen, …) para o browser vazaria autorização
 * cross-app sem uso local.
 *
 * Aceita mais de um módulo porque um app pode ter vários: o sucont tem quatro
 * (`sucont-1`, `sucont-3`, `sucont-4`, `sucont-admin`) e precisa dos quatro num
 * fetch só — uma query por módulo pagaria a resolução inteira quatro vezes por
 * carga de página, e o guard da raiz precisa de todos para decidir.
 *
 * Os DENY dos módulos pedidos vêm junto: `hasPermission` os aplica, e filtrá-los
 * aqui devolveria ao cliente um conjunto que reautoriza o que foi negado.
 */
export async function resolveModulePermissions(
	userId: string,
	accessControlClient: AnySupabaseClient,
	modules: AppModule | readonly AppModule[]
): Promise<UserPermission[]> {
	const wanted = new Set<AppModule>(typeof modules === "string" ? [modules] : modules)
	const all = await resolveUserPermissions(userId, accessControlClient)
	return all.filter((p) => wanted.has(p.module))
}

/**
 * Config compartilhada das query options de leitura de acesso por módulo
 * (React Query). Pura de propósito: o layout isolado do bun impede o pbac de
 * depender de @tanstack/react-query sem contaminar consumidores puros (api,
 * sisub-mcp), então cada app embrulha este objeto com o PRÓPRIO
 * `queryOptions()`/`useQuery` no wrapper fino (auth/pbac.ts).
 */
export function myModulePermissionsQueryConfig(module: AppModule | readonly AppModule[], fetchMyPermissions: () => Promise<UserPermission[]>) {
	// Chave estável: um app de vários módulos tem UM cache de permissões, e a ordem
	// em que o chamador lista os módulos não pode criar um segundo.
	const key = typeof module === "string" ? module : [...module].sort().join("+")
	return {
		queryKey: [key, "myPermissions"] as const,
		queryFn: fetchMyPermissions,
		staleTime: 1000 * 60 * 30, // 30 min — permissões mudam com baixa frequência
		gcTime: 1000 * 60 * 60,
	}
}

export type UserEmailSearchRow = { id: string; email: string; nrOrdem: string | null }

/**
 * Busca usuários por e-mail em `core.user_data` (para conceder acesso).
 * Escapa metacaracteres do LIKE (\ % _) p/ tratar o termo como literal.
 * Apps que não usam `nrOrdem` podem simplesmente descartar o campo no wrapper.
 */
export async function searchUsersByEmail(coreReadClient: AnySupabaseClient, email: string): Promise<UserEmailSearchRow[]> {
	const term = email.replace(/[\\%_]/g, "\\$&")
	const { data: rows, error } = await coreReadClient
		.from("user_data")
		.select("id, email, nrOrdem")
		.ilike("email", `%${term}%`)
		.order("email", { ascending: true })
		.limit(10)
	if (error) throw new Error(error.message)
	return ((rows ?? []) as Array<{ id: string; email: string | null; nrOrdem: string | null }>).map((r) => ({
		id: r.id,
		email: r.email ?? "",
		nrOrdem: r.nrOrdem ?? null,
	}))
}
