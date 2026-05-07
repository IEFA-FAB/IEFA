import { useSuspenseQuery } from "@tanstack/react-query"
import { useRouteContext } from "@tanstack/react-router"
import type { AuthContextType, AuthState } from "@/auth/service"
import { authQueryOptions } from "@/auth/service"
import { Route as RootRoute } from "@/routes/__root"

export type UseAuthReturn = AuthState & {
	actions: Omit<AuthContextType, keyof AuthState>
}

export function useAuth(): UseAuthReturn {
	const context = useRouteContext({ from: RootRoute.id })
	const { data } = useSuspenseQuery(authQueryOptions())

	return {
		actions: context.authActions,
		...data,
	}
}
