/**
 * PBAC do rumaer — leitura das permissões do próprio usuário para guards de rota
 * e renderização condicional. A engine `hasPermission` vem de @iefa/pbac
 * (compartilhada com o sisub). O servidor resolve as permissões pela sessão.
 */

import { hasPermission } from "@iefa/pbac"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchMyRumaerPermissionsFn } from "@/server/permissions.fn"

export { hasPermission }

export const myRumaerPermissionsQueryOptions = () =>
	queryOptions({
		queryKey: ["rumaer", "myPermissions"],
		queryFn: () => fetchMyRumaerPermissionsFn(),
		staleTime: 1000 * 60 * 30, // 30 min — permissões mudam com baixa frequência
		gcTime: 1000 * 60 * 60,
	})

/**
 * Hook para renderização condicional no admin.
 * - canEdit:   pode editar uniformes (nível 2)
 * - canManage: pode gerenciar grants do rumaer (nível 3)
 */
export function useRumaerAccess() {
	const { data: permissions = [], isLoading } = useQuery(myRumaerPermissionsQueryOptions())
	return {
		permissions,
		isLoading,
		canEdit: hasPermission(permissions, "rumaer", 2),
		canManage: hasPermission(permissions, "rumaer", 3),
	}
}
