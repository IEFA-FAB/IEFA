import { createFileRoute, useRouter } from "@tanstack/react-router"
import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"
import { clearPasswordRecovery, isPasswordRecovery, urlLooksLikeRecovery } from "@/auth/recovery-session"
import { AuthScreen } from "@/auth/view/AuthScreen"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase"

const authSearchSchema = z.object({
	redirect: z.string().optional(),
	tab: z.enum(["login", "register"]).optional().default("login"),
	view: z.enum(["forgot"]).optional(),
	token_hash: z.string().optional(),
	type: z.string().optional(),
})

export const Route = createFileRoute("/auth/")({
	validateSearch: authSearchSchema,
	component: AuthPage,
})

function AuthPage() {
	const { actions: authActions, isAuthenticated, isLoading } = useAuth()
	const router = useRouter()
	const search = Route.useSearch()
	const navigate = Route.useNavigate()

	const actions = {
		signIn: async (email: string, password: string) => {
			await authActions.signIn(email, password)
		},
		signUp: async (email: string, password: string) => {
			await authActions.signUp(email, password)
		},
		resetPassword: async (email: string) => {
			await authActions.resetPassword(email)
		},
		updateUserPassword: async (password: string) => {
			const { error } = await supabase.auth.updateUser({ password })
			// Senha gravada: a recuperação terminou e o guard de `/auth` volta a valer.
			if (!error) clearPasswordRecovery()
			return { error: error ? new Error(error.message) : null }
		},
		verifyOtp: async (token_hash: string, type: "email" | "recovery") => {
			const { error } = await supabase.auth.verifyOtp({ token_hash, type })
			return { error: error ? new Error(error.message) : null }
		},
	}

	// O link de e-mail volta do Supabase sem token_hash: o client consome os
	// tokens da URL e anuncia PASSWORD_RECOVERY. É esse evento que distingue
	// "chegou para redefinir a senha" de "chegou para fazer login".
	// Estado inicial vindo do módulo: o PASSWORD_RECOVERY pode ter sido emitido
	// antes deste componente montar, e aí a assinatura abaixo não o veria.
	const [isRecoverySession, setIsRecoverySession] = useState(() => isPasswordRecovery() || urlLooksLikeRecovery())
	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event) => {
			if (event === "PASSWORD_RECOVERY") setIsRecoverySession(true)
		})
		return () => subscription.unsubscribe()
	}, [])

	const handleNavigate = async (options: { to?: string; search?: Record<string, unknown>; replace?: boolean }) => {
		await router.navigate(options as Parameters<typeof router.navigate>[0])
	}

	const handleTabChange = (tab: "login" | "register") => {
		navigate({ search: (prev) => ({ ...prev, tab }), replace: true })
	}

	const handleViewChange = (view: "forgot" | null) => {
		navigate({ search: (prev) => ({ ...prev, view: view ?? undefined }), replace: false })
	}

	if (isLoading) {
		return (
			<div className="border border-border rounded-lg bg-card px-8 py-10 flex items-center gap-3">
				<RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
				<span className="text-sm text-muted-foreground">Verificando autenticação...</span>
			</div>
		)
	}

	return (
		<AuthScreen
			isLoading={isLoading}
			isAuthenticated={isAuthenticated}
			isRecoverySession={isRecoverySession}
			searchParams={search}
			onNavigate={handleNavigate}
			onTabChange={handleTabChange}
			onViewChange={handleViewChange}
			actions={actions}
		/>
	)
}
