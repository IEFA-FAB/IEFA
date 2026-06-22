// Routing
import { createFileRoute, useRouter } from "@tanstack/react-router"
// Icons
import { AlertCircle, CheckCircle2, ChevronRight, Eye, EyeOff, Loader2, Lock } from "lucide-react"
// React
import { useEffect, useReducer } from "react"
// UI
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
// Services
import { cn } from "@/lib/cn"
import supabase from "@/lib/supabase"

function getPasswordError(v: string): string | null {
	if (v.length < 8) return "Mínimo de 8 caracteres."
	if (!/[a-z]/.test(v)) return "Inclua pelo menos uma letra minúscula."
	if (!/[A-Z]/.test(v)) return "Inclua pelo menos uma letra maiúscula."
	if (!/\d/.test(v)) return "Inclua pelo menos um número."
	return null
}

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

export const Route = createFileRoute("/auth/reset-password")({
	head: () => ({
		meta: [{ title: "Redefinir Senha — SISUB" }],
	}),
	component: ResetPasswordPage,
})

/* ========================================================================
   TYPES
   ======================================================================== */

type PageState = "verifying" | "invalid" | "form" | "success"

// ─── Reducer ─────────────────────────────────────────────────────────────────

type ResetPasswordRouteState = {
	pageState: PageState
	newPassword: string
	confirm: string
	showPassword: boolean
	showConfirm: boolean
	isSubmitting: boolean
	error: string
}

type ResetPasswordRouteAction =
	| { type: "SET_PAGE_STATE"; value: PageState }
	| { type: "RESOLVE_FALLBACK"; hasSession: boolean }
	| { type: "SET_NEW_PASSWORD"; value: string }
	| { type: "SET_CONFIRM"; value: string }
	| { type: "TOGGLE_SHOW_PASSWORD" }
	| { type: "TOGGLE_SHOW_CONFIRM" }
	| { type: "SET_SUBMITTING"; value: boolean }
	| { type: "SET_ERROR"; value: string }

const initialResetPasswordRouteState: ResetPasswordRouteState = {
	pageState: "verifying",
	newPassword: "",
	confirm: "",
	showPassword: false,
	showConfirm: false,
	isSubmitting: false,
	error: "",
}

function resetPasswordRouteReducer(state: ResetPasswordRouteState, action: ResetPasswordRouteAction): ResetPasswordRouteState {
	switch (action.type) {
		case "SET_PAGE_STATE":
			return { ...state, pageState: action.value }
		case "RESOLVE_FALLBACK":
			// Só aplica o fallback se ainda estivermos verificando — evita
			// sobrescrever um estado "form" já resolvido pelo onAuthStateChange.
			if (state.pageState !== "verifying") return state
			return { ...state, pageState: action.hasSession ? "form" : "invalid" }
		case "SET_NEW_PASSWORD":
			return { ...state, newPassword: action.value }
		case "SET_CONFIRM":
			return { ...state, confirm: action.value }
		case "TOGGLE_SHOW_PASSWORD":
			return { ...state, showPassword: !state.showPassword }
		case "TOGGLE_SHOW_CONFIRM":
			return { ...state, showConfirm: !state.showConfirm }
		case "SET_SUBMITTING":
			return { ...state, isSubmitting: action.value }
		case "SET_ERROR":
			return { ...state, error: action.value }
		default:
			return state
	}
}

/* ========================================================================
   COMPONENT
   ======================================================================== */

function ResetPasswordPage() {
	"use no memo"
	const router = useRouter()

	const [state, dispatch] = useReducer(resetPasswordRouteReducer, initialResetPasswordRouteState)
	const { pageState, newPassword, confirm, showPassword, showConfirm, isSubmitting, error } = state

	const passwordErr = newPassword ? getPasswordError(newPassword) : null
	const confirmErr = confirm && confirm !== newPassword ? "As senhas não coincidem." : null

	// Aguarda o evento de recuperação de senha do Supabase (via hash do link).
	// Sem deps reativas: só usa supabase/dispatch (estáveis) e a decisão de
	// estado mora no reducer (RESOLVE_FALLBACK).
	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
				dispatch({ type: "SET_PAGE_STATE", value: "form" })
			}
		})

		// Fallback: se a sessão já estiver ativa (link com token no hash já processado).
		// A decisão de "ainda verificando?" vai no reducer para não ler pageState
		// defasado (capturado no mount) e sobrescrever um "form" já resolvido.
		const timer = setTimeout(async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession()
			dispatch({ type: "RESOLVE_FALLBACK", hasSession: !!session })
		}, 1500)

		return () => {
			subscription.unsubscribe()
			clearTimeout(timer)
		}
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		if (!newPassword || getPasswordError(newPassword)) return
		if (newPassword !== confirm) return

		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })

		const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

		if (updateError) {
			dispatch({ type: "SET_ERROR", value: updateError.message })
			dispatch({ type: "SET_SUBMITTING", value: false })
			return
		}

		await supabase.auth.signOut()
		dispatch({ type: "SET_SUBMITTING", value: false })
		dispatch({ type: "SET_PAGE_STATE", value: "success" })
		setTimeout(() => router.navigate({ to: "/auth", search: { tab: "login" } }), 2000)
	}

	/* ── Verificando ──────────────────────────────────────────────────────── */
	if (pageState === "verifying") {
		return (
			<div className="flex-1 flex items-center justify-center px-4 py-12">
				<div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
					<Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
					<p className="font-mono text-sm text-muted-foreground">Verificando link de recuperação...</p>
				</div>
			</div>
		)
	}

	/* ── Senha atualizada ─────────────────────────────────────────────────── */
	if (pageState === "success") {
		return (
			<div className="flex-1 flex items-center justify-center px-4 py-12">
				<div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
					<CheckCircle2 className="size-8 text-primary" aria-hidden />
					<p className="text-display">Senha atualizada!</p>
					<p className="font-mono text-sm text-muted-foreground">Redirecionando para o login...</p>
				</div>
			</div>
		)
	}

	/* ── Link inválido ────────────────────────────────────────────────────── */
	if (pageState === "invalid") {
		return (
			<div className="flex-1 flex items-center justify-center px-4 py-12">
				<div className="w-full max-w-sm flex flex-col gap-5">
					<div>
						<p className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase mb-2">Redefinição de senha</p>
						<h1 className="text-display mb-1">Link inválido</h1>
						<p className="text-sm text-muted-foreground leading-relaxed">O link de recuperação expirou ou não é mais válido.</p>
					</div>
					<Alert variant="destructive">
						<AlertCircle className="size-4" />
						<AlertDescription>Solicite uma nova recuperação de senha.</AlertDescription>
					</Alert>
					<Button variant="outline" onClick={() => router.navigate({ to: "/auth" })} className="self-start">
						Ir para o login
					</Button>
				</div>
			</div>
		)
	}

	/* ── Formulário ───────────────────────────────────────────────────────── */
	return (
		<div className="flex-1 flex items-center justify-center px-4 py-12">
			<div className="w-full max-w-sm">
				{/* Cabeçalho — mesma linguagem mono do resto da autenticação */}
				<div className="mb-8">
					<p className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase mb-2">Redefinição de senha</p>
					<h1 className="text-display mb-1">Nova senha</h1>
					<p className="text-sm text-muted-foreground">Escolha uma senha segura para sua conta.</p>
				</div>

				<form onSubmit={handleSubmit} noValidate className="space-y-5">
					{error && (
						<Alert variant="destructive">
							<AlertCircle className="size-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					{/* Nova senha */}
					<div className="space-y-1.5">
						<Label htmlFor="new-password" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
							Nova senha
						</Label>
						<div className="relative">
							<Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="new-password"
								type={showPassword ? "text" : "password"}
								autoComplete="new-password"
								placeholder="Mínimo 8 caracteres"
								value={newPassword}
								onChange={(e) => {
									dispatch({ type: "SET_NEW_PASSWORD", value: e.target.value })
									dispatch({ type: "SET_ERROR", value: "" })
								}}
								className={cn("pl-9 pr-10", passwordErr && "border-destructive")}
								aria-invalid={!!passwordErr || undefined}
								aria-describedby={passwordErr ? "new-password-error" : undefined}
								disabled={isSubmitting}
								minLength={8}
								required
							/>
							<button
								type="button"
								onClick={() => dispatch({ type: "TOGGLE_SHOW_PASSWORD" })}
								className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
								aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							>
								{showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
							</button>
						</div>
						{passwordErr && (
							<p id="new-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
								<AlertCircle className="size-3 shrink-0" aria-hidden /> {passwordErr}
							</p>
						)}
					</div>

					{/* Confirmar senha */}
					<div className="space-y-1.5">
						<Label htmlFor="confirm-password" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
							Confirmar senha
						</Label>
						<div className="relative">
							<Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="confirm-password"
								type={showConfirm ? "text" : "password"}
								autoComplete="new-password"
								placeholder="Digite a senha novamente"
								value={confirm}
								onChange={(e) => {
									dispatch({ type: "SET_CONFIRM", value: e.target.value })
									dispatch({ type: "SET_ERROR", value: "" })
								}}
								className={cn("pl-9 pr-10", confirmErr && "border-destructive")}
								aria-invalid={!!confirmErr || undefined}
								aria-describedby={confirmErr ? "confirm-password-error" : undefined}
								disabled={isSubmitting}
								minLength={8}
								required
							/>
							<button
								type="button"
								onClick={() => dispatch({ type: "TOGGLE_SHOW_CONFIRM" })}
								className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
								aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
							>
								{showConfirm ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
							</button>
						</div>
						{confirmErr && (
							<p id="confirm-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
								<AlertCircle className="size-3 shrink-0" aria-hidden /> {confirmErr}
							</p>
						)}
					</div>

					<Button type="submit" className="w-full gap-2" disabled={isSubmitting || !!passwordErr || !!confirmErr || !newPassword || !confirm}>
						{isSubmitting ? (
							<>
								<Loader2 className="size-4 animate-spin" aria-hidden /> Atualizando...
							</>
						) : (
							<>
								Atualizar senha <ChevronRight className="size-4" aria-hidden />
							</>
						)}
					</Button>
				</form>
			</div>
		</div>
	)
}
