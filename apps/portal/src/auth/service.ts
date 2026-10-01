import { createAuthActions } from "@iefa/auth-kit"
import type { User } from "@supabase/supabase-js"
import { queryOptions } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { getServerSessionFn } from "@/server/auth.fn"

// Sem `session`: os tokens não passam pelo estado do React Query, que o SSR serializa no
// HTML. Token para chamada autenticada: `getAccessToken()`.
export type AuthState = {
	user: User | null
	isLoading: boolean
	isAuthenticated: boolean
}

export interface AuthContextType {
	user: User | null
	isLoading: boolean
	isAuthenticated: boolean
	signIn: (email: string, password: string) => Promise<void>
	signUp: (email: string, password: string, name?: string) => Promise<void>
	signOut: () => Promise<void>
	resetPassword: (email: string, redirectTo?: string) => Promise<void>
	refreshSession: () => Promise<void>
}

export const authActions = createAuthActions({
	client: supabase,
	// `/auth/callback` e `/auth/reset-password` não são rotas deste app — os links
	// caíam em 404. Quem verifica o token_hash (cadastro e recuperação) é `/auth`.
	signUpRedirectPath: "/auth",
	resetPasswordRedirectPath: "/auth",
})

/**
 * Access token da sessão corrente, lido do client do navegador na hora da chamada (o
 * `getSession()` renova o token vencido). `undefined` sem sessão ou no servidor.
 */
export async function getAccessToken(): Promise<string | undefined> {
	const { data } = await supabase.auth.getSession()
	return data.session?.access_token
}

export const authQueryOptions = () =>
	queryOptions({
		queryKey: ["auth", "user"],
		// Auth Query Options — usa server function para que funcione tanto no SSR
		// (lê cookies via getIefaAuthClient) quanto no cliente (HTTP call com cache).
		queryFn: async () => {
			try {
				const { user } = await getServerSessionFn()
				return {
					user,
					isAuthenticated: !!user,
					isLoading: false,
				} as AuthState
			} catch (_error) {
				return {
					user: null,
					isAuthenticated: false,
					isLoading: false,
				} as AuthState
			}
		},
		staleTime: 1000 * 60 * 5, // 5 minutes
	})
