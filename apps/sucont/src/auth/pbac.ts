/**
 * PBAC do sucont — leitura das permissões do próprio usuário para guards de rota
 * e renderização condicional. Wrapper fino: a engine (`hasPermission`,
 * `hasAnyPermission`) e a config das query options (`myModulePermissionsQueryConfig`)
 * vêm de @iefa/pbac; aqui só amarramos os QUATRO módulos do app ao React Query.
 * O servidor resolve as permissões pela sessão.
 *
 * Os módulos são `sucont-1`, `sucont-3`, `sucont-4` (as divisões) e `sucont-admin`
 * (governança dos acessos) — ver `lib/modules.ts`. O guard de rota é o análogo do
 * `requirePermission` do sisub, com o mesmo tratamento de `preload`.
 */

import type { AppModule, UserPermission } from "@iefa/pbac"
import { hasAnyPermission, hasPermission, myModulePermissionsQueryConfig } from "@iefa/pbac"
import type { QueryClient } from "@tanstack/react-query"
import { queryOptions, useQuery } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import { defaultDivisionFor, permissionModulesForPath } from "#/lib/modules"
import { canAccessHub, permissionModuleForDivision, SUCONT_DIVISION_MODULES, SUCONT_PERMISSION_MODULES } from "#/lib/permission-modules"
import type { SucontDivision } from "#/lib/types"
import { fetchMySucontPermissionsFn, listSucontGrantsFn } from "#/server/permissions.fn"

export { hasAnyPermission, hasPermission }

export const mySucontPermissionsQueryOptions = () => queryOptions(myModulePermissionsQueryConfig(SUCONT_PERMISSION_MODULES, () => fetchMySucontPermissionsFn()))

/**
 * Hook para renderização condicional.
 *
 * `canAccess`/`canEdit` valem para a divisão ATIVA (a que a URL diz, ou a primeira
 * acessível). Um botão de editar que se pinta por "tem nível 2 em alguma divisão"
 * prometeria uma escrita que o servidor recusa na divisão aberta.
 */
export function useSucontAccess(division?: SucontDivision) {
	const { data: permissions = [], isLoading } = useQuery(mySucontPermissionsQueryOptions())
	const active = division ?? defaultDivisionFor(permissions)
	const module = permissionModuleForDivision(active)
	return {
		permissions,
		isLoading,
		/** Divisão a que `canAccess`/`canEdit` se referem. */
		division: active,
		canAccess: hasPermission(permissions, module, 1),
		canEdit: hasPermission(permissions, module, 2),
		/** Editor em QUALQUER divisão — para as telas da seção (área de trabalho, relatórios). */
		canEditAny: hasAnyPermission(permissions, SUCONT_DIVISION_MODULES, 2),
		/** Pode gerenciar os acessos do SUCONT. */
		canManage: hasPermission(permissions, "sucont-admin", 3),
		/** Pode entrar no hub — tem ao menos uma divisão. */
		canAccessHub: canAccessHub(permissions),
	}
}

// ---------------------------------------------------------------------------
// Guards de rota
// ---------------------------------------------------------------------------

type PBACContext = { queryClient: QueryClient }

/**
 * Subconjunto das opções de `beforeLoad` que os guards precisam.
 *
 * `preload` é `true` quando o `beforeLoad` roda por intenção (hover), não por
 * navegação: ali NÃO se lança redirect. Além de inútil (nada renderiza), o
 * router-core quebra ao processar um redirect lançado em preload — é a mesma
 * armadilha documentada no guard do sisub.
 */
type GuardOptions = { context: PBACContext; preload?: boolean }

/**
 * Permissões do cache, já aquecidas pelo `beforeLoad` da raiz.
 *
 * Lê o cache em vez de buscar: a raiz já resolveu, e um `query()` aqui em cada
 * rota filha somaria um round-trip ao TTFB de toda navegação protegida.
 */
function cachedPermissions(context: PBACContext): UserPermission[] {
	return context.queryClient.getQueryData<UserPermission[]>(mySucontPermissionsQueryOptions().queryKey) ?? []
}

/**
 * Exige um dos `modules` no nível mínimo, senão devolve o usuário para uma tela
 * que ele PODE abrir.
 *
 * O destino não é sempre o hub: quem só tem `sucont-admin` não abre o catálogo, e
 * mandá-lo para `/` seria um bounce entre dois guards. Vai para `/admin`, e só de
 * lá para `/auth` quando não há nada acessível.
 *
 * O `denied` chega à tela de destino para explicar a negativa, no lugar do
 * redirecionamento mudo.
 */
export function requireModules({ context, preload }: GuardOptions, modules: readonly AppModule[], minLevel = 1) {
	const permissions = cachedPermissions(context)
	if (hasAnyPermission(permissions, modules, minLevel)) return
	if (preload) return

	if (canAccessHub(permissions)) {
		throw redirect({ to: "/", replace: true, search: { denied: modules.join("+"), divisao: defaultDivisionFor(permissions) } })
	}
	if (hasPermission(permissions, "sucont-admin", 3)) throw redirect({ to: "/admin", replace: true })
	// auth-redirect-without-return-path: sem acesso nenhum, guardar o caminho só
	// devolveria o usuário ao mesmo redirecionamento depois do login.
	throw redirect({ to: "/auth", search: { denied: "1" } })
}

/**
 * Guard de uma rota de FERRAMENTA — a divisão exigida sai do catálogo
 * (`sucontTools`), pelo `internalPath`.
 *
 * Escrever a divisão de novo aqui criaria uma segunda lista, livre para divergir
 * da primeira: a ferramenta sumiria do catálogo de uma divisão e continuaria
 * alcançável digitando a URL.
 *
 * @example
 * beforeLoad: (opts) => requireToolAccess(opts, "/auditor"),
 */
export function requireToolAccess(opts: GuardOptions, pathname: string, minLevel = 1) {
	requireModules(opts, permissionModulesForPath(pathname), minLevel)
}

/** Guard das telas da seção (catálogo, área de trabalho, relatórios): basta uma divisão. */
export function requireAnyDivision(opts: GuardOptions, minLevel = 1) {
	requireModules(opts, SUCONT_DIVISION_MODULES, minLevel)
}

/**
 * Grants dos módulos do sucont de TODOS os usuários, com e-mail — a lista de
 * conferência da tela de permissões.
 *
 * Mora aqui, e não em `lib/queries`, pela mesma razão que as options de auth e
 * PBAC já moram: é leitura do domínio de acesso, e manter o grafo do módulo de
 * permissões separado do grafo das telas de dado é o que permite o harness
 * visual montar a tela com um stub só.
 *
 * Só resolve para administrador (`sucont-admin` nível 3) — a fn responde 403 aos
 * demais, e é por isso que a rota `/admin` barra antes de chegar aqui.
 */
export const sucontGrantsQueryOptions = () =>
	queryOptions({
		queryKey: ["sucont", "grants"] as const,
		queryFn: () => listSucontGrantsFn(),
	})
