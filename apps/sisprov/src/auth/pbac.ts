/**
 * PBAC do SISPROV no cliente: leitura das permissões do próprio usuário para guards de rota e
 * renderização condicional. Wrapper fino: a engine (`hasPermission`, `hasAnyPermission`) e a
 * config das query options (`myModulePermissionsQueryConfig`) vêm de @iefa/pbac; aqui só
 * amarramos os três módulos do app (`storage`, `sisprov-planning`, `sisprov-admin`) ao React Query. O servidor resolve as permissões pela sessão.
 */

import type { AppModule, UserPermission } from "@iefa/pbac"
import { hasAnyPermission, hasPermission, myModulePermissionsQueryConfig } from "@iefa/pbac"
import { SISPROV_ADMIN_MODULE, SISPROV_GRANT_ADMIN_LEVEL, SISPROV_MODULES, SISPROV_PLANNING_MODULE, SISPROV_STOCK_MODULE } from "@iefa/sisprov-domain/modules"
import type { QueryClient } from "@tanstack/react-query"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import { fetchMySisprovPermissionsFn } from "@/server/permissions.fn"

export { hasAnyPermission, hasPermission }

export const mySisprovPermissionsQueryOptions = () => queryOptions(myModulePermissionsQueryConfig(SISPROV_MODULES, () => fetchMySisprovPermissionsFn()))

/**
 * Hook para renderização condicional. A tela nunca oferece o que a política nega: cada botão
 * de escrita se pinta pela MESMA regra que o servidor aplica.
 */
export function useSisprovAccess() {
	const { data: permissions = [], isLoading, isError } = useQuery(mySisprovPermissionsQueryOptions())
	return {
		permissions,
		isLoading,
		/** A leitura das permissões falhou: a tela diz isso, em vez de mostrar "sem acesso". */
		isError,
		canPlan: hasPermission(permissions, SISPROV_PLANNING_MODULE, 1),
		canPlanWrite: hasPermission(permissions, SISPROV_PLANNING_MODULE, 2),
		canStock: hasPermission(permissions, SISPROV_STOCK_MODULE, 1),
		canStockWrite: hasPermission(permissions, SISPROV_STOCK_MODULE, 2),
		/** Gestão sistêmica da SDAB. */
		canAdmin: hasPermission(permissions, SISPROV_ADMIN_MODULE, 2),
		/** Pode gerenciar os acessos do SISPROV. */
		canManage: hasPermission(permissions, SISPROV_ADMIN_MODULE, SISPROV_GRANT_ADMIN_LEVEL),
		/** Tem acesso ao app por algum módulo. */
		canUseApp: hasAnyPermission(permissions, SISPROV_MODULES, 1),
	}
}

// ---------------------------------------------------------------------------
// Guards de rota
// ---------------------------------------------------------------------------

type PBACContext = { queryClient: QueryClient }

/**
 * `preload` é `true` quando o `beforeLoad` roda por intenção (hover), não por navegação: ali
 * NÃO se lança redirect. Além de inútil, o router-core quebra ao processar um redirect lançado
 * em preload, a mesma armadilha documentada nos guards do sisub e do sucont.
 */
type GuardOptions = { context: PBACContext; preload?: boolean }

/** Permissões do cache, já aquecidas pelo `beforeLoad` de `_protected`. */
function cachedPermissions(context: PBACContext): UserPermission[] {
	return context.queryClient.getQueryData<UserPermission[]>(mySisprovPermissionsQueryOptions().queryKey) ?? []
}

/**
 * Exige um dos `modules` no nível mínimo; senão devolve ao hub com o motivo (`denied`), para a
 * tela explicar a negativa em vez de um redirecionamento mudo.
 */
export function requireModules({ context, preload }: GuardOptions, modules: readonly AppModule[], minLevel = 1) {
	const permissions = cachedPermissions(context)
	if (hasAnyPermission(permissions, modules, minLevel)) return
	if (preload) return
	throw redirect({ to: "/hub", replace: true, search: { denied: modules.join("+") } })
}
