/**
 * Helpers compartilhados de autogestão de acesso por módulo (rumaer, sucont, …).
 *
 * Cada app do ERP gerencia apenas os grants do PRÓPRIO módulo, mesmo compartilhando
 * a tabela `access_control.user_permissions`. Estes helpers concentram a lógica
 * idêntica entre os apps; cada app fornece os clientes Supabase e mantém os
 * próprios gates de admin e schemas de validação (níveis permitidos etc.).
 *
 * O sisub NÃO usa estes helpers: a administração de permissões dele vive em
 * @iefa/sisub-domain (grants com escopo, módulos múltiplos, DomainError próprio).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveUserPermissions } from "./resolve-permissions.ts"
import type { AppModule, UserPermission } from "./types.ts"

// biome-ignore lint/suspicious/noExplicitAny: aceita qualquer schema de SupabaseClient
type AnySupabaseClient = SupabaseClient<any, any>

/**
 * Permissões efetivas do usuário FILTRADAS pelo módulo do app (deny removido,
 * "diner" implícito injetado pela resolução). A tabela é compartilhada: devolver
 * grants de outros apps (global, kitchen, …) para o browser vazaria autorização
 * cross-app sem uso local.
 */
export async function resolveModulePermissions(userId: string, accessControlClient: AnySupabaseClient, module: AppModule): Promise<UserPermission[]> {
	const all = await resolveUserPermissions(userId, accessControlClient)
	return all.filter((p) => p.module === module)
}

/**
 * Config compartilhada das query options de leitura de acesso por módulo
 * (React Query). Pura de propósito: o layout isolado do bun impede o pbac de
 * depender de @tanstack/react-query sem contaminar consumidores puros (api,
 * sisub-mcp), então cada app embrulha este objeto com o PRÓPRIO
 * `queryOptions()`/`useQuery` no wrapper fino (auth/pbac.ts).
 */
export function myModulePermissionsQueryConfig(module: AppModule, fetchMyPermissions: () => Promise<UserPermission[]>) {
	return {
		queryKey: [module, "myPermissions"] as const,
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

/**
 * Concede/atualiza o grant GLOBAL (unscoped) de `module` para um usuário (idempotente).
 * A validação do nível permitido (2|3 no rumaer, 1–3 no sucont) fica no validator do app.
 *
 * Padrão update-first → insert → retry-em-23505 para ser seguro sob concorrência.
 * O select-then-insert simples tem corrida (dois admins simultâneos podem ambos ver
 * "não existe" e inserir). Não usamos upsert(onConflict) porque o PostgREST não infere
 * índice ÚNICO PARCIAL (o grant unscoped é garantido por índice parcial no DB). A
 * garantia dura fica no DB (índice único); a corrida perde com 23505 e reaplica como update.
 */
export async function grantUnscopedModulePermission(
	accessControlClient: AnySupabaseClient,
	params: { module: AppModule; userId: string; level: number }
): Promise<{ ok: true }> {
	const applyUpdate = () =>
		accessControlClient
			.from("user_permissions")
			.update({ level: params.level })
			.eq("user_id", params.userId)
			.eq("module", params.module)
			.is("mess_hall_id", null)
			.is("kitchen_id", null)
			.is("unit_id", null)
			.select("id")

	// 1. atualiza o grant existente, se houver
	const { data: updated, error: updErr } = await applyUpdate()
	if (updErr) throw new Error(updErr.message)
	if (updated && updated.length > 0) return { ok: true }

	// 2. não existia → insere (índice único parcial impede duplicata de fato)
	const { error: insErr } = await accessControlClient
		.from("user_permissions")
		.insert({ user_id: params.userId, module: params.module, level: params.level, mess_hall_id: null, kitchen_id: null, unit_id: null })
	if (!insErr) return { ok: true }

	// 3. corrida: outro request inseriu primeiro (unique_violation) → reaplica como update
	if (insErr.code === "23505") {
		const { error: retryErr } = await applyUpdate()
		if (retryErr) throw new Error(retryErr.message)
		return { ok: true }
	}
	throw new Error(insErr.message)
}
