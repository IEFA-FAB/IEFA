import { useSuspenseQuery } from "@tanstack/react-query"
import { useRouteContext } from "@tanstack/react-router"
import type { AuthContextType, AuthState } from "@/auth/service"
import { authQueryOptions } from "@/auth/service"
import { Route as RootRoute } from "@/routes/__root" // Importe a rota raiz

export type UseAuthReturn = AuthState & {
	actions: Omit<AuthContextType, keyof AuthState>
}

export function useAuth(): UseAuthReturn {
	// Pega o contexto tipado da rota raiz para acoes
	const context = useRouteContext({ from: RootRoute.id })

	// Pega o estado do usuario via Suspense Query
	// Isso garante que o componente suspenda se o beforeLoad ainda nao tiver resolvido (embora o beforeLoad ja garanta)
	// Mas permite atualizacoes granulares sem recarregar a rota inteira se usarmos invalidateQueries
	const { data } = useSuspenseQuery(authQueryOptions())

	return {
		actions: context.authActions, // Acoes (signIn, signOut, etc)
		...data, // Dados (user, session, isAuthenticated)
	}
}
