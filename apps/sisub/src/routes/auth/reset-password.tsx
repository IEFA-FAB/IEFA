import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Input,
	Label,
} from "@iefa/ui"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react"
import { useEffect, useState } from "react"
import supabase from "@/lib/supabase"

export const Route = createFileRoute("/auth/reset-password")({
	component: ResetPasswordPage,
})

function ResetPasswordPage() {
	const router = useRouter()

	const [newPassword, setNewPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirmPassword, setShowConfirmPassword] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState("")
	const [passwordError, setPasswordError] = useState("")
	const [confirmError, setConfirmError] = useState("")
	const [isVerifying, setIsVerifying] = useState(true)
	const [isRecoveryMode, setIsRecoveryMode] = useState(false)

	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "PASSWORD_RECOVERY") {
				setIsRecoveryMode(true)
				setIsVerifying(false)
			} else if (event === "SIGNED_IN" && session) {
				setIsRecoveryMode(true)
				setIsVerifying(false)
			}
		})

		const checkSession = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession()
			if (session) {
				setIsRecoveryMode(true)
			}
			setIsVerifying(false)
		}

		const timer = setTimeout(() => {
			checkSession()
		}, 1500)

		return () => {
			subscription.unsubscribe()
			clearTimeout(timer)
		}
	}, [])

	const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value
		setNewPassword(value)
		setError("")
		setPasswordError("")

		if (value && value.length < 6) {
			setPasswordError("A senha deve ter pelo menos 6 caracteres.")
		}

		if (confirmPassword && value !== confirmPassword) {
			setConfirmError("As senhas não coincidem.")
		} else {
			setConfirmError("")
		}
	}

	const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value
		setConfirmPassword(value)
		setConfirmError("")

		if (value && value !== newPassword) {
			setConfirmError("As senhas não coincidem.")
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (newPassword.length < 6) {
			setPasswordError("A senha deve ter pelo menos 6 caracteres.")
			return
		}

		if (newPassword !== confirmPassword) {
			setConfirmError("As senhas não coincidem.")
			return
		}

		setIsSubmitting(true)
		setError("")

		try {
			const { error: updateError } = await supabase.auth.updateUser({
				password: newPassword,
			})

			if (updateError) throw updateError

			await supabase.auth.signOut()

			router.navigate({ to: "/auth", search: { tab: "login" } })
			alert("Senha atualizada com sucesso! Faça login com sua nova senha.")
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Erro ao atualizar senha. Tente novamente."
			setError(errorMsg)
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleBackToAuth = () => {
		router.navigate({ to: "/auth" })
	}

	const cardClasses =
		"w-full max-w-2xl justify-self-center border shadow-2xl rounded-3xl overflow-hidden bg-card text-card-foreground"
	const inputClasses =
		"bg-background border-input hover:bg-accent/5 focus:border-primary/50 focus:ring-primary/20 h-12 rounded-xl transition-all text-base"
	const buttonClasses =
		"w-full rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 h-12 text-base transition-all hover:-translate-y-0.5"
	const labelClasses = "text-muted-foreground font-medium ml-1 text-sm"
	const iconClasses =
		"absolute left-4 top-4 h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors"

	if (isVerifying) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4">
				<Card className={cardClasses}>
					<CardContent className="flex flex-col items-center justify-center py-12 gap-4">
						<Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
						<span>Verificando link de recuperação...</span>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (!isRecoveryMode) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4">
				<Card className={cardClasses}>
					<CardHeader className="text-center space-y-3 pb-4 pt-8">
						<CardTitle className="text-3xl font-bold tracking-tight">Link Inválido</CardTitle>
						<CardDescription className="text-muted-foreground text-base">
							O link de recuperação de senha expirou ou é inválido.
						</CardDescription>
					</CardHeader>

					<CardContent className="px-8">
						<Alert
							variant="destructive"
							className="bg-destructive/10 border-destructive/20 text-destructive"
						>
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>
								Por favor, solicite uma nova recuperação de senha.
							</AlertDescription>
						</Alert>
					</CardContent>

					<CardFooter className="px-8 pb-8 pt-4">
						<Button
							variant="ghost"
							type="button"
							className="w-full rounded-full text-muted-foreground hover:text-foreground hover:bg-accent h-10"
							onClick={handleBackToAuth}
						>
							Voltar ao Login
						</Button>
					</CardFooter>
				</Card>
			</div>
		)
	}

	return (
		<div className="min-h-screen flex items-center justify-center p-4">
			<Card className={cardClasses}>
				<CardHeader className="text-center space-y-3 pb-4 pt-8">
					<CardTitle className="text-3xl font-bold tracking-tight">Redefinir Senha</CardTitle>
					<CardDescription className="text-muted-foreground text-base">
						Digite sua nova senha segura.
					</CardDescription>
				</CardHeader>

				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-6 px-8">
						{error && (
							<Alert
								variant="destructive"
								className="bg-destructive/10 border-destructive/20 text-destructive"
							>
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						<div className="space-y-2.5">
							<Label htmlFor="new-password" className={labelClasses}>
								Nova Senha
							</Label>
							<div className="relative group">
								<Lock className={iconClasses} aria-hidden="true" />
								<Input
									id="new-password"
									type={showPassword ? "text" : "password"}
									placeholder="Mínimo 6 caracteres"
									className={`${inputClasses} pl-11 pr-11 ${passwordError ? "border-destructive focus-visible:ring-destructive" : ""}`}
									value={newPassword}
									onChange={handlePasswordChange}
									required
									minLength={6}
									autoComplete="new-password"
									disabled={isSubmitting}
									aria-invalid={!!passwordError}
									aria-describedby={passwordError ? "password-error" : undefined}
								/>
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
									aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
								>
									{showPassword ? (
										<EyeOff className="h-4 w-4" aria-hidden="true" />
									) : (
										<Eye className="h-4 w-4" aria-hidden="true" />
									)}
								</button>
							</div>
							{passwordError && (
								<p
									id="password-error"
									role="alert"
									className="text-sm text-destructive mt-1 flex items-center"
								>
									<AlertCircle className="h-3 w-3 mr-1" aria-hidden="true" />
									{passwordError}
								</p>
							)}
						</div>

						<div className="space-y-2.5">
							<Label htmlFor="confirm-password" className={labelClasses}>
								Confirmar Nova Senha
							</Label>
							<div className="relative group">
								<Lock className={iconClasses} aria-hidden="true" />
								<Input
									id="confirm-password"
									type={showConfirmPassword ? "text" : "password"}
									placeholder="Digite a senha novamente"
									className={`${inputClasses} pl-11 pr-11 ${confirmError ? "border-destructive focus-visible:ring-destructive" : ""}`}
									value={confirmPassword}
									onChange={handleConfirmPasswordChange}
									required
									minLength={6}
									autoComplete="new-password"
									disabled={isSubmitting}
									aria-invalid={!!confirmError}
									aria-describedby={confirmError ? "confirm-error" : undefined}
								/>
								<button
									type="button"
									onClick={() => setShowConfirmPassword(!showConfirmPassword)}
									className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
									aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
								>
									{showConfirmPassword ? (
										<EyeOff className="h-4 w-4" aria-hidden="true" />
									) : (
										<Eye className="h-4 w-4" aria-hidden="true" />
									)}
								</button>
							</div>
							{confirmError && (
								<p
									id="confirm-error"
									role="alert"
									className="text-sm text-destructive mt-1 flex items-center"
								>
									<AlertCircle className="h-3 w-3 mr-1" aria-hidden="true" />
									{confirmError}
								</p>
							)}
						</div>
					</CardContent>

					<CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-2">
						<Button
							type="submit"
							className={buttonClasses}
							disabled={isSubmitting || !!passwordError || !!confirmError || !newPassword}
						>
							{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
							{isSubmitting ? "Atualizando..." : "Atualizar Senha"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	)
}
