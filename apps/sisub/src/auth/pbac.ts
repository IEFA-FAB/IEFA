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

import { hasPermission } from "@iefa/pbac"
import type { QueryClient } from "@tanstack/react-query"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import { useAuth } from "@/hooks/auth/useAuth"
import { fetchUserPermissionsFn } from "@/server/permissions.fn"
import type { AppModule, PermissionScope, UserPermission } from "@/types/domain/permissions"

// hasPermission re-exportado de @iefa/pbac para uso interno e externo
export { hasPermission }

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
export function requirePermission(context: PBACContext, module: AppModule, minLevel = 1, scope?: PermissionScope) {
	const userId = context.auth.user?.id
	if (!userId) throw redirect({ to: "/auth", replace: true })

	const permissions = context.queryClient.getQueryData<UserPermission[]>(userPermissionsQueryOptions(userId).queryKey) ?? []

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
	const { data: permissions = [], isLoading } = useQuery(userPermissionsQueryOptions(user?.id ?? ""))

	const can = (module: AppModule, minLevel = 1, scope?: PermissionScope) => hasPermission(permissions, module, minLevel, scope)

	return { permissions, can, isLoading }
}
