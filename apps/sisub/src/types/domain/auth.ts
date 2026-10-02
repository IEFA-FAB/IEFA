import type { User } from "@supabase/supabase-js"

// Sem `session`: o estado de auth vive no React Query, que o SSR serializa no HTML, e a
// sessão carrega access e refresh token. Quem precisar do token lê do client do navegador.
export interface AuthContextType {
	user: User | null
	isLoading: boolean
	isAuthenticated: boolean
	signIn: (email: string, password: string) => Promise<void>
	signUp: (email: string, password: string, name?: string) => Promise<void>
	signOut: (opts?: { redirectTo?: string; reload?: boolean }) => Promise<void>
	resetPassword: (email: string, redirectTo?: string) => Promise<void>
	refreshSession: () => Promise<void>
}
