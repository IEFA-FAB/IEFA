import { getAuthErrorMessage as getKitAuthErrorMessage, normalizeEmail } from "@iefa/auth-kit"
import type { AuthError, Session, User } from "@supabase/supabase-js"
import { queryOptions } from "@tanstack/react-query"
import { getServerSessionFn } from "@/server/auth.fn"
import { supabase } from "./supabase"

export interface AuthState {
	user: User | null
	session: Session | null
	/** Sessão válida (usuário logado). */
	isAuthenticated: boolean
	/** Logado E com concessão de acesso ativa no painel (PBAC). */
	isAuthorized: boolean
	role: string | null
	isLoading: boolean
}

export const authQueryKey = ["auth", "session"] as const

export const authQueryOptions = () =>
	queryOptions({
		queryKey: authQueryKey,
		queryFn: async (): Promise<AuthState> => {
			const { user, session, access } = await getServerSessionFn()
			return {
				user,
				session,
				isAuthenticated: !!user,
				isAuthorized: access.authorized,
				role: access.role,
				isLoading: false,
			}
		},
		staleTime: 1000 * 60 * 5,
	})

/**
 * Traduz os erros do Supabase Auth pela tabela do kit (`code` primeiro, frase em inglês
 * depois), para a credencial recusada sair com o mesmo texto dos outros apps
 * (`INVALID_CREDENTIALS_MESSAGE`). Fica aqui só o que o kit não cobre: falha de rede.
 */
export function getAuthErrorMessage(error: AuthError | Error): string {
	if (error.message.toLowerCase().includes("network")) return "Falha de conexão. Verifique sua internet."
	return getKitAuthErrorMessage(error) || "Erro ao autenticar."
}

export const authActions = {
	signIn: async (email: string, password: string) => {
		const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password })
		if (error) throw new Error(getAuthErrorMessage(error))
	},
	signOut: async () => {
		const { error } = await supabase.auth.signOut()
		if (error) throw new Error(getAuthErrorMessage(error))
	},
	resetPassword: async (email: string) => {
		const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined
		const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo })
		if (error) throw new Error(getAuthErrorMessage(error))
	},
}
