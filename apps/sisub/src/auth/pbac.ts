/**
 * PBAC — Policy-Based Access Control
 *
 * API pública:
 *   hasPermission(permissions, module, minLevel?, scope?) → boolean   (pura, sem React)
 *   userPermissionsQueryOptions(userId)                               (React Query)
 *   requirePermission(context, module, minLevel?, scope?)             (beforeLoad helper)
 *   usePBAC()                                                         (hook para componentes)
 *
 * Uso em rota (beforeLoad):
 *   beforeLoad: ({ context }) => requirePermission(context, "local", 1),
 *
 * Uso em componente:
 *   const { can } = usePBAC()
 *   if (can("local", 2)) { ... }
 */

import type { QueryClient } from "@tanstack/react-query"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import { useAuth } from "@/hooks/auth/useAuth"
import { fetchUserPermissionsFn } from "@/server/permissions.fn"
import type { AppModule, PermissionScope, UserPermission } from "@/types/domain/permissions"

// ---------------------------------------------------------------------------
// Pure utility
// ---------------------------------------------------------------------------

/**
 * Verifica se um conjunto de permissões concede acesso a um módulo.
 *
 * @param permissions - Lista de permissões carregadas para o usuário
 * @param module      - Módulo a verificar (ex: "local", "global")
 * @param minLevel    - Nível mínimo exigido (default: 1)
 * @param scope       - Escopo opcional; sem escopo aceita qualquer permissão do módulo
 */
export function hasPermission(
	permissions: UserPermission[],
	module: AppModule,
	minLevel = 1,
	scope?: PermissionScope
): boolean {
	return permissions.some((p) => {
		if (p.module !== module || p.level < minLevel) return false

		// Permissão global (sem escopo) vale para qualquer contexto
		const isGlobal = p.unit_id === null && p.mess_hall_id === null && p.kitchen_id === null
		if (isGlobal) return true

		if (!scope) return true // sem restrição de escopo na chamada → aceita qualquer escopo

		if (scope.type === "unit" && p.unit_id === scope.id) return true
		if (scope.type === "mess_hall" && p.mess_hall_id === scope.id) return true
		if (scope.type === "kitchen" && p.kitchen_id === scope.id) return true

		return false
	})
}

// ---------------------------------------------------------------------------
// React Query options
// ---------------------------------------------------------------------------

export const userPermissionsQueryOptions = (userId: string) =>
	queryOptions({
		queryKey: ["userPermissions", userId],
		queryFn: () => fetchUserPermissionsFn({ data: { userId } }),
		staleTime: 1000 * 60 * 30, // 30 min — permissões mudam com baixa frequência
		gcTime: 1000 * 60 * 60,
		enabled: !!userId,
	})

// ---------------------------------------------------------------------------
// beforeLoad helper
// ---------------------------------------------------------------------------

type PBACContext = {
	queryClient: QueryClient
	auth: { user: { id: string } | null }
}

/**
 * Usa dentro de `beforeLoad` para proteger uma rota.
 * Redireciona para /hub se o usuário não tiver a permissão necessária.
 *
 * As permissões já estão no cache React Query (carregadas em /_protected).
 *
 * @example
 * beforeLoad: ({ context }) => requirePermission(context, "local"),
 * beforeLoad: ({ context }) => requirePermission(context, "messhall", 2, { type: "mess_hall", id: 3 }),
 */
export function requirePermission(
	context: PBACContext,
	module: AppModule,
	minLevel = 1,
	scope?: PermissionScope
) {
	const userId = context.auth.user?.id
	if (!userId) throw redirect({ to: "/auth", replace: true })

	const permissions =
		context.queryClient.getQueryData<UserPermission[]>(
			userPermissionsQueryOptions(userId).queryKey
		) ?? []

	if (!hasPermission(permissions, module, minLevel, scope)) {
		throw redirect({ to: "/hub", replace: true })
	}
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Hook para verificação de permissões em componentes.
 * Lê do cache React Query (preenchido no beforeLoad de /_protected).
 *
 * @example
 * const { can } = usePBAC()
 * {can("global", 3) && <AdminButton />}
 */
export function usePBAC() {
	const { user } = useAuth()
	const { data: permissions = [], isLoading } = useQuery(
		userPermissionsQueryOptions(user?.id ?? "")
	)

	const can = (module: AppModule, minLevel = 1, scope?: PermissionScope) =>
		hasPermission(permissions, module, minLevel, scope)

	return { permissions, can, isLoading }
}
