/**
 * PBAC do rumaer — leitura das permissões do próprio usuário para guards de rota
 * e renderização condicional. Wrapper fino: a engine `hasPermission` e a config
 * das query options (`myModulePermissionsQueryConfig`) vêm de @iefa/pbac; aqui só
 * amarramos `module = "rumaer"` ao React Query do app. O servidor resolve as
 * permissões pela sessão.
 */

import { hasPermission, myModulePermissionsQueryConfig } from "@iefa/pbac"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchMyRumaerPermissionsFn } from "@/server/permissions.fn"

export { hasPermission }

export const myRumaerPermissionsQueryOptions = () => queryOptions(myModulePermissionsQueryConfig("rumaer", () => fetchMyRumaerPermissionsFn()))

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
