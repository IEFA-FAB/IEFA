import { safeRedirect } from "@iefa/auth-kit"
import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { type SyntheticEvent, useState } from "react"
import { AuthShell, LoginForm, NoAccessPanel } from "@/components/auth/AuthViews"
import { useAuth } from "@/hooks/useAuth"
import { authQueryOptions } from "@/lib/auth"

type AuthSearch = { redirect?: string }

// E-mail institucional FAB.
const FAB_EMAIL_RE = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/

export const Route = createFileRoute("/auth")({
	validateSearch: (search: Record<string, unknown>): AuthSearch => ({
		redirect: safeRedirect(search.redirect),
	}),
	// Pré-carrega a sessão e desvia quem já está autorizado. Quem está logado mas
	// SEM concessão permanece aqui (a tela mostra o estado "sem acesso").
	beforeLoad: async ({ context, search }) => {
		const auth = await context.queryClient.query({ ...authQueryOptions(), staleTime: "static" })
		if (auth.isAuthorized) {
			throw redirect({ to: search.redirect || "/controller" })
		}
	},
	component: AuthPage,
})

function AuthPage() {
	const { user, isAuthenticated, isAuthorized } = useAuth()

	// Logado, mas sem concessão de acesso ao painel.
	if (isAuthenticated && !isAuthorized) {
		return <NoAccessCard email={user?.email ?? ""} />
	}

	return <LoginCard />
}

function LoginCard() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const search = Route.useSearch()
	const { signIn } = useAuth()

	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)

	const handleSubmit = async (e: SyntheticEvent) => {
		e.preventDefault()
		setError(null)

		if (!FAB_EMAIL_RE.test(email.trim())) {
			setError("Use seu e-mail institucional @fab.mil.br.")
			return
		}
		if (!password) {
			setError("Informe a senha.")
			return
		}

		setLoading(true)
		try {
			await signIn(email, password)
			await queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
			const state = await queryClient.query(authQueryOptions())
			if (state.isAuthorized) {
				navigate({ to: search.redirect || "/controller" })
			}
			// Autenticado mas sem concessão: o AuthPage re-renderiza no estado "sem acesso".
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao entrar.")
		} finally {
			setLoading(false)
		}
	}

	return (
		<AuthShell>
			<LoginForm
				email={email}
				password={password}
				error={error}
				loading={loading}
				onEmailChange={setEmail}
				onPasswordChange={setPassword}
				onSubmit={handleSubmit}
			/>
		</AuthShell>
	)
}

function NoAccessCard({ email }: { email: string }) {
	const queryClient = useQueryClient()
	const { signOut } = useAuth()
	const [loading, setLoading] = useState(false)

	const handleSignOut = async () => {
		setLoading(true)
		try {
			await signOut()
			await queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
		} finally {
			setLoading(false)
		}
	}

	return (
		<AuthShell>
			<NoAccessPanel email={email} loading={loading} onSignOut={handleSignOut} />
		</AuthShell>
	)
}
