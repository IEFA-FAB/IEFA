import { createAuthActions } from "@iefa/auth-kit"
import { queryOptions } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import supabase from "@/lib/supabase"
import { getServerSessionFn } from "@/server/auth.fn"
import type { AuthContextType } from "../types/domain/auth"

// Separate state from actions for router context typing
export type AuthState = Pick<AuthContextType, "user" | "session" | "isLoading" | "isAuthenticated">

// Auth Query Options — usa server function para que funcione tanto no SSR
// (lê cookies via getSupabaseAuthClient) quanto no cliente (HTTP call com cache).
export const authQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.auth.user(),
		queryFn: async () => {
			const { user, session } = await getServerSessionFn()
			return {
				user,
				session,
				isAuthenticated: !!user,
				isLoading: false,
			} as AuthState
		},
		staleTime: 1000 * 60 * 5, // 5 minutos
	})

export const authActions = createAuthActions({
	client: supabase,
	// `/auth/callback` não é rota deste app — o link caía em 404. Quem verifica o
	// token_hash da confirmação de cadastro é `/auth`.
	signUpRedirectPath: "/auth",
	resetPasswordRedirectPath: "/auth/reset-password",
})
