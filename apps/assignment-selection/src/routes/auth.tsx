import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { AlertCircle, Loader2, Lock, LogOut, Mail, ShieldAlert } from "lucide-react"
import { type FormEvent, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { authQueryOptions } from "@/lib/auth"

type AuthSearch = { redirect?: string }

// E-mail institucional FAB.
const FAB_EMAIL_RE = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/

export const Route = createFileRoute("/auth")({
	validateSearch: (search: Record<string, unknown>): AuthSearch => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	// Pré-carrega a sessão e desvia quem já está autorizado. Quem está logado mas
	// SEM concessão permanece aqui (a tela mostra o estado "sem acesso").
	beforeLoad: async ({ context, search }) => {
		const auth = await context.queryClient.ensureQueryData(authQueryOptions())
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

function AuthShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#0b1226] via-[#0a0f1e] to-[#05070f] p-4 text-white">
			<div className="pointer-events-none absolute -left-40 top-0 size-[42rem] rounded-full bg-blue-600/10 blur-[120px]" />
			<div className="pointer-events-none absolute -right-40 bottom-0 size-[42rem] rounded-full bg-indigo-700/10 blur-[120px]" />
			<div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
				<div className="mb-6 text-center">
					<p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300/70">CPAINT · Força Aérea Brasileira</p>
					<h1 className="mt-1 text-2xl font-black tracking-tight">Escolha de Vagas</h1>
				</div>
				{children}
			</div>
		</div>
	)
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

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault()
		setError(null)

		if (!FAB_EMAIL_RE.test(email.trim())) {
			setError("Use seu e-mail institucional @fab.mil.br.")
			return
		}

		setLoading(true)
		try {
			await signIn(email, password)
			await queryClient.invalidateQueries({ queryKey: authQueryOptions().queryKey })
			const state = await queryClient.fetchQuery(authQueryOptions())
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
			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="space-y-1.5">
					<label htmlFor="email" className="text-sm font-medium text-white/80">
						E-mail
					</label>
					<div className="relative">
						<Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
						<input
							id="email"
							type="email"
							autoComplete="username"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="nome@fab.mil.br"
							className="w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20"
							required
						/>
					</div>
				</div>

				<div className="space-y-1.5">
					<label htmlFor="password" className="text-sm font-medium text-white/80">
						Senha
					</label>
					<div className="relative">
						<Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
						<input
							id="password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							className="w-full rounded-lg border border-white/15 bg-white/5 py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/20"
							required
						/>
					</div>
				</div>

				{error && (
					<div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
						<AlertCircle className="mt-0.5 size-4 shrink-0" />
						<span>{error}</span>
					</div>
				)}

				<button
					type="submit"
					disabled={loading}
					className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{loading ? <Loader2 className="size-4 animate-spin" /> : null}
					{loading ? "Entrando…" : "Entrar"}
				</button>

				<p className="text-center text-xs text-white/40">Acesso restrito a operadores autorizados do painel.</p>
			</form>
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
			<div className="space-y-4 text-center">
				<div className="mx-auto flex size-12 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10">
					<ShieldAlert className="size-6 text-amber-300" />
				</div>
				<div className="space-y-1">
					<h2 className="text-lg font-semibold text-white">Sem acesso ao painel</h2>
					<p className="text-sm text-white/60">
						A conta <span className="font-medium text-white/80">{email}</span> não tem permissão para operar o painel de controle. Fale com o administrador para
						solicitar acesso.
					</p>
				</div>
				<button
					type="button"
					onClick={handleSignOut}
					disabled={loading}
					className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 disabled:opacity-60"
				>
					{loading ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
					Sair
				</button>
			</div>
		</AuthShell>
	)
}
