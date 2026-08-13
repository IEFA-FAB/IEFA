import { createAuthActions } from "@iefa/auth-kit"
import type { Session, User } from "@supabase/supabase-js"
import { queryOptions } from "@tanstack/react-query"
import { supabase } from "#/lib/supabase"
import { getServerSessionFn } from "#/server/auth.fn"

export type AuthState = {
	user: User | null
	session: Session | null
	isLoading: boolean
	isAuthenticated: boolean
}

export interface AuthContextType extends AuthState {
	signIn: (email: string, password: string) => Promise<void>
	signUp: (email: string, password: string, name?: string) => Promise<void>
	signOut: () => Promise<void>
	resetPassword: (email: string, redirectTo?: string) => Promise<void>
}

export const authActions = createAuthActions({
	client: supabase,
	// Confirmação de e-mail e recuperação de senha retornam à própria tela de login.
	signUpRedirectPath: "/auth",
	resetPasswordRedirectPath: "/auth",
})

export const authQueryOptions = () =>
	queryOptions({
		queryKey: ["auth", "user"],
		// Usa server function para funcionar tanto no SSR (lê cookies via
		// getSucontAuthClient) quanto no cliente (HTTP call com cache).
		queryFn: async () => {
			try {
				// O servidor só devolve o `user` verificado (getUser). A sessão do browser
				// é mantida client-side pelo supabase-js (onAuthStateChange), não aqui.
				const { user } = await getServerSessionFn()
				return { user, session: null, isAuthenticated: !!user, isLoading: false } as AuthState
			} catch {
				return { user: null, session: null, isAuthenticated: false, isLoading: false } as AuthState
			}
		},
		staleTime: 1000 * 60 * 5,
	})
