import type { SupabaseClient } from "@supabase/supabase-js"

import { getAuthErrorMessage, normalizeEmail } from "./errors.ts"

export type AuthActionsOptions = {
	/** Client do browser da app (o mesmo que mantém a sessão via `onAuthStateChange`). */
	// biome-ignore lint/suspicious/noExplicitAny: o kit é agnóstico ao Database/schema da app; só usa `.auth`.
	client: SupabaseClient<any, any>
	/**
	 * Caminho para onde o link de confirmação de cadastro volta.
	 * Relativo à origin (ex.: `/auth/callback`). Cada app tem a sua tela.
	 */
	signUpRedirectPath: string
	/** Caminho para onde o link de recuperação de senha volta (ex.: `/auth/reset-password`). */
	resetPasswordRedirectPath: string
}

export type AuthActions = {
	signIn: (email: string, password: string) => Promise<void>
	signUp: (email: string, password: string, name?: string) => Promise<void>
	signOut: () => Promise<void>
	resetPassword: (email: string, redirectTo?: string) => Promise<void>
	refreshSession: () => Promise<void>
}

/** Resolve um caminho para URL absoluta; no servidor devolve `undefined` (o GoTrue usa o default do projeto). */
function absoluteUrl(path: string): string | undefined {
	if (typeof window === "undefined") return undefined
	return new URL(path, window.location.origin).toString()
}

/**
 * Ações de autenticação da app, com as mensagens de erro já traduzidas.
 *
 * Só o que varia entre apps é parâmetro (client e caminhos de retorno); o resto —
 * normalização de e-mail, tradução de erro, fallback de signOut — é idêntico e
 * vivia copiado em 5 apps, com as traduções divergindo entre as cópias.
 */
export function createAuthActions({ client, signUpRedirectPath, resetPasswordRedirectPath }: AuthActionsOptions): AuthActions {
	return {
		signIn: async (email, password) => {
			const { error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password })
			if (error) throw new Error(getAuthErrorMessage(error))
		},

		signUp: async (email, password, name) => {
			const { error } = await client.auth.signUp({
				email: normalizeEmail(email),
				password,
				options: {
					data: name ? { display_name: name } : undefined,
					emailRedirectTo: absoluteUrl(signUpRedirectPath),
				},
			})
			if (error) throw new Error(getAuthErrorMessage(error))
		},

		signOut: async () => {
			const { error } = await client.auth.signOut()
			// Se o revoke remoto falha (upstream fora do ar), ainda assim limpamos a
			// sessão local — senão o usuário fica preso "logado" numa sessão morta.
			if (error) await client.auth.signOut({ scope: "local" })
		},

		resetPassword: async (email, redirectTo) => {
			const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), {
				redirectTo: redirectTo ?? absoluteUrl(resetPasswordRedirectPath),
			})
			if (error) throw new Error(getAuthErrorMessage(error))
		},

		refreshSession: async () => {
			const { error } = await client.auth.refreshSession()
			if (error) throw new Error(getAuthErrorMessage(error))
		},
	}
}
