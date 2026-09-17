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

/**
 * Concede/atualiza o grant GLOBAL (unscoped) de `module` para um usuário (idempotente).
 * A validação do nível permitido (2|3 no rumaer, 1–3 no sucont) fica no validator do app.
 *
 * Padrão update-first → insert → retry-em-23505 para ser seguro sob concorrência.
 * O select-then-insert simples tem corrida (dois admins simultâneos podem ambos ver
 * "não existe" e inserir). A garantia dura fica no DB; a corrida perde com 23505 e
 * reaplica como update.
 *
 * Quem produz esse 23505 são `user_permissions_allow_uniq` (`level > 0`) e
 * `user_permissions_deny_uniq` (`level <= 0`) — únicos sobre
 * (user_id, module, mess_hall_id, kitchen_id, unit_id) com `nulls not distinct`
 * (migração 20260917185655). Valem para QUALQUER módulo e QUALQUER escopo, e
 * substituíram os dois parciais que cobriam só `rumaer` e o `sucont` legado — enquanto a
 * garantia era por módulo, `sucont-1/3/4`, os módulos do sisub e os do Projeto α gravavam
 * duas linhas na corrida, e revogar uma deixava a outra concedendo. São DOIS índices
 * porque allow e deny coexistem na mesma chave de propósito: é o deny sobre allow, que
 * `resolveEffectivePermissions` aplica por precedência.
 *
 * Por isso o update casa SÓ `level > 0`: ele atualiza o allow, nunca o deny. Sem esse
 * filtro, conceder a quem tem um deny na chave (e nenhum allow) casaria a linha do DENY e
 * sobrescreveria `level`/`expires_at` nela — a negação sumiria em silêncio, com `ok` de
 * volta, e ninguém saberia que uma decisão explícita foi apagada por um clique de
 * concessão. Não casando allow nenhum, o passo 2 INSERE — e o insert convive com o deny,
 * porque os dois índices são parciais.
 *
 * Consequência a conhecer: com um deny vigente na mesma chave, o grant fica gravado, mas
 * o deny continua vencendo até ser revogado — a resolução aplica a precedência. É o
 * comportamento desejado: destruir a negação seria pior, e o deny é visível e removível
 * na tela de acessos.
 */
export async function grantUnscopedModulePermission(
	accessControlClient: AnySupabaseClient,
	params: { module: AppModule; userId: string; level: number }
): Promise<{ ok: true }> {
	// `expires_at: null` junto do nível: conceder é conceder ACESSO VIVO. Sem isso, reaplicar
	// um grant sobre uma linha com prazo vencido atualizaria o nível, devolveria `ok` — e o
	// usuário continuaria sem acesso nenhum, porque a resolução ignora a linha expirada.
	const applyUpdate = () =>
		accessControlClient
			.from("user_permissions")
			.update({ level: params.level, expires_at: null })
			.eq("user_id", params.userId)
			.eq("module", params.module)
			.is("mess_hall_id", null)
			.is("kitchen_id", null)
			.is("unit_id", null)
			// Só o ALLOW: o deny da mesma chave é outra decisão, e não é esta função que a revoga.
			.gt("level", 0)
			.select("id")

	// 1. atualiza o ALLOW existente, se houver
	const { data: updated, error: updErr } = await applyUpdate()
	if (updErr) throw new Error(updErr.message)
	if (updated && updated.length > 0) return { ok: true }

	// 2. não havia allow → insere (o índice de allow impede a duplicata de fato; um deny
	//    na mesma chave não atrapalha, porque os índices são parciais e ele fica de pé)
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
