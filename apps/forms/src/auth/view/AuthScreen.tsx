import { ArrowLeft, CheckCircle, Eye, EyeClosed, Lock, Mail, Refresh, User, WarningCircle } from "iconoir-react"
import { useEffect, useState } from "react"
import { useLoginRateLimiter } from "@/auth/rate-limiter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
	isLoading: boolean
	isAuthenticated: boolean
	searchParams: {
		redirect?: string
		tab?: "login" | "register"
		view?: "forgot"
		token_hash?: string
		type?: string
	}
	onNavigate: (options: { to?: string; search?: Record<string, unknown>; replace?: boolean }) => Promise<void> | void
	onTabChange?: (tab: "login" | "register") => void
	// null = voltar aos tabs (remove ?view=forgot da URL, back button funciona)
	onViewChange?: (view: "forgot" | null) => void
	actions: {
		signIn: (email: string, password: string) => Promise<void>
		signUp: (email: string, password: string, name: string) => Promise<void>
		resetPassword: (email: string) => Promise<void>
		updateUserPassword: (password: string) => Promise<{ error: Error | null }>
		verifyOtp: (token_hash: string, type: "email") => Promise<{ error: Error | null }>
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
		<div className="border-l-2 border-destructive bg-destructive/5 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
			<WarningCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
			{message}
		</div>
	)
}

function SuccessBanner({ message }: { message: string }) {
	return (
		<div className="border-l-2 border-foreground bg-foreground/5 px-3 py-2.5 text-sm text-foreground flex items-start gap-2">
			<CheckCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
			{message}
		</div>
	)
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

export function AuthScreen({ isLoading, isAuthenticated, searchParams, onNavigate, onTabChange, onViewChange, actions }: AuthScreenProps) {
	const { isLocked, retryAfter, onFailure, onSuccess } = useLoginRateLimiter()

	// ── View derivada da URL — nunca estado local ─────────────────────────────
	// Prioridade: token_hash → reset | ?view=forgot → forgot | default → auth tabs
	const currentView: AuthView = searchParams.token_hash ? "reset" : searchParams.view === "forgot" ? "forgot" : "auth"

	const [activeTab, setActiveTab] = useState<string>(searchParams.tab || "login")

	useEffect(() => {
		if (searchParams.tab) setActiveTab(searchParams.tab)
	}, [searchParams.tab])

	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState("")
	const [successMessage, setSuccessMessage] = useState("")
	const [showPassword, setShowPassword] = useState(false)

	const [loginEmail, setLoginEmail] = useState("")
	const [loginPassword, setLoginPassword] = useState("")
	const [rememberMe, setRememberMe] = useState(false)
	const [emailError, setEmailError] = useState("")
	const [passwordError, setPasswordError] = useState("")

	const [registerData, setRegisterData] = useState({ name: "", email: "", password: "", confirm: "" })
	const [registerEmailError, setRegisterEmailError] = useState("")

	const [forgotEmail, setForgotEmail] = useState("")
	const [newPassword, setNewPassword] = useState("")

	// Limpa erros sempre que a view muda via URL (ex: back button, goToForgot)
	// biome-ignore lint/correctness/useExhaustiveDependencies: setters são estáveis; deps intencionais para reagir à mudança de view
	useEffect(() => {
		setError("")
		setSuccessMessage("")
		setEmailError("")
		setPasswordError("")
		setRegisterEmailError("")
	}, [searchParams.view, searchParams.token_hash])

	useEffect(() => {
		const saved = localStorage.getItem(STORAGE_KEY_REMEMBER_EMAIL)
		if (saved) {
			setLoginEmail(saved)
			setRememberMe(true)
		}
	}, [])

	useEffect(() => {
		if (!isLoading && isAuthenticated) {
			onNavigate({ to: safeRedirect(searchParams.redirect, "/dashboard"), replace: true })
		}
	}, [isAuthenticated, isLoading, searchParams.redirect, onNavigate])

	// ── Navegação de view via URL ─────────────────────────────────────────────
	const goToForgot = () => onViewChange?.("forgot")
	const goToAuth = () => onViewChange?.(null)

	const handleTabChange = (value: string) => {
		setActiveTab(value)
		if (onTabChange) onTabChange(value as "login" | "register")
	}

	// ── Handlers de formulário ────────────────────────────────────────────────

	const handleLoginEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
		setLoginEmail(v)
		setError("")
		setEmailError("")
		if (v && !FAB_EMAIL_REGEX.test(normalizeEmail(v))) {
			setEmailError("Use seu email institucional @fab.mil.br (sem caracteres especiais).")
		}
	}

	const handleLoginPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setLoginPassword(e.target.value)
		setError("")
		setPasswordError("")
	}

	const handleRememberMeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked
		setRememberMe(checked)
		const norm = normalizeEmail(loginEmail)
		if (checked && loginEmail && FAB_EMAIL_REGEX.test(norm)) {
			localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, norm)
		} else {
			localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL)
		}
	}

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault()
		if (isLocked) return
		const norm = normalizeEmail(loginEmail)
		if (!FAB_EMAIL_REGEX.test(norm)) {
			setEmailError("Email inválido. Use seu email @fab.mil.br (sem caracteres especiais).")
			return
		}
		const pwErr = getPasswordError(loginPassword)
		if (pwErr) {
			setPasswordError(pwErr)
			return
		}
		setIsSubmitting(true)
		setError("")
		setEmailError("")
		setPasswordError("")
		try {
			await actions.signIn(norm, loginPassword)
			onSuccess()
			if (rememberMe) localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, norm)
			else localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL)
			await onNavigate({ to: safeRedirect(searchParams.redirect, "/dashboard"), replace: true })
		} catch (err) {
			onFailure()
			const msg = err instanceof Error ? err.message : "Erro desconhecido"
			if (msg.includes("Email ou senha incorretos") || msg.includes("Invalid login credentials")) {
				setPasswordError("Senha incorreta ou email não cadastrado")
			} else {
				setError(msg || "Erro durante a autenticação. Tente mais tarde.")
			}
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleRegisterEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
		setRegisterData({ ...registerData, email: v })
		setError("")
		setRegisterEmailError("")
		if (v && !FAB_EMAIL_REGEX.test(normalizeEmail(v))) {
			setRegisterEmailError("Use seu email institucional @fab.mil.br (sem caracteres especiais).")
		}
	}

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault()
		const norm = normalizeEmail(registerData.email)
		if (!FAB_EMAIL_REGEX.test(norm)) {
			setRegisterEmailError("Email inválido. Use seu email @fab.mil.br (sem caracteres especiais).")
			return
		}
		const regPwErr = getPasswordError(registerData.password)
		if (regPwErr) {
			setError(regPwErr)
			return
		}
		if (registerData.password !== registerData.confirm) {
			setError("As senhas não coincidem.")
			return
		}
		setIsSubmitting(true)
		setError("")
		setRegisterEmailError("")
		try {
			await actions.signUp(norm, registerData.password, registerData.name)
			setSuccessMessage("Conta criada! Verifique seu email.")
			handleTabChange("login")
			setLoginEmail(norm)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao criar conta.")
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleForgotPassword = async (e: React.FormEvent) => {
		e.preventDefault()
		const norm = normalizeEmail(forgotEmail)
		if (!FAB_EMAIL_REGEX.test(norm)) {
			setError("Email inválido. Use seu email @fab.mil.br (sem caracteres especiais).")
			return
		}
		setIsSubmitting(true)
		setError("")
		try {
			await actions.resetPassword(norm)
			setSuccessMessage("Link enviado! Verifique sua caixa de entrada.")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao enviar email.")
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleResetPassword = async (e: React.FormEvent) => {
		e.preventDefault()
		const resetPwErr = getPasswordError(newPassword)
		if (resetPwErr) {
			setError(resetPwErr)
			return
		}
		setIsSubmitting(true)
		setError("")
		try {
			const { error } = await actions.updateUserPassword(newPassword)
			if (error) throw error
			alert("Senha atualizada com sucesso!")
			await onNavigate({ to: "/dashboard" })
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao atualizar senha.")
		} finally {
			setIsSubmitting(false)
		}
	}

	useEffect(() => {
		// currentView === "reset" ≡ !!searchParams.token_hash — sem necessidade de incluí-lo nos deps
		if (searchParams.token_hash && searchParams.type === "email") {
			const tokenHash = searchParams.token_hash
			const verify = async () => {
				const { error } = await actions.verifyOtp(tokenHash, "email")
				if (error) setError("Link inválido ou expirado. Solicite uma nova recuperação.")
			}
			verify()
		}
	}, [searchParams.token_hash, searchParams.type, actions])

	// ── Loading ───────────────────────────────────────────────────────────────
	if (isLoading) {
		return (
			<div className="border border-border bg-card px-8 py-10 flex items-center gap-3">
				<Refresh className="h-4 w-4 animate-spin text-muted-foreground" />
				<span className="text-sm text-muted-foreground">Verificando autenticação...</span>
			</div>
		)
	}

	// ── Reset password — ativado por token_hash na URL (link do email) ────────
	if (currentView === "reset") {
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

					<form onSubmit={handleResetPassword}>
						<div className="px-8 py-6 space-y-5">
							{error && <ErrorBanner message={error} />}
							<div className="space-y-2">
								<FieldLabel>Nova Senha</FieldLabel>
								<div className="relative">
									<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
									<Input
										type="password"
										className="h-11 pl-9"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										required
										minLength={8}
										placeholder="Mínimo 8 caracteres"
										autoComplete="new-password"
									/>
								</div>
							</div>
						</div>
						<div className="px-8 pb-8 pt-2 border-t border-border">
							<Button type="submit" className="w-full h-11 text-sm" disabled={isSubmitting}>
								{isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
								Atualizar Senha
							</Button>
						</div>
					</form>
				</div>
			</div>
		)
	}

	// ── Forgot password — ativado por ?view=forgot na URL ────────────────────
	if (currentView === "forgot") {
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

					<form onSubmit={handleForgotPassword}>
						<div className="px-8 py-6 space-y-5">
							{error && <ErrorBanner message={error} />}
							{successMessage && <SuccessBanner message={successMessage} />}

							<div className="space-y-2">
								<FieldLabel htmlFor="forgot-email">Email Institucional</FieldLabel>
								<div className="relative">
									<Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
									<Input
										id="forgot-email"
										type="email"
										placeholder="seu.nome@fab.mil.br"
										className="h-11 pl-9"
										value={forgotEmail}
										onChange={(e) => setForgotEmail(e.target.value)}
										required
										autoComplete="email"
									/>
								</div>
							</div>
						</div>

						<div className="px-8 pb-8 pt-2 border-t border-border">
							<Button type="submit" className="w-full h-11 text-sm" disabled={isSubmitting}>
								{isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
								Enviar Link
							</Button>
						</div>
					</form>
				</div>
			</div>
		)
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

				{/* ── LOGIN ── */}
				<TabsContent value="login" className="mt-0">
					<div className="border border-t-0 border-border bg-card">
						<div className="px-8 pt-7 pb-5">
							<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
								Bem-vindo de volta
							</h2>
							<p className="text-sm text-muted-foreground mt-1">Acesso restrito a emails @fab.mil.br</p>
						</div>

						<form onSubmit={handleLogin}>
							<div className="px-8 pb-6 space-y-5">
								{isLocked && <ErrorBanner message={`Muitas tentativas. Tente novamente em ${retryAfter}s.`} />}
								{error && !isLocked && <ErrorBanner message={error} />}
								{successMessage && <SuccessBanner message={successMessage} />}

								{/* Email */}
								<div className="space-y-2">
									<FieldLabel htmlFor="login-email">Email Institucional</FieldLabel>
									<div className="relative">
										<Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
										<Input
											id="login-email"
											type="email"
											placeholder="seu.nome@fab.mil.br"
											className={cn("h-11 pl-9", emailError && "border-destructive focus-visible:border-destructive")}
											value={loginEmail}
											onChange={handleLoginEmailChange}
											required
											autoComplete="username"
											disabled={isSubmitting}
										/>
									</div>
									{emailError && <FieldError>{emailError}</FieldError>}
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
											type={showPassword ? "text" : "password"}
											placeholder="••••••••"
											className={cn("h-11 pl-9 pr-10", passwordError && "border-destructive focus-visible:border-destructive")}
											value={loginPassword}
											onChange={handleLoginPasswordChange}
											required
											autoComplete="current-password"
											minLength={8}
											disabled={isSubmitting}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											onClick={() => setShowPassword(!showPassword)}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
											aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
										>
											{showPassword ? <EyeClosed className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
										</Button>
									</div>
									{passwordError && <FieldError>{passwordError}</FieldError>}
								</div>

								{/* Remember me */}
								<div className="flex items-center gap-2">
									<input
										id="remember"
										type="checkbox"
										checked={rememberMe}
										onChange={handleRememberMeChange}
										className="h-3.5 w-3.5 border border-border accent-foreground cursor-pointer"
										disabled={isSubmitting}
									/>
									<label htmlFor="remember" className={cn(LABEL, "cursor-pointer")} style={LABEL_TRACKING}>
										Lembrar email
									</label>
								</div>
							</div>

							<div className="px-8 pb-8 border-t border-border pt-5">
								<Button type="submit" className="w-full h-11 text-sm" disabled={isSubmitting || isLocked || !!emailError || !!passwordError}>
									{isLocked ? (
										`Bloqueado (${retryAfter}s)`
									) : (
										<>
											{isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
											{isSubmitting ? "Entrando..." : "Entrar"}
										</>
									)}
								</Button>
							</div>
						</form>
					</div>
				</TabsContent>

				{/* ── REGISTER ── */}
				<TabsContent value="register" className="mt-0">
					<div className="border border-t-0 border-border bg-card">
						<div className="px-8 pt-7 pb-5">
							<h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
								Criar conta
							</h2>
							<p className="text-sm text-muted-foreground mt-1">Acesso restrito a emails @fab.mil.br</p>
						</div>

						<form onSubmit={handleRegister}>
							<div className="px-8 pb-6 space-y-5">
								{error && <ErrorBanner message={error} />}

								<div className="space-y-2">
									<FieldLabel>Nome</FieldLabel>
									<div className="relative">
										<User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
										<Input
											placeholder="Seu nome completo"
											className="h-11 pl-9"
											value={registerData.name}
											onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
											required
											autoComplete="name"
											disabled={isSubmitting}
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
											className={cn("h-11 pl-9", registerEmailError && "border-destructive focus-visible:border-destructive")}
											value={registerData.email}
											onChange={handleRegisterEmailChange}
											required
											autoComplete="email"
											disabled={isSubmitting}
										/>
									</div>
									{registerEmailError && <FieldError>{registerEmailError}</FieldError>}
								</div>

								<div className="space-y-2">
									<FieldLabel>Senha</FieldLabel>
									<div className="relative">
										<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
										<Input
											type="password"
											placeholder="Mínimo 8 caracteres"
											className="h-11 pl-9"
											value={registerData.password}
											onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
											required
											minLength={8}
											autoComplete="new-password"
											disabled={isSubmitting}
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
											value={registerData.confirm}
											onChange={(e) => setRegisterData({ ...registerData, confirm: e.target.value })}
											required
											autoComplete="new-password"
											disabled={isSubmitting}
										/>
									</div>
								</div>
							</div>

							<div className="px-8 pb-8 border-t border-border pt-5">
								<Button type="submit" className="w-full h-11 text-sm" disabled={isSubmitting || !!registerEmailError}>
									{isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
									{isSubmitting ? "Criando..." : "Criar conta"}
								</Button>
							</div>
						</form>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	)
}
