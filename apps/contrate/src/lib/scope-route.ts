/**
 * Os dois guards das rotas com OM na URL: o HUB do módulo (`/aci/`) e o ESCOPO (`/aci/$unitId`).
 *
 * Os dois leem o perfil do α (`/me/access`) — por isso as rotas que os usam são `ssr: false`:
 * a chamada ao α sai do navegador, com o token da sessão, como todas as outras do app. No SSR
 * ela prenderia a resposta do documento num serviço que o servidor do contrate não controla.
 *
 * Nenhum dos dois é a barreira de acesso: o α responde 403 à OM fora da cobertura. Aqui é
 * para a URL nunca abrir uma tela que só vai mostrar erro — a OM que não se alcança volta ao
 * hub, e o hub com uma OM só leva direto a ela.
 */

import type { MeAccess } from "@iefa/alpha-client/access"
import type { QueryClient } from "@tanstack/react-query"
import { redirect } from "@tanstack/react-router"
import type { AuthState } from "@/auth/service"
import { alphaAccessQueryOptions } from "./alpha/role"
import { type ContrateModuleId, getModule, moduleScopeOptions, scopedPath } from "./modules"
import { resolveScopeParam, type ScopeContext, type ScopeOption } from "./scope"

interface GuardContext {
	queryClient: QueryClient
	auth: AuthState
}

/** O perfil do α, do cache quando fresco. Falha propaga: a rota mostra o erro, não "sem acesso". */
export function loadAlphaAccess(context: GuardContext): Promise<MeAccess> {
	return context.queryClient.query({ ...alphaAccessQueryOptions(context.auth.session?.access_token), staleTime: 60_000 })
}

/**
 * Hub do módulo: as OMs em que ele abre. Com uma só, leva direto a ela — escolher entre uma
 * opção é um clique a mais para chegar ao mesmo lugar.
 *
 * Em preload não se lança redirect: nada renderiza, e o router quebra ao processá-lo.
 */
export async function enterScopeHub(opts: { context: GuardContext; preload: boolean }, moduleId: ContrateModuleId): Promise<{ scopeOptions: ScopeOption[] }> {
	const module = getModule(moduleId)
	const access = await loadAlphaAccess(opts.context)
	const scopeOptions = moduleScopeOptions(module, access)

	const [only] = scopeOptions
	if (module.scope && scopeOptions.length === 1 && only && !opts.preload) {
		throw redirect({ to: scopedPath(module.scope.index, only.id), replace: true })
	}
	return { scopeOptions }
}

/**
 * Escopo do módulo: o `$unitId` da URL, conferido contra a cobertura. Fora dela — OM de
 * outro, `todas` sem papel global, texto qualquer — volta ao hub.
 *
 * Entrega `scopeContext` às filhas e à casca (seletor de OM, navegação, trilha).
 */
export async function enterScope(
	opts: { context: GuardContext; params: { unitId: string }; preload: boolean },
	moduleId: ContrateModuleId
): Promise<{ scopeContext: ScopeContext }> {
	const module = getModule(moduleId)
	const access = await loadAlphaAccess(opts.context)
	const scopeContext = resolveScopeParam(opts.params.unitId, moduleScopeOptions(module, access))

	if (!scopeContext) {
		if (opts.preload) throw new Error("OM fora da cobertura")
		throw redirect({ to: module.home, replace: true })
	}
	return { scopeContext }
}
