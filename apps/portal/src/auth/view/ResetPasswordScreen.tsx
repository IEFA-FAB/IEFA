import { Eye, EyeClosed, Lock, Refresh, WarningCircle } from "iconoir-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface ResetPasswordScreenProps {
	searchParams: {
		token_hash?: string
		type?: string
	}
	actions: {
		verifyOtp: (token_hash: string, type: "recovery") => Promise<{ error: Error | null }>
		updatePassword: (password: string) => Promise<{ error: Error | null }>
	}
	onNavigate: (options: { to?: string; search?: Record<string, unknown> }) => void
	forgotPasswordPath?: string
}

const LABEL = "text-[11px] font-medium uppercase text-muted-foreground"
const LABEL_TRACKING = { letterSpacing: "0.06em" } as const

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
	return (
		<p id={id} role="alert" className="flex items-center gap-1 text-xs text-destructive mt-1">
			<WarningCircle className="h-3 w-3 shrink-0" aria-hidden />
			{children}
		</p>
	)
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div className="border-l-2 border-destructive bg-destructive/5 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
			<WarningCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
			{message}
		</div>
	)
}

export function ResetPasswordScreen({ searchParams, actions, onNavigate, forgotPasswordPath = "/auth" }: ResetPasswordScreenProps) {
	const [newPassword, setNewPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState("")
	const [passwordError, setPasswordError] = useState("")
	const [confirmError, setConfirmError] = useState("")
	const [isVerifyingToken, setIsVerifyingToken] = useState(true)
	const [tokenValid, setTokenValid] = useState(false)

	useEffect(() => {
		const verify = async () => {
			if (!searchParams.token_hash || searchParams.type !== "recovery") {
				setError("Link inválido ou expirado. Solicite uma nova recuperação de senha.")
				setIsVerifyingToken(false)
				return
			}
			try {
				const { error: e } = await actions.verifyOtp(searchParams.token_hash, "recovery")
				if (e) {
					setError("Link inválido ou expirado. Solicite uma nova recuperação de senha.")
					setTokenValid(false)
				} else {
					setTokenValid(true)
				}
			} catch {
				setError("Erro ao verificar o link. Tente novamente.")
				setTokenValid(false)
			} finally {
				setIsVerifyingToken(false)
			}
		}
		verify()
	}, [searchParams.token_hash, searchParams.type, actions])

	const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
		setNewPassword(v)
		setError("")
		setPasswordError("")
		if (v && v.length < 6) setPasswordError("Mínimo 6 caracteres.")
		if (confirmPassword && v !== confirmPassword) setConfirmError("As senhas não coincidem.")
		else setConfirmError("")
	}

	const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
		setConfirmPassword(v)
		setConfirmError("")
		if (v && v !== newPassword) setConfirmError("As senhas não coincidem.")
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (newPassword.length < 6) {
			setPasswordError("Mínimo 6 caracteres.")
			return
		}
		if (newPassword !== confirmPassword) {
			setConfirmError("As senhas não coincidem.")
			return
		}
		setIsSubmitting(true)
		setError("")
		setPasswordError("")
		setConfirmError("")
		try {
			const { error: e } = await actions.updatePassword(newPassword)
			if (e) throw e
			onNavigate({ to: "/auth", search: { tab: "login" } })
			alert("Senha atualizada com sucesso! Faça login com sua nova senha.")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao atualizar senha. Tente novamente.")
		} finally {
			setIsSubmitting(false)
		}
	}

	// ── Verifying token ───────────────────────────────────────────────────────
	if (isVerifyingToken) {
		return (
			<div className="border border-border bg-card px-8 py-10 flex items-center gap-3">
				<Refresh className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
				<span className="text-sm text-muted-foreground">Verificando link de recuperação...</span>
			</div>
		)
	}

	// ── Invalid token ─────────────────────────────────────────────────────────
	if (!tokenValid) {
		return (
			<div className="border border-border bg-card">
				<div className="px-8 pt-8 pb-6 border-b border-border">
					<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
						Link Inválido
					</h2>
					<p className="text-sm text-muted-foreground mt-1">O link de recuperação expirou ou é inválido.</p>
				</div>

				<div className="px-8 py-6">
					<ErrorBanner message={error} />
				</div>

				<div className="px-8 pb-8 border-t border-border pt-5">
					<Button variant="outline" className="w-full h-11 text-sm" onClick={() => onNavigate({ to: forgotPasswordPath })}>
						Solicitar Novo Link
					</Button>
				</div>
			</div>
		)
	}

	// ── Reset form ────────────────────────────────────────────────────────────
	return (
		<div className="border border-border bg-card">
			<div className="px-8 pt-8 pb-6 border-b border-border">
				<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
					Redefinir Senha
				</h2>
				<p className="text-sm text-muted-foreground mt-1">Digite sua nova senha segura.</p>
			</div>

			<form onSubmit={handleSubmit}>
				<div className="px-8 py-6 space-y-5">
					{error && <ErrorBanner message={error} />}

					{/* New password */}
					<div className="space-y-2">
						<Label htmlFor="new-password" className={LABEL} style={LABEL_TRACKING}>
							Nova Senha
						</Label>
						<div className="relative">
							<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="new-password"
								type={showPassword ? "text" : "password"}
								placeholder="Mínimo 6 caracteres"
								className={cn("h-11 pl-9 pr-10", passwordError && "border-destructive focus-visible:border-destructive")}
								value={newPassword}
								onChange={handlePasswordChange}
								required
								minLength={6}
								autoComplete="new-password"
								disabled={isSubmitting}
								aria-invalid={!!passwordError}
								aria-describedby={passwordError ? "pw-error" : undefined}
							/>
							{/* Toggle de visibilidade — ação de ícone */}
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								onClick={() => setShowPassword(!showPassword)}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
							>
								{showPassword ? <EyeClosed className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
							</Button>
						</div>
						{passwordError && <FieldError id="pw-error">{passwordError}</FieldError>}
					</div>

					{/* Confirm password */}
					<div className="space-y-2">
						<Label htmlFor="confirm-password" className={LABEL} style={LABEL_TRACKING}>
							Confirmar Nova Senha
						</Label>
						<div className="relative">
							<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="confirm-password"
								type={showConfirmPassword ? "text" : "password"}
								placeholder="Repita a senha"
								className={cn("h-11 pl-9 pr-10", confirmError && "border-destructive focus-visible:border-destructive")}
								value={confirmPassword}
								onChange={handleConfirmChange}
								required
								minLength={6}
								autoComplete="new-password"
								disabled={isSubmitting}
								aria-invalid={!!confirmError}
								aria-describedby={confirmError ? "confirm-error" : undefined}
							/>
							{/* Toggle de visibilidade — ação de ícone */}
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								onClick={() => setShowConfirmPassword(!showConfirmPassword)}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
							>
								{showConfirmPassword ? <EyeClosed className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
							</Button>
						</div>
						{confirmError && <FieldError id="confirm-error">{confirmError}</FieldError>}
					</div>
				</div>

				<div className="px-8 pb-8 border-t border-border pt-5">
					<Button type="submit" className="w-full h-11 text-sm" disabled={isSubmitting || !!passwordError || !!confirmError || !newPassword}>
						{isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
						{isSubmitting ? "Atualizando..." : "Atualizar Senha"}
					</Button>
				</div>
			</form>
		</div>
	)
}
