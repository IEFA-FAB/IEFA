import { useSuspenseQuery } from "@tanstack/react-query"
import { authActions, authQueryOptions } from "@/lib/auth"

/**
 * Estado de auth + ações. Usa useSuspenseQuery: a query precisa ter sido
 * pré-carregada por um beforeLoad (`ensureQueryData(authQueryOptions())`) antes
 * de qualquer componente ler este hook, senão suspende no primeiro render.
 */
export function useAuth() {
	const { data } = useSuspenseQuery(authQueryOptions())
	return { ...authActions, ...data }
}
