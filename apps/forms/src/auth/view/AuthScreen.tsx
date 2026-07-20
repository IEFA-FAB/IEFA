import { ArrowLeft, CheckCircle, Eye, EyeClosed, Lock, Mail, Refresh, User, WarningCircle } from "iconoir-react"
import { useEffect, useReducer } from "react"
import { useLoginRateLimiter } from "@/auth/rate-limiter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { type AuthOtpType, isPasswordRecoveryLink, parseOtpType } from "@/lib/auth-otp"
import { cn } from "@/lib/utils"

const FAB_EMAIL_REGEX = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/
const STORAGE_KEY_REMEMBER_EMAIL = "fab_remember_email"

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

// view derivada da URL — "reset" ativado por token_hash, "forgot" por ?view=forgot
export type AuthView = "auth" | "forgot" | "reset"

export interface AuthScreenProps {
	searchParams: {
		redirect?: string
		tab?: "login" | "register"
		view?: "forgot"
		token_hash?: string
		type?: string
	}
	onNavigate: (options: { to?: string; href?: string; search?: Record<string, unknown>; replace?: boolean }) => Promise<void> | void
	onTabChange?: (tab: "login" | "register") => void
	// null = voltar aos tabs (remove ?view=forgot da URL, back button funciona)
	onViewChange?: (view: "forgot" | null) => void
	actions: {
		signIn: (email: string, password: string) => Promise<void>
		signUp: (email: string, password: string, name: string) => Promise<void>
		resetPassword: (email: string) => Promise<void>
		updateUserPassword: (password: string) => Promise<{ error: Error | null }>
		verifyOtp: (token_hash: string, type: AuthOtpType) => Promise<{ error: Error | null }>
	}
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type AuthState = {
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

type AuthAction =
	| { type: "SUBMITTING" }
	| { type: "SUBMITTED" }
	| { type: "SET_ERROR"; message: string }
	| { type: "SET_SUCCESS"; message: string }
	| { type: "CLEAR_FEEDBACK" }
	| { type: "TOGGLE_PASSWORD" }
	| { type: "LOGIN_EMAIL"; value: string; emailError: string }
	| { type: "LOGIN_PASSWORD"; value: string }
	| { type: "REMEMBER_ME"; value: boolean }
	| { type: "EMAIL_ERROR"; error: string }
	| { type: "PASSWORD_ERROR"; error: string }
	| { type: "REGISTER_DATA"; patch: Partial<AuthState["registerData"]>; emailError?: string }
	| { type: "REGISTER_EMAIL_ERROR"; error: string }
	| { type: "FORGOT_EMAIL"; value: string }
	| { type: "NEW_PASSWORD"; value: string }
	| { type: "INIT_EMAIL"; email: string }

const initialState: AuthState = {
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
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
	switch (action.type) {
		case "SUBMITTING":
			return { ...state, isSubmitting: true, error: "", emailError: "", passwordError: "" }
		case "SUBMITTED":
			return { ...state, isSubmitting: false }
		case "SET_ERROR":
			return { ...state, error: action.message, isSubmitting: false }
		case "SET_SUCCESS":
			return { ...state, successMessage: action.message, isSubmitting: false }
		case "CLEAR_FEEDBACK":
			return { ...state, error: "", successMessage: "", emailError: "", passwordError: "", registerEmailError: "" }
		case "TOGGLE_PASSWORD":
			return { ...state, showPassword: !state.showPassword }
		case "LOGIN_EMAIL":
			return { ...state, loginEmail: action.value, error: "", emailError: action.emailError }
		case "LOGIN_PASSWORD":
			return { ...state, loginPassword: action.value, error: "", passwordError: "" }
		case "REMEMBER_ME":
			return { ...state, rememberMe: action.value }
		case "EMAIL_ERROR":
			return { ...state, emailError: action.error }
		case "PASSWORD_ERROR":
			return { ...state, passwordError: action.error }
		case "REGISTER_DATA":
			return {
				...state,
				registerData: { ...state.registerData, ...action.patch },
				...(action.emailError !== undefined ? { error: "", registerEmailError: action.emailError } : {}),
			}
		case "REGISTER_EMAIL_ERROR":
			return { ...state, registerEmailError: action.error }
		case "FORGOT_EMAIL":
			return { ...state, forgotEmail: action.value }
		case "NEW_PASSWORD":
			return { ...state, newPassword: action.value }
		case "INIT_EMAIL":
			return { ...state, loginEmail: action.email, rememberMe: true }
	}
}

// ─── Shared primitives ───────────────────────────────────────────────────────

const LABEL = "text-[11px] font-medium uppercase text-muted-foreground"
const LABEL_TRACKING = { letterSpacing: "0.06em" } as const

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
	return (
		<Label htmlFor={htmlFor} className={LABEL} style={LABEL_TRACKING}>
			{children}
		</Label>
	)
}

function FieldError({ children }: { children: React.ReactNode }) {
	return (
		<p className="flex items-center gap-1 text-xs text-destructive mt-1" role="alert">
			<WarningCircle className="h-3 w-3 shrink-0" aria-hidden />
			{children}
		</p>
	)
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div className="border border-destructive/50 bg-destructive/5 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
			<WarningCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
			{message}
		</div>
	)
}

function SuccessBanner({ message }: { message: string }) {
	return (
		<div className="border border-foreground/25 bg-foreground/5 px-3 py-2.5 text-sm text-foreground flex items-start gap-2">
			<CheckCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
			{message}
		</div>
	)
}

// ─── ResetView ────────────────────────────────────────────────────────────────

interface ResetViewProps {
	state: AuthState
	dispatch: React.Dispatch<AuthAction>
	actions: AuthScreenProps["actions"]
	onNavigate: AuthScreenProps["onNavigate"]
	goToAuth: () => void
}

function ResetView({ state, dispatch, actions, onNavigate, goToAuth }: ResetViewProps) {
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const pwErr = getPasswordError(state.newPassword)
		if (pwErr) {
			dispatch({ type: "SET_ERROR", message: pwErr })
			return
		}
		dispatch({ type: "SUBMITTING" })
		try {
			const { error } = await actions.updateUserPassword(state.newPassword)
			if (error) throw error
			alert("Senha atualizada com sucesso!")
			await onNavigate({ to: "/dashboard" })
		} catch (err) {
			dispatch({ type: "SET_ERROR", message: err instanceof Error ? err.message : "Erro ao atualizar senha." })
		}
	}

	return (
		<div className="w-full">
			<Button type="button" variant="ghost" size="sm" onClick={goToAuth} className="mb-6 gap-1.5 text-muted-foreground hover:text-foreground px-2">
				<ArrowLeft className="h-3.5 w-3.5" />
				Voltar ao login
			</Button>

			<div className="border border-border bg-card">
				<div className="px-8 pt-8 pb-6 border-b border-border">
					<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
						Nova Senha
					</h2>
					<p className="text-sm text-muted-foreground mt-1">Defina uma nova senha segura.</p>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="px-8 py-6 space-y-5">
						{state.error && <ErrorBanner message={state.error} />}
						<div className="space-y-2">
							<FieldLabel>Nova Senha</FieldLabel>
							<div className="relative">
								<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
								<Input
									type="password"
									className="h-11 pl-9"
									value={state.newPassword}
									onChange={(e) => dispatch({ type: "NEW_PASSWORD", value: e.target.value })}
									required
									minLength={8}
									placeholder="Mínimo 8 caracteres"
									autoComplete="new-password"
								/>
							</div>
						</div>
					</div>
					<div className="px-8 pb-8 pt-2 border-t border-border">
						<Button type="submit" className="w-full h-11 text-sm" disabled={state.isSubmitting}>
							{state.isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
							Atualizar Senha
						</Button>
					</div>
				</form>
			</div>
		</div>
	)
}

// ─── ForgotView ───────────────────────────────────────────────────────────────

interface ForgotViewProps {
	state: AuthState
	dispatch: React.Dispatch<AuthAction>
	actions: AuthScreenProps["actions"]
	goToAuth: () => void
}

function ForgotView({ state, dispatch, actions, goToAuth }: ForgotViewProps) {
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const norm = normalizeEmail(state.forgotEmail)
		if (!FAB_EMAIL_REGEX.test(norm)) {
			dispatch({ type: "SET_ERROR", message: "Email inválido. Use seu email @fab.mil.br (sem caracteres especiais)." })
			return
		}
		dispatch({ type: "SUBMITTING" })
		try {
			await actions.resetPassword(norm)
			dispatch({ type: "SET_SUCCESS", message: "Link enviado! Verifique sua caixa de entrada." })
		} catch (err) {
			dispatch({ type: "SET_ERROR", message: err instanceof Error ? err.message : "Erro ao enviar email." })
		}
	}

	return (
		<div className="w-full">
			{/* goToAuth remove ?view=forgot — back button do browser também funciona */}
			<Button type="button" variant="ghost" size="sm" onClick={goToAuth} className="mb-6 gap-1.5 text-muted-foreground hover:text-foreground px-2">
				<ArrowLeft className="h-3.5 w-3.5" />
				Voltar ao login
			</Button>

			<div className="border border-border bg-card">
				<div className="px-8 pt-8 pb-6 border-b border-border">
					<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
						Recuperar Senha
					</h2>
					<p className="text-sm text-muted-foreground mt-1">Enviaremos um link de redefinição para seu email.</p>
				</div>

				<form onSubmit={handleSubmit}>
					<div className="px-8 py-6 space-y-5">
						{state.error && <ErrorBanner message={state.error} />}
						{state.successMessage && <SuccessBanner message={state.successMessage} />}

						<div className="space-y-2">
							<FieldLabel htmlFor="forgot-email">Email Institucional</FieldLabel>
							<div className="relative">
								<Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
								<Input
									id="forgot-email"
									type="email"
									placeholder="seu.nome@fab.mil.br"
									className="h-11 pl-9"
									value={state.forgotEmail}
									onChange={(e) => dispatch({ type: "FORGOT_EMAIL", value: e.target.value })}
									required
									autoComplete="email"
								/>
							</div>
						</div>
					</div>

					<div className="px-8 pb-8 pt-2 border-t border-border">
						<Button type="submit" className="w-full h-11 text-sm" disabled={state.isSubmitting}>
							{state.isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
							Enviar Link
						</Button>
					</div>
				</form>
			</div>
		</div>
	)
}

// ─── LoginTabContent ──────────────────────────────────────────────────────────

interface LoginTabContentProps {
	state: AuthState
	dispatch: React.Dispatch<AuthAction>
	actions: AuthScreenProps["actions"]
	onNavigate: AuthScreenProps["onNavigate"]
	searchParams: AuthScreenProps["searchParams"]
	isLocked: boolean
	retryAfter: number
	onSuccess: () => void
	onFailure: () => void
	goToForgot: () => void
}

function LoginTabContent({ state, dispatch, actions, onNavigate, searchParams, isLocked, retryAfter, onSuccess, onFailure, goToForgot }: LoginTabContentProps) {
	const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
		const emailError = v && !FAB_EMAIL_REGEX.test(normalizeEmail(v)) ? "Use seu email institucional @fab.mil.br (sem caracteres especiais)." : ""
		dispatch({ type: "LOGIN_EMAIL", value: v, emailError })
	}

	const handleRememberMeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked
		dispatch({ type: "REMEMBER_ME", value: checked })
		const norm = normalizeEmail(state.loginEmail)
		if (checked && state.loginEmail && FAB_EMAIL_REGEX.test(norm)) {
			localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, norm)
		} else {
			localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL)
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (isLocked) return
		const norm = normalizeEmail(state.loginEmail)
		if (!FAB_EMAIL_REGEX.test(norm)) {
			dispatch({ type: "EMAIL_ERROR", error: "Email inválido. Use seu email @fab.mil.br (sem caracteres especiais)." })
			return
		}
		if (!state.loginPassword) {
			dispatch({ type: "PASSWORD_ERROR", error: "Informe a senha." })
			return
		}
		dispatch({ type: "SUBMITTING" })
		try {
			await actions.signIn(norm, state.loginPassword)
			onSuccess()
			if (state.rememberMe) localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, norm)
			else localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL)
			// href (não to): o destino salvo pode carregar query string, e `to` é
			// resolvido como pathname puro — o "?" vira parte do path e cai em NotFound.
			await onNavigate({ href: safeRedirect(searchParams.redirect, "/dashboard"), replace: true })
		} catch (err) {
			onFailure()
			const msg = err instanceof Error ? err.message : "Erro desconhecido"
			if (msg.includes("Email ou senha incorretos") || msg.includes("Invalid login credentials")) {
				dispatch({ type: "PASSWORD_ERROR", error: "Senha incorreta ou email não cadastrado" })
			} else {
				dispatch({ type: "SET_ERROR", message: msg || "Erro durante a autenticação. Tente mais tarde." })
			}
		}
	}

	return (
		<div className="border border-t-0 border-border bg-card">
			<div className="px-8 pt-7 pb-5">
				<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
					Bem-vindo de volta
				</h2>
				<p className="text-sm text-muted-foreground mt-1">Acesso restrito a emails @fab.mil.br</p>
			</div>

			<form onSubmit={handleSubmit}>
				<div className="px-8 pb-6 space-y-5">
					{isLocked && <ErrorBanner message={`Muitas tentativas. Tente novamente em ${retryAfter}s.`} />}
					{state.error && !isLocked && <ErrorBanner message={state.error} />}
					{state.successMessage && <SuccessBanner message={state.successMessage} />}

					{/* Email */}
					<div className="space-y-2">
						<FieldLabel htmlFor="login-email">Email Institucional</FieldLabel>
						<div className="relative">
							<Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="login-email"
								type="email"
								placeholder="seu.nome@fab.mil.br"
								className={cn("h-11 pl-9", state.emailError && "border-destructive focus-visible:border-destructive")}
								value={state.loginEmail}
								onChange={handleEmailChange}
								required
								autoComplete="username"
								disabled={state.isSubmitting}
							/>
						</div>
						{state.emailError && <FieldError>{state.emailError}</FieldError>}
					</div>

					{/* Password */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<FieldLabel htmlFor="login-password">Senha</FieldLabel>
							{/* goToForgot → push ?view=forgot na URL */}
							<Button
								type="button"
								variant="link"
								size="sm"
								onClick={goToForgot}
								className="h-auto p-0 text-[11px] text-muted-foreground hover:text-foreground"
								style={LABEL_TRACKING}
							>
								Esqueceu a senha?
							</Button>
						</div>
						<div className="relative">
							<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								id="login-password"
								type={state.showPassword ? "text" : "password"}
								placeholder="••••••••"
								className={cn("h-11 pl-9 pr-10", state.passwordError && "border-destructive focus-visible:border-destructive")}
								value={state.loginPassword}
								onChange={(e) => dispatch({ type: "LOGIN_PASSWORD", value: e.target.value })}
								required
								autoComplete="current-password"
								disabled={state.isSubmitting}
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								onClick={() => dispatch({ type: "TOGGLE_PASSWORD" })}
								className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								aria-label={state.showPassword ? "Ocultar senha" : "Mostrar senha"}
							>
								{state.showPassword ? <EyeClosed className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
							</Button>
						</div>
						{state.passwordError && <FieldError>{state.passwordError}</FieldError>}
					</div>

					{/* Remember me */}
					<div className="flex items-center gap-2">
						<input
							id="remember"
							type="checkbox"
							checked={state.rememberMe}
							onChange={handleRememberMeChange}
							className="h-3.5 w-3.5 border border-border accent-foreground cursor-pointer"
							disabled={state.isSubmitting}
						/>
						<label htmlFor="remember" className={cn(LABEL, "cursor-pointer")} style={LABEL_TRACKING}>
							Lembrar email
						</label>
					</div>
				</div>

				<div className="px-8 pb-8 border-t border-border pt-5">
					<Button type="submit" className="w-full h-11 text-sm" disabled={state.isSubmitting || isLocked || !!state.emailError || !!state.passwordError}>
						{isLocked ? (
							`Bloqueado (${retryAfter}s)`
						) : (
							<>
								{state.isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
								{state.isSubmitting ? "Entrando..." : "Entrar"}
							</>
						)}
					</Button>
				</div>
			</form>
		</div>
	)
}

// ─── RegisterTabContent ───────────────────────────────────────────────────────

interface RegisterTabContentProps {
	state: AuthState
	dispatch: React.Dispatch<AuthAction>
	actions: AuthScreenProps["actions"]
	onTabChange?: AuthScreenProps["onTabChange"]
}

function RegisterTabContent({ state, dispatch, actions, onTabChange }: RegisterTabContentProps) {
	const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
		const emailError = v && !FAB_EMAIL_REGEX.test(normalizeEmail(v)) ? "Use seu email institucional @fab.mil.br (sem caracteres especiais)." : ""
		dispatch({ type: "REGISTER_DATA", patch: { email: v }, emailError })
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const norm = normalizeEmail(state.registerData.email)
		if (!FAB_EMAIL_REGEX.test(norm)) {
			dispatch({ type: "REGISTER_EMAIL_ERROR", error: "Email inválido. Use seu email @fab.mil.br (sem caracteres especiais)." })
			return
		}
		const regPwErr = getPasswordError(state.registerData.password)
		if (regPwErr) {
			dispatch({ type: "SET_ERROR", message: regPwErr })
			return
		}
		if (state.registerData.password !== state.registerData.confirm) {
			dispatch({ type: "SET_ERROR", message: "As senhas não coincidem." })
			return
		}
		dispatch({ type: "SUBMITTING" })
		try {
			await actions.signUp(norm, state.registerData.password, state.registerData.name)
			dispatch({ type: "SET_SUCCESS", message: "Conta criada! Verifique seu email." })
			if (onTabChange) onTabChange("login")
			dispatch({ type: "LOGIN_EMAIL", value: norm, emailError: "" })
		} catch (err) {
			dispatch({ type: "SET_ERROR", message: err instanceof Error ? err.message : "Erro ao criar conta." })
		}
	}

	return (
		<div className="border border-t-0 border-border bg-card">
			<div className="px-8 pt-7 pb-5">
				<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
					Criar conta
				</h2>
				<p className="text-sm text-muted-foreground mt-1">Acesso restrito a emails @fab.mil.br</p>
			</div>

			<form onSubmit={handleSubmit}>
				<div className="px-8 pb-6 space-y-5">
					{state.error && <ErrorBanner message={state.error} />}

					<div className="space-y-2">
						<FieldLabel>Nome</FieldLabel>
						<div className="relative">
							<User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								placeholder="Seu nome completo"
								className="h-11 pl-9"
								value={state.registerData.name}
								onChange={(e) => dispatch({ type: "REGISTER_DATA", patch: { name: e.target.value } })}
								required
								autoComplete="name"
								disabled={state.isSubmitting}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<FieldLabel>Email Institucional</FieldLabel>
						<div className="relative">
							<Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								type="email"
								placeholder="seu.nome@fab.mil.br"
								className={cn("h-11 pl-9", state.registerEmailError && "border-destructive focus-visible:border-destructive")}
								value={state.registerData.email}
								onChange={handleEmailChange}
								required
								autoComplete="email"
								disabled={state.isSubmitting}
							/>
						</div>
						{state.registerEmailError && <FieldError>{state.registerEmailError}</FieldError>}
					</div>

					<div className="space-y-2">
						<FieldLabel>Senha</FieldLabel>
						<div className="relative">
							<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								type="password"
								placeholder="Mínimo 8 caracteres"
								className="h-11 pl-9"
								value={state.registerData.password}
								onChange={(e) => dispatch({ type: "REGISTER_DATA", patch: { password: e.target.value } })}
								required
								minLength={8}
								autoComplete="new-password"
								disabled={state.isSubmitting}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<FieldLabel>Confirmar Senha</FieldLabel>
						<div className="relative">
							<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								type="password"
								placeholder="Repita a senha"
								className="h-11 pl-9"
								value={state.registerData.confirm}
								onChange={(e) => dispatch({ type: "REGISTER_DATA", patch: { confirm: e.target.value } })}
								required
								autoComplete="new-password"
								disabled={state.isSubmitting}
							/>
						</div>
					</div>
				</div>

				<div className="px-8 pb-8 border-t border-border pt-5">
					<Button type="submit" className="w-full h-11 text-sm" disabled={state.isSubmitting || !!state.registerEmailError}>
						{state.isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
						{state.isSubmitting ? "Criando..." : "Criar conta"}
					</Button>
				</div>
			</form>
		</div>
	)
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

export function AuthScreen({ searchParams, onNavigate, onTabChange, onViewChange, actions }: AuthScreenProps) {
	const { isLocked, retryAfter, onFailure, onSuccess } = useLoginRateLimiter()
	const [state, dispatch] = useReducer(authReducer, initialState)

	// view derivada da URL — nunca estado local
	// Só link de recuperação abre o formulário de nova senha; signup/invite/magiclink
	// apenas confirmam a sessão e o beforeLoad de /auth redireciona pro app.
	const currentView: AuthView = isPasswordRecoveryLink(searchParams) ? "reset" : searchParams.view === "forgot" ? "forgot" : "auth"
	const activeTab = searchParams.tab ?? "login"

	const goToForgot = () => onViewChange?.("forgot")
	const goToAuth = () => onViewChange?.(null)

	const handleTabChange = (value: string) => {
		if (onTabChange) onTabChange(value as "login" | "register")
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: dispatch é estável; deps intencionais para reagir à mudança de view
	useEffect(() => {
		dispatch({ type: "CLEAR_FEEDBACK" })
	}, [searchParams.view, searchParams.token_hash])

	useEffect(() => {
		const saved = localStorage.getItem(STORAGE_KEY_REMEMBER_EMAIL)
		if (saved) dispatch({ type: "INIT_EMAIL", email: saved })
	}, [])

	useEffect(() => {
		// Qualquer link de email do Supabase chega com token_hash + type (recovery, signup, …).
		// Sem trocar o token por sessão, o "definir nova senha" falha com "Auth session missing".
		if (!searchParams.token_hash) return
		const tokenHash = searchParams.token_hash
		const type = parseOtpType(searchParams.type)
		const verify = async () => {
			const { error } = await actions.verifyOtp(tokenHash, type)
			if (error) dispatch({ type: "SET_ERROR", message: "Link inválido ou expirado. Solicite um novo email." })
		}
		verify()
	}, [searchParams.token_hash, searchParams.type, actions])

	if (currentView === "reset") {
		return <ResetView state={state} dispatch={dispatch} actions={actions} onNavigate={onNavigate} goToAuth={goToAuth} />
	}

	if (currentView === "forgot") {
		return <ForgotView state={state} dispatch={dispatch} actions={actions} goToAuth={goToAuth} />
	}

	// ── Auth: Login + Register tabs ───────────────────────────────────────────
	return (
		<div className="w-full">
			<Tabs value={activeTab} onValueChange={handleTabChange} className="w-full gap-0">
				<TabsList variant="line" className="w-full flex h-11 border border-border bg-transparent p-0 rounded-none gap-0">
					<TabsTrigger value="login" className="flex-1 rounded-none h-full text-sm font-medium border-0">
						Entrar
					</TabsTrigger>
					<TabsTrigger value="register" className="flex-1 rounded-none h-full text-sm font-medium border-0 border-l border-border">
						Cadastrar
					</TabsTrigger>
				</TabsList>

				<TabsContent value="login" className="mt-0">
					<LoginTabContent
						state={state}
						dispatch={dispatch}
						actions={actions}
						onNavigate={onNavigate}
						searchParams={searchParams}
						isLocked={isLocked}
						retryAfter={retryAfter}
						onSuccess={onSuccess}
						onFailure={onFailure}
						goToForgot={goToForgot}
					/>
				</TabsContent>

				<TabsContent value="register" className="mt-0">
					<RegisterTabContent state={state} dispatch={dispatch} actions={actions} onTabChange={onTabChange} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
