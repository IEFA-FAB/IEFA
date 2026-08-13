import { createAuthActions } from "@iefa/auth-kit"
import type { Session, User } from "@supabase/supabase-js"
import { queryOptions } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { getServerSessionFn } from "@/server/auth.fn"

export type AuthState = {
	user: User | null
	session: Session | null
	isLoading: boolean
	isAuthenticated: boolean
}

export interface AuthContextType {
	user: User | null
	session: Session | null
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
	// /auth é a única rota de autenticação: lê token_hash/type da URL e faz o verifyOtp.
	signUpRedirectPath: "/auth",
	resetPasswordRedirectPath: "/auth",
})

export const authQueryOptions = () =>
	queryOptions({
		queryKey: ["auth", "user"],
		queryFn: async () => {
			try {
				const { user, session } = await getServerSessionFn({ data: {} })
				return {
					user,
					session,
					isAuthenticated: !!user,
					isLoading: false,
				} as AuthState
			} catch (_error) {
				return {
					user: null,
					session: null,
					isAuthenticated: false,
					isLoading: false,
				} as AuthState
			}
		},
		staleTime: 1000 * 60 * 5,
	})
