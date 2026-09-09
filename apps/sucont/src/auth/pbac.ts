/**
 * PBAC do sucont — leitura das permissões do próprio usuário para guards de rota
 * e renderização condicional. Wrapper fino: a engine `hasPermission` e a config
 * das query options (`myModulePermissionsQueryConfig`) vêm de @iefa/pbac; aqui só
 * amarramos `module = "sucont"` ao React Query do app. O servidor resolve as
 * permissões pela sessão.
 */

import { hasPermission, myModulePermissionsQueryConfig } from "@iefa/pbac"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { fetchMySucontPermissionsFn, listSucontGrantsFn } from "#/server/permissions.fn"

export { hasPermission }

export const mySucontPermissionsQueryOptions = () => queryOptions(myModulePermissionsQueryConfig("sucont", () => fetchMySucontPermissionsFn()))

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

/**
 * Grants `sucont` de TODOS os usuários, com e-mail — a lista de conferência da
 * tela de permissões.
 *
 * Mora aqui, e não em `lib/queries`, pela mesma razão que as options de auth e
 * PBAC já moram: é leitura do domínio de acesso, e manter o grafo do módulo de
 * permissões separado do grafo das telas de dado é o que permite o harness
 * visual montar a tela com um stub só.
 *
 * Só resolve para administrador (nível 3) — a fn responde 403 aos demais, e é
 * por isso que a rota `/admin` barra antes de chegar aqui.
 */
export const sucontGrantsQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "grants"] as const,
		queryFn: () => listSucontGrantsFn(),
	})
