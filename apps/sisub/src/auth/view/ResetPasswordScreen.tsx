import { AlertCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react"
import { useEffect, useReducer } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/cn"

// ─── Reducer ─────────────────────────────────────────────────────────────────

type ResetPasswordState = {
	newPassword: string
	confirmPassword: string
	showPassword: boolean
	showConfirmPassword: boolean
	isSubmitting: boolean
	submitError: string
	passwordError: string
	confirmError: string
	verifyState: { isVerifying: boolean; isValid: boolean; error: string }
}

type ResetPasswordAction =
	| { type: "SET_NEW_PASSWORD"; value: string }
	| { type: "SET_CONFIRM_PASSWORD"; value: string }
	| { type: "TOGGLE_SHOW_PASSWORD" }
	| { type: "TOGGLE_SHOW_CONFIRM_PASSWORD" }
	| { type: "SET_SUBMITTING"; value: boolean }
	| { type: "SET_SUBMIT_ERROR"; value: string }
	| { type: "SET_PASSWORD_ERROR"; value: string }
	| { type: "SET_CONFIRM_ERROR"; value: string }
	| { type: "CLEAR_ERRORS" }
	| { type: "SET_VERIFY_STATE"; value: { isVerifying: boolean; isValid: boolean; error: string } }

const initialResetPasswordState: ResetPasswordState = {
	newPassword: "",
	confirmPassword: "",
	showPassword: false,
	showConfirmPassword: false,
	isSubmitting: false,
	submitError: "",
	passwordError: "",
	confirmError: "",
	verifyState: { isVerifying: true, isValid: false, error: "" },
}

function resetPasswordReducer(state: ResetPasswordState, action: ResetPasswordAction): ResetPasswordState {
	switch (action.type) {
		case "SET_NEW_PASSWORD":
			return { ...state, newPassword: action.value }
		case "SET_CONFIRM_PASSWORD":
			return { ...state, confirmPassword: action.value }
		case "TOGGLE_SHOW_PASSWORD":
			return { ...state, showPassword: !state.showPassword }
		case "TOGGLE_SHOW_CONFIRM_PASSWORD":
			return { ...state, showConfirmPassword: !state.showConfirmPassword }
		case "SET_SUBMITTING":
			return { ...state, isSubmitting: action.value }
		case "SET_SUBMIT_ERROR":
			return { ...state, submitError: action.value }
		case "SET_PASSWORD_ERROR":
			return { ...state, passwordError: action.value }
		case "SET_CONFIRM_ERROR":
			return { ...state, confirmError: action.value }
		case "CLEAR_ERRORS":
			return { ...state, submitError: "", passwordError: "", confirmError: "" }
		case "SET_VERIFY_STATE":
			return { ...state, verifyState: action.value }
		default:
			return state
	}
}

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

export function ResetPasswordScreen({ searchParams, actions, onNavigate, forgotPasswordPath = "/auth" }: ResetPasswordScreenProps) {
	"use no memo"
	const [state, dispatch] = useReducer(resetPasswordReducer, initialResetPasswordState)
	const { newPassword, confirmPassword, showPassword, showConfirmPassword, isSubmitting, submitError, passwordError, confirmError, verifyState } = state
	const { isVerifying: isVerifyingToken, isValid: tokenValid, error: verifyError } = verifyState

	useEffect(() => {
		const verifyToken = async () => {
			if (!searchParams.token_hash || searchParams.type !== "recovery") {
				dispatch({
					type: "SET_VERIFY_STATE",
					value: { isVerifying: false, isValid: false, error: "Link inválido ou expirado. Por favor, solicite uma nova recuperação de senha." },
				})
				return
			}

			try {
				const { error: verifyErr } = await actions.verifyOtp(searchParams.token_hash, "recovery")

				if (verifyErr) {
					dispatch({
						type: "SET_VERIFY_STATE",
						value: { isVerifying: false, isValid: false, error: "Link inválido ou expirado. Por favor, solicite uma nova recuperação de senha." },
					})
				} else {
					dispatch({ type: "SET_VERIFY_STATE", value: { isVerifying: false, isValid: true, error: "" } })
				}
			} catch {
				dispatch({
					type: "SET_VERIFY_STATE",
					value: { isVerifying: false, isValid: false, error: "Erro ao verificar o link de recuperação. Tente novamente." },
				})
			}
		}

		verifyToken()
	}, [searchParams.token_hash, searchParams.type, actions])

	const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value
		dispatch({ type: "SET_NEW_PASSWORD", value })
		dispatch({ type: "SET_SUBMIT_ERROR", value: "" })
		dispatch({ type: "SET_PASSWORD_ERROR", value: "" })

		if (value && value.length < 6) {
			dispatch({ type: "SET_PASSWORD_ERROR", value: "A senha deve ter pelo menos 6 caracteres." })
		}

		if (confirmPassword && value !== confirmPassword) {
			dispatch({ type: "SET_CONFIRM_ERROR", value: "As senhas não coincidem." })
		} else {
			dispatch({ type: "SET_CONFIRM_ERROR", value: "" })
		}
	}

	const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value
		dispatch({ type: "SET_CONFIRM_PASSWORD", value })
		dispatch({ type: "SET_CONFIRM_ERROR", value: "" })

		if (value && value !== newPassword) {
			dispatch({ type: "SET_CONFIRM_ERROR", value: "As senhas não coincidem." })
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()

		if (newPassword.length < 6) {
			dispatch({ type: "SET_PASSWORD_ERROR", value: "A senha deve ter pelo menos 6 caracteres." })
			return
		}

		if (newPassword !== confirmPassword) {
			dispatch({ type: "SET_CONFIRM_ERROR", value: "As senhas não coincidem." })
			return
		}

		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "CLEAR_ERRORS" })

		const { error: updateError } = await actions.updatePassword(newPassword)

		if (updateError) {
			const errorMsg = updateError instanceof Error ? updateError.message : "Erro ao atualizar senha. Tente novamente."
			dispatch({ type: "SET_SUBMIT_ERROR", value: errorMsg })
			dispatch({ type: "SET_SUBMITTING", value: false })
			return
		}

		dispatch({ type: "SET_SUBMITTING", value: false })
		onNavigate({ to: "/auth", search: { tab: "login" } })
		alert("Senha atualizada com sucesso! Faça login com sua nova senha.")
	}

	const handleBackToForgotPassword = () => {
		onNavigate({ to: forgotPasswordPath })
	}

	const cardClasses = "w-full max-w-2xl justify-self-center border shadow-2xl rounded-3xl overflow-hidden bg-card text-card-foreground"
	const inputClasses = "bg-background border-input hover:bg-accent/5 focus:border-primary/50 focus:ring-primary/20 h-12 rounded-xl transition-all text-base"
	const buttonClasses = "w-full rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 h-12 text-base transition-all hover:-translate-y-0.5"
	const labelClasses = "text-muted-foreground font-medium ml-1 text-sm"
	const iconClasses = "absolute left-4 top-4 size-4 text-muted-foreground group-hover:text-foreground transition-colors"

	if (isVerifyingToken) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4">
				<Card className={cardClasses}>
					<CardContent className="flex flex-col items-center justify-center py-12 gap-4">
						<Loader2 className="size-8 animate-spin" aria-hidden="true" />
						<span>Verificando link de recuperação...</span>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (!tokenValid) {
		return (
			<div className="min-h-screen flex items-center justify-center p-4">
				<Card className={cardClasses}>
					<CardHeader className="text-center space-y-3 pb-4 pt-8">
						<CardTitle className="text-3xl font-bold tracking-tight">Link Inválido</CardTitle>
						<CardDescription className="text-muted-foreground text-base">O link de recuperação de senha expirou ou é inválido.</CardDescription>
					</CardHeader>

					<CardContent className="px-8">
						<Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
							<AlertCircle className="size-4" />
							<AlertDescription>{verifyError}</AlertDescription>
						</Alert>
					</CardContent>

					<CardFooter className="px-8 pb-8 pt-4">
						<Button
							variant="ghost"
							type="button"
							className="w-full rounded-full text-muted-foreground hover:text-foreground hover:bg-accent h-10"
							onClick={handleBackToForgotPassword}
						>
							Solicitar Novo Link
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
					<CardDescription className="text-muted-foreground text-base">Digite sua nova senha segura.</CardDescription>
				</CardHeader>

				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-6 px-8">
						{submitError && (
							<Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
								<AlertCircle className="size-4" />
								<AlertDescription>{submitError}</AlertDescription>
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
									className={cn(inputClasses, "pl-11 pr-11", passwordError && "border-destructive focus-visible:ring-destructive")}
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
									onClick={() => dispatch({ type: "TOGGLE_SHOW_PASSWORD" })}
									className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
									aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
								>
									{showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
								</button>
							</div>
							{passwordError && (
								<p id="password-error" role="alert" className="text-sm text-destructive mt-1 flex items-center">
									<AlertCircle className="size-3 mr-1" aria-hidden="true" />
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
									className={cn(inputClasses, "pl-11 pr-11", confirmError && "border-destructive focus-visible:ring-destructive")}
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
									onClick={() => dispatch({ type: "TOGGLE_SHOW_CONFIRM_PASSWORD" })}
									className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
									aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
								>
									{showConfirmPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
								</button>
							</div>
							{confirmError && (
								<p id="confirm-error" role="alert" className="text-sm text-destructive mt-1 flex items-center">
									<AlertCircle className="size-3 mr-1" aria-hidden="true" />
									{confirmError}
								</p>
							)}
						</div>
					</CardContent>

					<CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-2">
						<Button type="submit" className={buttonClasses} disabled={isSubmitting || !!passwordError || !!confirmError || !newPassword}>
							{isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
							{isSubmitting ? "Atualizando..." : "Atualizar Senha"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		</div>
	)
}
