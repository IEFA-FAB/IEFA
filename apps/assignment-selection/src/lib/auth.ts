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

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Traduz os erros do Supabase Auth para mensagens em português. */
export function getAuthErrorMessage(error: AuthError | Error): string {
	const msg = error.message.toLowerCase()
	if (msg.includes("invalid login credentials")) return "E-mail ou senha inválidos."
	if (msg.includes("email not confirmed")) return "E-mail ainda não confirmado."
	if (msg.includes("rate limit") || msg.includes("too many")) return "Muitas tentativas. Aguarde e tente novamente."
	if (msg.includes("network")) return "Falha de conexão. Verifique sua internet."
	return error.message || "Erro ao autenticar."
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
