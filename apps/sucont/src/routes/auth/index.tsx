import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import { z } from "zod"
import { authActions } from "#/auth/service"
import { AuthScreen } from "#/auth/view/AuthScreen"
import { supabase } from "#/lib/supabase"

const authSearchSchema = z.object({
	redirect: z.string().optional(),
	denied: z.string().optional(),
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
	const search = Route.useSearch()
	// `auth` é injetado pelo beforeLoad do __root (rotas públicas incluídas).
	const { auth } = Route.useRouteContext()
	const queryClient = useQueryClient()
	const router = useRouter()
	const navigate = Route.useNavigate()

	// Identidade estável entre renders: o AuthScreen usa `actions` em deps de effect
	// (verifyOtp), então recriar o objeto a cada render re-dispararia o effect.
	const actions = useMemo(
		() => ({
			signIn: async (email: string, password: string) => {
				await authActions.signIn(email, password)
			},
			signUp: async (email: string, password: string, name: string) => {
				await authActions.signUp(email, password, name)
			},
			resetPassword: async (email: string) => {
				await authActions.resetPassword(email)
			},
			updateUserPassword: async (password: string) => {
				const { error } = await supabase.auth.updateUser({ password })
				return { error: error ? new Error(error.message) : null }
			},
			verifyOtp: async (token_hash: string, type: "email" | "recovery") => {
				const { error } = await supabase.auth.verifyOtp({ token_hash, type })
				return { error: error ? new Error(error.message) : null }
			},
		}),
		[]
	)

	// Navegação dura para o destino: garante um SSR novo que lê o cookie de sessão
	// recém-gravado (evita a corrida entre o refetch da auth query e o guard do
	// beforeLoad, que às vezes prendia o usuário em /auth). Mesmo padrão do login antigo.
	const handleNavigate = useCallback(
		async (options: { to?: string; search?: Record<string, unknown>; replace?: boolean }) => {
			if (options.to) {
				queryClient.clear()
				window.location.assign(options.to)
				return
			}
			await router.navigate(options as Parameters<typeof router.navigate>[0])
		},
		[queryClient, router]
	)

	const handleTabChange = useCallback(
		(tab: "login" | "register") => {
			navigate({ search: (prev) => ({ ...prev, tab }), replace: true })
		},
		[navigate]
	)

	const handleViewChange = useCallback(
		(view: "forgot" | null) => {
			navigate({ search: (prev) => ({ ...prev, view: view ?? undefined }), replace: false })
		},
		[navigate]
	)

	return (
		<AuthScreen
			isLoading={false}
			isAuthenticated={auth.isAuthenticated}
			searchParams={search}
			onNavigate={handleNavigate}
			onTabChange={handleTabChange}
			onViewChange={handleViewChange}
			actions={actions}
		/>
	)
}
