import { useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Loader2, Lock, Monitor, ShieldAlert } from "lucide-react"
import { type FormEvent, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"
import { authActions } from "#/auth/service"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"

const authSearchSchema = z.object({
	redirect: z.string().optional(),
	denied: z.string().optional(),
})

export const Route = createFileRoute("/auth/")({
	validateSearch: authSearchSchema,
	component: AuthPage,
})

function AuthPage() {
	const search = Route.useSearch()
	const queryClient = useQueryClient()
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [submitting, setSubmitting] = useState(false)

	async function onSubmit(e: FormEvent) {
		e.preventDefault()
		setSubmitting(true)
		try {
			await authActions.signIn(email, password)
			// Navegação dura para o destino: garante um SSR novo que lê o cookie de
			// sessão recém-gravado (evita corrida entre o refetch da auth query e o
			// guard do beforeLoad, que às vezes mantinha o usuário preso em /auth).
			queryClient.clear()
			window.location.assign(search.redirect ?? "/")
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Falha ao entrar")
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<div className="min-h-screen bg-tech-bg flex items-center justify-center p-6">
			<div className="w-full max-w-sm">
				<div className="flex items-center gap-3 mb-8 justify-center">
					<div className="w-11 h-11 bg-tech-blue rounded-xl flex items-center justify-center text-white shadow-lg">
						<Monitor className="w-6 h-6" />
					</div>
					<div className="flex flex-col">
						<h1 className="text-base font-bold text-slate-800 leading-tight">SUCONT-4 HUB</h1>
						<span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">DIREF • COMAER</span>
					</div>
				</div>

				{search.denied ? (
					<div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
						<ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
						<p className="text-xs leading-relaxed">
							Sua conta está autenticada, mas ainda não possui acesso ao SUCONT-4 HUB. Solicite a liberação a um administrador da seção.
						</p>
					</div>
				) : null}

				<form onSubmit={onSubmit} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="email">E-mail institucional</Label>
						<Input
							id="email"
							type="email"
							autoComplete="username"
							placeholder="usuario@fab.mil.br"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="password">Senha</Label>
						<Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
					</div>
					<Button type="submit" disabled={submitting} className="mt-2">
						{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
						{submitting ? "Entrando..." : "Entrar"}
					</Button>
				</form>

				<p className="text-center text-[11px] text-slate-400 mt-6 font-mono">Acesso restrito • Contabilidade Patrimonial</p>
			</div>
		</div>
	)
}
