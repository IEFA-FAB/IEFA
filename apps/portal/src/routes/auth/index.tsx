import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Refresh } from "iconoir-react"
import { z } from "zod"
import { AuthScreen } from "@/auth/view/AuthScreen"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase"

// Schema para search params — view=forgot é URL-driven, não estado local
const authSearchSchema = z.object({
	redirect: z.string().optional(),
	tab: z.enum(["login", "register"]).optional().default("login"),
	view: z.enum(["forgot"]).optional(),
	token_hash: z.string().optional(),
	type: z.string().optional(),
})

export const Route = createFileRoute("/auth/")({
	validateSearch: authSearchSchema,
	staticData: {
		nav: {
			title: "Entrar no portal",
			section: "Conta",
			subtitle: "Login, cadastro e recuperação de acesso",
			keywords: ["login", "cadastro", "acesso", "entrar", "registrar"],
			access: "anonymous",
			order: 40,
		},
	},
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
			return { error: error ? new Error(error.message) : null }
		},
		verifyOtp: async (token_hash: string, type: "email") => {
			const { error } = await supabase.auth.verifyOtp({ token_hash, type })
			return { error: error ? new Error(error.message) : null }
		},
	}

	const handleNavigate = async (options: { to?: string; search?: Record<string, unknown>; replace?: boolean }) => {
		await router.navigate(options as Parameters<typeof router.navigate>[0])
	}

	// Troca de tab (login/register) — replace: true pois não é fluxo de "volta"
	const handleTabChange = (tab: "login" | "register") => {
		navigate({
			search: (prev) => ({ ...prev, tab }),
			replace: true,
		})
	}

	// Troca de view (forgot) — replace: false para push no histórico (back button funciona)
	const handleViewChange = (view: "forgot" | null) => {
		navigate({
			search: (prev) => ({ ...prev, view: view ?? undefined }),
			replace: false,
		})
	}

	if (isLoading) {
		return (
			<div className="border border-border bg-card px-8 py-10 flex items-center gap-3">
				<Refresh className="h-4 w-4 animate-spin text-muted-foreground" />
				<span className="text-sm text-muted-foreground">Verificando autenticação...</span>
			</div>
		)
	}

	return (
		<AuthScreen
			isLoading={isLoading}
			isAuthenticated={isAuthenticated}
			searchParams={search}
			onNavigate={handleNavigate}
			onTabChange={handleTabChange}
			onViewChange={handleViewChange}
			actions={actions}
		/>
	)
}
