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
	signOut: () => Promise<void>
	resetPassword: (email: string, redirectTo?: string) => Promise<void>
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase()
}

function getAuthErrorMessage(error: unknown): string {
	const msg = (error as { message?: string })?.message || "Erro desconhecido"
	if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos"
	if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar"
	if (/invalid format/i.test(msg)) return "Formato de e-mail inválido"
	return msg
}

export const authActions = {
	signIn: async (email: string, password: string) => {
		const { error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password })
		if (error) throw new Error(getAuthErrorMessage(error))
	},

	signOut: async () => {
		const { error } = await supabase.auth.signOut()
		if (error) {
			await supabase.auth.signOut({ scope: "local" })
		}
	},

	resetPassword: async (email: string, redirectTo?: string) => {
		const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
			redirectTo: redirectTo ?? (typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined),
		})
		if (error) throw new Error(getAuthErrorMessage(error))
	},
}

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
