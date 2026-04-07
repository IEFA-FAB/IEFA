// Routing
import { createFileRoute, useRouter } from "@tanstack/react-router"
// Icons
import { AlertCircle, CheckCircle2, ChevronRight, Eye, EyeOff, Loader2, Lock } from "lucide-react"
// React
import { useEffect, useState } from "react"
// UI
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
// Services
import { cn } from "@/lib/cn"
import supabase from "@/lib/supabase"

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

/* ========================================================================
   COMPONENT
   ======================================================================== */

function ResetPasswordPage() {
	"use no memo"
	const router = useRouter()

	const [pageState, setPageState] = useState<PageState>("verifying")
	const [newPassword, setNewPassword] = useState("")
	const [confirm, setConfirm] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirm, setShowConfirm] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState("")

	const passwordErr = newPassword && newPassword.length < 6 ? "Mínimo de 6 caracteres." : null
	const confirmErr = confirm && confirm !== newPassword ? "As senhas não coincidem." : null

	// Aguarda o evento de recuperação de senha do Supabase (via hash do link)
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount, pageState setter is stable
	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
				setPageState("form")
			}
		})

		// Fallback: se a sessão já estiver ativa (link com token no hash já processado)
		const timer = setTimeout(async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession()
			if (pageState === "verifying") {
				setPageState(session ? "form" : "invalid")
			}
		}, 1500)

		return () => {
			subscription.unsubscribe()
			clearTimeout(timer)
		}
	}, [])

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		if (!newPassword || newPassword.length < 6) return
		if (newPassword !== confirm) return

		setIsSubmitting(true)
		setError("")

		const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

		if (updateError) {
			setError(updateError.message)
			setIsSubmitting(false)
			return
		}

		await supabase.auth.signOut()
		setIsSubmitting(false)
		setPageState("success")
		setTimeout(() => router.navigate({ to: "/auth", search: { tab: "login" } }), 2000)
	}

	/* ── Verificando ──────────────────────────────────────────────────────── */
	if (pageState === "verifying") {
		return (
			<div className="flex-1 flex items-center justify-center px-4 py-12">
				<div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
					<Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
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
					<CheckCircle2 className="h-8 w-8 text-primary" aria-hidden />
					<p className="font-bold text-lg">Senha atualizada!</p>
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
						<h1 className="text-2xl font-bold mb-1">Link inválido</h1>
						<p className="text-sm text-muted-foreground leading-relaxed">O link de recuperação expirou ou não é mais válido.</p>
					</div>
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
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
					<h1 className="text-2xl font-bold mb-1">Nova senha</h1>
					<p className="text-sm text-muted-foreground">Escolha uma senha segura para sua conta.</p>
				</div>

				<form onSubmit={handleSubmit} noValidate className="space-y-5">
					{error && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					{/* Nova senha */}
					<div className="space-y-1.5">
						<Label htmlFor="new-password" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
							Nova senha
						</Label>
						<div className="relative">
							<Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="new-password"
								type={showPassword ? "text" : "password"}
								autoComplete="new-password"
								placeholder="Mínimo 6 caracteres"
								value={newPassword}
								onChange={(e) => {
									setNewPassword(e.target.value)
									setError("")
								}}
								className={cn("pl-9 pr-10", passwordErr && "border-destructive")}
								aria-invalid={!!passwordErr || undefined}
								aria-describedby={passwordErr ? "new-password-error" : undefined}
								disabled={isSubmitting}
								minLength={6}
								required
							/>
							<button
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
								aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							>
								{showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
							</button>
						</div>
						{passwordErr && (
							<p id="new-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
								<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {passwordErr}
							</p>
						)}
					</div>

					{/* Confirmar senha */}
					<div className="space-y-1.5">
						<Label htmlFor="confirm-password" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
							Confirmar senha
						</Label>
						<div className="relative">
							<Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="confirm-password"
								type={showConfirm ? "text" : "password"}
								autoComplete="new-password"
								placeholder="Digite a senha novamente"
								value={confirm}
								onChange={(e) => {
									setConfirm(e.target.value)
									setError("")
								}}
								className={cn("pl-9 pr-10", confirmErr && "border-destructive")}
								aria-invalid={!!confirmErr || undefined}
								aria-describedby={confirmErr ? "confirm-password-error" : undefined}
								disabled={isSubmitting}
								minLength={6}
								required
							/>
							<button
								type="button"
								onClick={() => setShowConfirm(!showConfirm)}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
								aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
							>
								{showConfirm ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
							</button>
						</div>
						{confirmErr && (
							<p id="confirm-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
								<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {confirmErr}
							</p>
						)}
					</div>

					<Button type="submit" className="w-full gap-2" disabled={isSubmitting || !!passwordErr || !!confirmErr || !newPassword || !confirm}>
						{isSubmitting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Atualizando...
							</>
						) : (
							<>
								Atualizar senha <ChevronRight className="h-4 w-4" aria-hidden />
							</>
						)}
					</Button>
				</form>
			</div>
		</div>
	)
}
