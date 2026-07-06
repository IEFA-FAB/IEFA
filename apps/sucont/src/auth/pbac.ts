/**
 * PBAC do sucont — leitura das permissões do próprio usuário para guards de rota
 * e renderização condicional. A engine `hasPermission` vem de @iefa/pbac
 * (compartilhada com sisub/rumaer). O servidor resolve as permissões pela sessão.
 */

import { hasPermission } from "@iefa/pbac"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchMySucontPermissionsFn } from "#/server/permissions.fn"

export { hasPermission }

export const mySucontPermissionsQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "myPermissions"],
		queryFn: () => fetchMySucontPermissionsFn(),
		staleTime: 1000 * 60 * 30, // 30 min — permissões mudam com baixa frequência
		gcTime: 1000 * 60 * 60,
	})

/**
 * Hook para renderização condicional.
 * - canAccess: pode acessar o hub (nível 1)
 * - canEdit:   pode editar dados da seção (nível 2)
 * - canManage: pode gerenciar grants do sucont (nível 3)
 */
export function useSucontAccess() {
	const { data: permissions = [], isLoading } = useQuery(mySucontPermissionsQueryOptions())
	return {
		permissions,
		isLoading,
		canAccess: hasPermission(permissions, "sucont", 1),
		canEdit: hasPermission(permissions, "sucont", 2),
		canManage: hasPermission(permissions, "sucont", 3),
	}
}
