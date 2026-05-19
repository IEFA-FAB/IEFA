import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react"
import { useEffect, useReducer } from "react"
import { useLoginRateLimiter } from "@/auth/rate-limiter"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// ─── Reducer ─────────────────────────────────────────────────────────────────

type AuthScreenState = {
	currentView: AuthView
	activeTab: string
	isSubmitting: boolean
	error: string
	successMessage: string
	showPassword: boolean
	loginEmail: string
	loginPassword: string
	rememberMe: boolean
	emailError: string
	passwordError: string
	registerData: { name: string; email: string; password: string; confirm: string }
	registerEmailError: string
	forgotEmail: string
	newPassword: string
}

type AuthScreenAction =
	| { type: "SET_VIEW"; value: AuthView }
	| { type: "SET_TAB"; value: string }
	| { type: "SET_SUBMITTING"; value: boolean }
	| { type: "SET_ERROR"; value: string }
	| { type: "SET_SUCCESS_MESSAGE"; value: string }
	| { type: "TOGGLE_SHOW_PASSWORD" }
	| { type: "SET_LOGIN_EMAIL"; value: string }
	| { type: "SET_LOGIN_PASSWORD"; value: string }
	| { type: "SET_REMEMBER_ME"; value: boolean }
	| { type: "SET_EMAIL_ERROR"; value: string }
	| { type: "SET_PASSWORD_ERROR"; value: string }
	| { type: "SET_REGISTER_DATA"; value: Partial<AuthScreenState["registerData"]> }
	| { type: "SET_REGISTER_EMAIL_ERROR"; value: string }
	| { type: "SET_FORGOT_EMAIL"; value: string }
	| { type: "SET_NEW_PASSWORD"; value: string }
	| { type: "CLEAR_MESSAGES" }

function authScreenReducer(state: AuthScreenState, action: AuthScreenAction): AuthScreenState {
	switch (action.type) {
		case "SET_VIEW":
			return { ...state, currentView: action.value }
		case "SET_TAB":
			return { ...state, activeTab: action.value }
		case "SET_SUBMITTING":
			return { ...state, isSubmitting: action.value }
		case "SET_ERROR":
			return { ...state, error: action.value }
		case "SET_SUCCESS_MESSAGE":
			return { ...state, successMessage: action.value }
		case "TOGGLE_SHOW_PASSWORD":
			return { ...state, showPassword: !state.showPassword }
		case "SET_LOGIN_EMAIL":
			return { ...state, loginEmail: action.value }
		case "SET_LOGIN_PASSWORD":
			return { ...state, loginPassword: action.value }
		case "SET_REMEMBER_ME":
			return { ...state, rememberMe: action.value }
		case "SET_EMAIL_ERROR":
			return { ...state, emailError: action.value }
		case "SET_PASSWORD_ERROR":
			return { ...state, passwordError: action.value }
		case "SET_REGISTER_DATA":
			return { ...state, registerData: { ...state.registerData, ...action.value } }
		case "SET_REGISTER_EMAIL_ERROR":
			return { ...state, registerEmailError: action.value }
		case "SET_FORGOT_EMAIL":
			return { ...state, forgotEmail: action.value }
		case "SET_NEW_PASSWORD":
			return { ...state, newPassword: action.value }
		case "CLEAR_MESSAGES":
			return { ...state, error: "", successMessage: "", emailError: "", passwordError: "", registerEmailError: "" }
		default:
			return state
	}
}

// FAB Email validation regex
const FAB_EMAIL_REGEX = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/
const STORAGE_KEY_REMEMBER_EMAIL = "fab_remember_email"

// Normalize email: trim and lowercase
function normalizeEmail(email: string) {
	return email.trim().toLowerCase()
}

function getPasswordError(v: string): string | null {
	if (v.length < 8) return "Mínimo de 8 caracteres."
	if (!/[a-z]/.test(v)) return "Inclua pelo menos uma letra minúscula."
	if (!/[A-Z]/.test(v)) return "Inclua pelo menos uma letra maiúscula."
	if (!/\d/.test(v)) return "Inclua pelo menos um número."
	return null
}

// Safe redirect utility (moved from app)
function safeRedirect(target: string | null | undefined, fallback = "/"): string {
	if (!target) return fallback
	let decoded = target
	try {
		decoded = decodeURIComponent(target)
	} catch {}
	if (decoded.startsWith("/") && !decoded.startsWith("//")) {
		return decoded
	}
	return fallback
}

export type AuthView = "auth" | "forgot" | "reset"

export interface AuthScreenProps {
	// State
	isLoading: boolean
	isAuthenticated: boolean

	// Navigation / Search Params
	searchParams: {
		redirect?: string
		tab?: "login" | "register"
		token_hash?: string
		type?: string
	}
	onNavigate: (options: { to?: string; search?: Record<string, unknown>; replace?: boolean }) => Promise<void> | void
	onTabChange?: (tab: "login" | "register") => void

	// Actions
	actions: {
		signIn: (email: string, password: string) => Promise<void>
		signUp: (email: string, password: string, name: string) => Promise<void>
		resetPassword: (email: string) => Promise<void>
		updateUserPassword: (password: string) => Promise<{ error: Error | null }>
		verifyOtp: (token_hash: string, type: "email") => Promise<{ error: Error | null }>
	}
}

export function AuthScreen({ isLoading, isAuthenticated, searchParams, onNavigate, onTabChange, actions }: AuthScreenProps) {
	// --- RATE LIMITER ---
	const { isLocked, retryAfter, onFailure, onSuccess } = useLoginRateLimiter()

	const [authState, dispatch] = useReducer(authScreenReducer, {
		currentView: searchParams.token_hash ? "reset" : "auth",
		activeTab: searchParams.tab || "login",
		isSubmitting: false,
		error: "",
		successMessage: "",
		showPassword: false,
		loginEmail: "",
		loginPassword: "",
		rememberMe: false,
		emailError: "",
		passwordError: "",
		registerData: { name: "", email: "", password: "", confirm: "" },
		registerEmailError: "",
		forgotEmail: "",
		newPassword: "",
	})
	const {
		currentView,
		activeTab,
		isSubmitting,
		error,
		successMessage,
		showPassword,
		loginEmail,
		loginPassword,
		rememberMe,
		emailError,
		passwordError,
		registerData,
		registerEmailError,
		forgotEmail,
		newPassword,
	} = authState

	// Carrega email salvo (remember me) ao montar
	useEffect(() => {
		const savedEmail = localStorage.getItem(STORAGE_KEY_REMEMBER_EMAIL)
		if (savedEmail) {
			dispatch({ type: "SET_LOGIN_EMAIL", value: savedEmail })
			dispatch({ type: "SET_REMEMBER_ME", value: true })
		}
	}, [])

	// Redireciona se já estiver autenticado
	useEffect(() => {
		if (!isLoading && isAuthenticated) {
			const target = safeRedirect(searchParams.redirect, "/")
			onNavigate({ to: target, replace: true })
		}
	}, [isAuthenticated, isLoading, searchParams.redirect, onNavigate])

	// Sincroniza a Tab com a URL
	const handleTabChange = (value: string) => {
		dispatch({ type: "SET_TAB", value })
		dispatch({ type: "SET_ERROR", value: "" })
		dispatch({ type: "SET_SUCCESS_MESSAGE", value: "" })
		if (onTabChange) {
			onTabChange(value as "login" | "register")
		}
	}

	// Troca de visualização (Login <-> Esqueci Senha)
	const switchView = (view: AuthView) => {
		dispatch({ type: "CLEAR_MESSAGES" })
		dispatch({ type: "SET_VIEW", value: view })
	}

	// --- HANDLERS ---

	const handleLoginEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const email = e.target.value
		dispatch({ type: "SET_LOGIN_EMAIL", value: email })
		dispatch({ type: "SET_ERROR", value: "" })
		dispatch({ type: "SET_EMAIL_ERROR", value: "" })

		const normalized = normalizeEmail(email)
		if (email && !FAB_EMAIL_REGEX.test(normalized)) {
			dispatch({ type: "SET_EMAIL_ERROR", value: "Use seu email institucional @fab.mil.br (sem caracteres especiais)." })
		}
	}

	const handleLoginPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		dispatch({ type: "SET_LOGIN_PASSWORD", value: e.target.value })
		dispatch({ type: "SET_ERROR", value: "" })
		dispatch({ type: "SET_PASSWORD_ERROR", value: "" })
	}

	const handleRememberMeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked
		dispatch({ type: "SET_REMEMBER_ME", value: checked })

		const normalized = normalizeEmail(loginEmail)
		if (checked && loginEmail && FAB_EMAIL_REGEX.test(normalized)) {
			localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, normalized)
		} else {
			localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL)
		}
	}

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault()
		if (isLocked) return

		const normalized = normalizeEmail(loginEmail)

		// Validação local
		if (!FAB_EMAIL_REGEX.test(normalized)) {
			dispatch({ type: "SET_EMAIL_ERROR", value: "Email inválido. Use seu email @fab.mil.br (sem caracteres especiais)." })
			return
		}

		if (!loginPassword) {
			dispatch({ type: "SET_PASSWORD_ERROR", value: "Informe a senha." })
			return
		}

		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })
		dispatch({ type: "SET_EMAIL_ERROR", value: "" })
		dispatch({ type: "SET_PASSWORD_ERROR", value: "" })

		try {
			await actions.signIn(normalized, loginPassword)
			onSuccess()

			// Persistência do email conforme "Lembrar email"
			if (rememberMe) {
				localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, normalized)
			} else {
				localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL)
			}

			// Redireciona após login
			const target = safeRedirect(searchParams.redirect, "/")
			await onNavigate({ to: target, replace: true })
		} catch (err) {
			onFailure()
			const errorMsg = err instanceof Error ? err.message : "Erro desconhecido"
			// Tratamento de erros específicos
			if (errorMsg.includes("Email ou senha incorretos") || errorMsg.includes("Invalid login credentials")) {
				dispatch({ type: "SET_PASSWORD_ERROR", value: "Senha incorreta ou email não cadastrado" })
			} else {
				dispatch({ type: "SET_ERROR", value: errorMsg || "Ocorreu um erro durante a autenticação. Tente mais tarde." })
			}
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	const handleRegisterEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const email = e.target.value
		dispatch({ type: "SET_REGISTER_DATA", value: { email } })
		dispatch({ type: "SET_ERROR", value: "" })
		dispatch({ type: "SET_REGISTER_EMAIL_ERROR", value: "" })

		const normalized = normalizeEmail(email)
		if (email && !FAB_EMAIL_REGEX.test(normalized)) {
			dispatch({ type: "SET_REGISTER_EMAIL_ERROR", value: "Use seu email institucional @fab.mil.br (sem caracteres especiais)." })
		}
	}

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault()

		const normalized = normalizeEmail(registerData.email)

		// Validação local
		if (!FAB_EMAIL_REGEX.test(normalized)) {
			dispatch({ type: "SET_REGISTER_EMAIL_ERROR", value: "Email inválido. Use seu email @fab.mil.br (sem caracteres especiais)." })
			return
		}

		const regPwErr = getPasswordError(registerData.password)
		if (regPwErr) {
			dispatch({ type: "SET_ERROR", value: regPwErr })
			return
		}

		if (registerData.password !== registerData.confirm) {
			dispatch({ type: "SET_ERROR", value: "As senhas não coincidem." })
			return
		}

		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })
		dispatch({ type: "SET_REGISTER_EMAIL_ERROR", value: "" })

		try {
			await actions.signUp(normalized, registerData.password, registerData.name)
			dispatch({ type: "SET_SUCCESS_MESSAGE", value: "Conta criada! Verifique seu email." })
			handleTabChange("login")
			dispatch({ type: "SET_LOGIN_EMAIL", value: normalized })
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Erro ao criar conta."
			dispatch({ type: "SET_ERROR", value: errorMsg })
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	const handleForgotPassword = async (e: React.FormEvent) => {
		e.preventDefault()

		const normalized = normalizeEmail(forgotEmail)

		if (!FAB_EMAIL_REGEX.test(normalized)) {
			dispatch({ type: "SET_ERROR", value: "Email inválido. Use seu email @fab.mil.br (sem caracteres especiais)." })
			return
		}

		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })

		try {
			await actions.resetPassword(normalized)
			dispatch({ type: "SET_SUCCESS_MESSAGE", value: "Email de recuperação enviado! Verifique sua caixa de entrada." })
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Erro ao enviar email."
			dispatch({ type: "SET_ERROR", value: errorMsg })
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	const handleResetPassword = async (e: React.FormEvent) => {
		e.preventDefault()

		const resetPwErr = getPasswordError(newPassword)
		if (resetPwErr) {
			dispatch({ type: "SET_ERROR", value: resetPwErr })
			return
		}

		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })

		try {
			const { error } = await actions.updateUserPassword(newPassword)
			if (error) throw error
			alert("Senha atualizada com sucesso!")
			await onNavigate({ to: "/" })
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Erro ao atualizar senha."
			dispatch({ type: "SET_ERROR", value: errorMsg })
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	// Verifica validade do token de reset ao montar, se estiver na view de reset
	useEffect(() => {
		if (currentView === "reset" && searchParams.token_hash && searchParams.type === "email") {
			const tokenHash = searchParams.token_hash
			const verifyOtp = async () => {
				const { error } = await actions.verifyOtp(tokenHash, "email")
				if (error) {
					dispatch({ type: "SET_ERROR", value: "Link inválido ou expirado. Solicite uma nova recuperação." })
				}
			}
			verifyOtp()
		}
	}, [currentView, searchParams.token_hash, searchParams.type, actions])

	// --- COMMON STYLES ---
	const cardClasses = "w-full max-w-2xl justify-self-center border shadow-2xl rounded-3xl overflow-hidden bg-card text-card-foreground"
	const inputClasses = "bg-background border-input hover:bg-accent/5 focus:border-primary/50 focus:ring-primary/20 h-12 rounded-xl transition-all text-base"
	const buttonClasses = "w-full rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 h-12 text-base transition-all hover:-translate-y-0.5"
	const labelClasses = "text-muted-foreground font-medium ml-1 text-sm"
	const iconClasses = "absolute left-4 top-4 size-4 text-muted-foreground group-hover:text-foreground transition-colors"

	// Loading state during auth check
	if (isLoading) {
		return (
			<Card className={cardClasses}>
				<CardContent className="flex items-center justify-center py-12">
					<Loader2 className="size-8 animate-spin mr-2" />
					<span>Verificando autenticação...</span>
				</CardContent>
			</Card>
		)
	}

	// 1. VIEW: RESET PASSWORD (Token na URL)
	if (currentView === "reset") {
		return (
			<Card className={cardClasses}>
				<CardHeader className="text-center space-y-3 pb-4 pt-8">
					<CardTitle className="text-3xl font-bold tracking-tight">Nova Senha</CardTitle>
					<CardDescription className="text-muted-foreground text-base">Defina sua nova senha segura.</CardDescription>
				</CardHeader>
				<form onSubmit={handleResetPassword}>
					<CardContent className="space-y-6 px-8">
						{error && (
							<Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
								<AlertCircle className="size-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<div className="space-y-2.5">
							<Label className={labelClasses}>Nova Senha</Label>
							<div className="relative group">
								<Lock className={iconClasses} />
								<Input
									type="password"
									className={`${inputClasses} pl-11`}
									value={newPassword}
									onChange={(e) => dispatch({ type: "SET_NEW_PASSWORD", value: e.target.value })}
									required
									minLength={8}
									placeholder="Mínimo 8 caracteres"
									autoComplete="new-password"
								/>
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-2">
						<Button type="submit" className={buttonClasses} disabled={isSubmitting}>
							{isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
							Atualizar Senha
						</Button>
						<Button
							variant="ghost"
							type="button"
							className="w-full rounded-full text-muted-foreground hover:text-foreground hover:bg-accent h-10"
							onClick={() => switchView("auth")}
						>
							Voltar ao Login
						</Button>
					</CardFooter>
				</form>
			</Card>
		)
	}

	// 2. VIEW: FORGOT PASSWORD
	if (currentView === "forgot") {
		return (
			<Card className={cardClasses}>
				<CardHeader className="text-center space-y-3 pb-4 pt-8">
					<CardTitle className="text-3xl font-bold tracking-tight">Recuperar Senha</CardTitle>
					<CardDescription className="text-muted-foreground text-base">Digite seu email para receber um link de redefinição.</CardDescription>
				</CardHeader>
				<form onSubmit={handleForgotPassword}>
					<CardContent className="space-y-6 px-8">
						{error && (
							<Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
								<AlertCircle className="size-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						{successMessage && (
							<Alert className="bg-success/10 border-success/20 text-success">
								<CheckCircle2 className="size-4" />
								<AlertDescription>{successMessage}</AlertDescription>
							</Alert>
						)}
						<div className="space-y-2.5">
							<Label className={labelClasses}>Email</Label>
							<div className="relative group">
								<Mail className={iconClasses} />
								<Input
									type="email"
									placeholder="seu.nome@fab.mil.br"
									className={`${inputClasses} pl-11`}
									value={forgotEmail}
									onChange={(e) => dispatch({ type: "SET_FORGOT_EMAIL", value: e.target.value })}
									required
									autoComplete="email"
								/>
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-8">
						<Button type="submit" className={buttonClasses} disabled={isSubmitting}>
							{isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
							Enviar Link
						</Button>
						<Button
							variant="ghost"
							type="button"
							className="w-full rounded-full text-muted-foreground hover:text-foreground hover:bg-accent h-10"
							onClick={() => switchView("auth")}
						>
							<ArrowLeft className="mr-2 size-4" />
							Voltar ao Login
						</Button>
					</CardFooter>
				</form>
			</Card>
		)
	}

	// 3. VIEW: AUTH (LOGIN & REGISTER TABS)
	return (
		<div className="w-full max-w-2xl mx-auto animate-fade-in-up">
			<Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
				{/* sempre deve ser passado o tipo dark para que o componente funcione corretamente */}
				<TabsList className="grid w-full grid-cols-2 mb-8 bg-muted p-1.5 rounded-full h-14">
					<TabsTrigger
						value="login"
						className="rounded-full h-full text-base font-medium data-active:bg-background data-active:text-foreground data-active:shadow-md transition-all duration-300"
					>
						Entrar
					</TabsTrigger>
					<TabsTrigger
						value="register"
						className="rounded-full h-full text-base font-medium data-active:bg-background data-active:text-foreground data-active:shadow-md transition-all duration-300"
					>
						Cadastrar
					</TabsTrigger>
				</TabsList>

				{/* --- LOGIN TAB --- */}
				<TabsContent value="login" className="w-full mt-0">
					<Card className={cardClasses}>
						<CardHeader className="space-y-3 text-center pb-4 pt-8">
							<CardTitle className="text-3xl font-bold tracking-tight">Bem-vindo de volta</CardTitle>
							<CardDescription className="text-muted-foreground text-base">Acesso restrito a emails @fab.mil.br</CardDescription>
						</CardHeader>

						<form onSubmit={handleLogin}>
							<CardContent className="space-y-6 px-8">
								{isLocked && (
									<Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
										<AlertCircle className="size-4" />
										<AlertDescription>Muitas tentativas. Tente novamente em {retryAfter}s.</AlertDescription>
									</Alert>
								)}
								{error && !isLocked && (
									<Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
										<AlertCircle className="size-4" />
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}
								{successMessage && (
									<Alert className="bg-success/10 border-success/20 text-success">
										<CheckCircle2 className="size-4" />
										<AlertDescription>{successMessage}</AlertDescription>
									</Alert>
								)}

								<div className="space-y-2.5">
									<Label htmlFor="email" className={labelClasses}>
										Email Institucional
									</Label>
									<div className="relative group">
										<Mail className={iconClasses} />
										<Input
											type="email"
											placeholder="seu.nome@fab.mil.br"
											className={`${inputClasses} pl-11 ${emailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
											value={loginEmail}
											onChange={handleLoginEmailChange}
											required
											autoComplete="username"
											disabled={isSubmitting}
										/>
									</div>
									{emailError && (
										<p className="text-sm text-destructive mt-1 flex items-center">
											<AlertCircle className="size-3 mr-1" />
											{emailError}
										</p>
									)}
								</div>

								<div className="space-y-2.5">
									<div className="flex items-center justify-between">
										<Label htmlFor="password" className={labelClasses}>
											Senha
										</Label>
										<button
											type="button"
											onClick={() => switchView("forgot")}
											className="text-xs text-primary hover:text-primary/80 hover:underline focus:outline-none transition-colors"
										>
											Esqueceu a senha?
										</button>
									</div>
									<div className="relative group">
										<Lock className={iconClasses} />
										<Input
											type={showPassword ? "text" : "password"}
											placeholder="••••••••"
											className={`${inputClasses} pl-11 pr-11 ${passwordError ? "border-destructive focus-visible:ring-destructive" : ""}`}
											value={loginPassword}
											onChange={handleLoginPasswordChange}
											required
											autoComplete="current-password"
											disabled={isSubmitting}
										/>
										<button
											type="button"
											onClick={() => dispatch({ type: "TOGGLE_SHOW_PASSWORD" })}
											className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
										>
											{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
										</button>
									</div>
									{passwordError && (
										<p className="text-sm text-destructive mt-1 flex items-center">
											<AlertCircle className="size-3 mr-1" />
											{passwordError}
										</p>
									)}
								</div>

								<div className="flex items-center space-x-2">
									<input
										id="remember"
										type="checkbox"
										checked={rememberMe}
										onChange={handleRememberMeChange}
										className="rounded border-input bg-background accent-primary"
										disabled={isSubmitting}
									/>
									<Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
										Lembrar email
									</Label>
								</div>
							</CardContent>

							<CardFooter className="pb-8 px-8 pt-8">
								<Button type="submit" className={buttonClasses} disabled={isSubmitting || isLocked || !!emailError || !!passwordError}>
									{isLocked ? (
										`Bloqueado (${retryAfter}s)`
									) : (
										<>
											{isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
											{isSubmitting ? "Entrando..." : "Entrar"}
										</>
									)}
								</Button>
							</CardFooter>
						</form>
					</Card>
				</TabsContent>

				{/* --- REGISTER TAB --- */}
				<TabsContent value="register" className="mt-0">
					<Card className={cardClasses}>
						<CardHeader className="text-center pb-4 pt-8 space-y-3">
							<CardTitle className="text-3xl font-bold tracking-tight">Criar conta</CardTitle>
							<CardDescription className="text-muted-foreground text-base">Acesso restrito a emails @fab.mil.br</CardDescription>
						</CardHeader>
						<form onSubmit={handleRegister}>
							<CardContent className="space-y-6 px-8">
								{error && (
									<Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
										<AlertCircle className="size-4" />
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}
								<div className="space-y-2.5">
									<Label className={labelClasses}>Nome</Label>
									<div className="relative group">
										<User className={iconClasses} />
										<Input
											placeholder="Seu nome"
											className={`${inputClasses} pl-11`}
											value={registerData.name}
											onChange={(e) => dispatch({ type: "SET_REGISTER_DATA", value: { name: e.target.value } })}
											required
											autoComplete="name"
											disabled={isSubmitting}
										/>
									</div>
								</div>
								<div className="space-y-2.5">
									<Label className={labelClasses}>Email Institucional</Label>
									<div className="relative group">
										<Mail className={iconClasses} />
										<Input
											type="email"
											placeholder="seu.nome@fab.mil.br"
											className={`${inputClasses} pl-11 ${registerEmailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
											value={registerData.email}
											onChange={handleRegisterEmailChange}
											required
											autoComplete="email"
											disabled={isSubmitting}
										/>
									</div>
									{registerEmailError && (
										<p className="text-sm text-destructive mt-1 flex items-center">
											<AlertCircle className="size-3 mr-1" />
											{registerEmailError}
										</p>
									)}
								</div>
								<div className="space-y-2.5">
									<Label className={labelClasses}>Senha</Label>
									<div className="relative group">
										<Lock className={iconClasses} />
										<Input
											type="password"
											placeholder="••••••••"
											className={`${inputClasses} pl-11`}
											value={registerData.password}
											onChange={(e) => dispatch({ type: "SET_REGISTER_DATA", value: { password: e.target.value } })}
											required
											minLength={8}
											autoComplete="new-password"
											disabled={isSubmitting}
										/>
									</div>
								</div>
								<div className="space-y-2.5">
									<Label className={labelClasses}>Confirmar Senha</Label>
									<div className="relative group">
										<Lock className={iconClasses} />
										<Input
											type="password"
											placeholder="••••••••"
											className={`${inputClasses} pl-11`}
											value={registerData.confirm}
											onChange={(e) => dispatch({ type: "SET_REGISTER_DATA", value: { confirm: e.target.value } })}
											required
											autoComplete="new-password"
											disabled={isSubmitting}
										/>
									</div>
								</div>
							</CardContent>
							<CardFooter className="pb-8 px-8 pt-8">
								<Button type="submit" className={buttonClasses} disabled={isSubmitting || !!registerEmailError}>
									{isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
									{isSubmitting ? "Criando..." : "Criar conta"}
								</Button>
							</CardFooter>
						</form>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	)
}
