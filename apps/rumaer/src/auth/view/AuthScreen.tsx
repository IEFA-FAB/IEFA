import { ArrowLeft, CheckCircle, CircleAlert, Eye, EyeOff, Lock, Mail, RefreshCw, User } from "lucide-react"
import { useEffect, useState } from "react"
import { useLoginRateLimiter } from "@/auth/rate-limiter"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

// Cabeçalho de marca centralizado — logo + eyebrow + título (estilo "Log in to · craftwork")
function BrandHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
	return (
		<div className="mb-8 flex flex-col items-center text-center">
			<img src="/favicon.svg" alt="RUMAER" className="mb-6 h-9 w-auto" />
			{eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
			<h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
			{subtitle && <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
		</div>
	)
}

// Input com ícone à esquerda — label apenas para leitores de tela (visual minimalista)
function IconField({
	id,
	icon: Icon,
	label,
	invalid,
	children,
}: {
	id: string
	icon: React.ComponentType<{ className?: string }>
	label: string
	invalid?: boolean
	children: (cls: string) => React.ReactNode
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id} className="sr-only">
				{label}
			</Label>
			<div className="relative">
				<Icon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				{children(cn("h-11 rounded-xl bg-muted/40 pl-10", invalid && "border-destructive focus-visible:border-destructive"))}
			</div>
		</div>
	)
}

function FieldError({ children }: { children: React.ReactNode }) {
	return (
		<p className="mt-1.5 flex items-center gap-1 text-xs text-destructive" role="alert">
			<CircleAlert className="h-3 w-3 shrink-0" aria-hidden />
			{children}
		</p>
	)
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
			<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
			{message}
		</div>
	)
}

function SuccessBanner({ message }: { message: string }) {
	return (
		<div className="flex items-start gap-2 rounded-xl border border-success/25 bg-success/10 px-3.5 py-2.5 text-sm text-success-foreground">
			<CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
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

	const [activeTab, setActiveTab] = useState<"login" | "register">(searchParams.tab || "login")

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
			onNavigate({ to: safeRedirect(searchParams.redirect, "/"), replace: true })
		}
	}, [isAuthenticated, isLoading, searchParams.redirect, onNavigate])

	// ── Navegação de view via URL ─────────────────────────────────────────────
	const goToForgot = () => onViewChange?.("forgot")
	const goToAuth = () => onViewChange?.(null)

	const switchTab = (value: "login" | "register") => {
		setActiveTab(value)
		setError("")
		setSuccessMessage("")
		onTabChange?.(value)
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
		if (!loginPassword) {
			setPasswordError("Informe a senha.")
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
			await onNavigate({ to: safeRedirect(searchParams.redirect, "/"), replace: true })
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
			switchTab("login")
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
			await onNavigate({ to: "/" })
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
			<div className="flex items-center justify-center gap-3 py-10">
				<RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
				<span className="text-sm text-muted-foreground">Verificando autenticação...</span>
			</div>
		)
	}

	// ── Reset password — ativado por token_hash na URL (link do email) ────────
	if (currentView === "reset") {
		return (
			<div className="w-full">
				<BrandHeader title="Nova senha" subtitle="Defina uma nova senha segura para sua conta." />

				<form onSubmit={handleResetPassword} className="space-y-4">
					{error && <ErrorBanner message={error} />}

					<IconField id="reset-password" icon={Lock} label="Nova senha">
						{(cls) => (
							<Input
								id="reset-password"
								type="password"
								className={cls}
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								required
								minLength={8}
								placeholder="Mínimo 8 caracteres"
								autoComplete="new-password"
							/>
						)}
					</IconField>

					<Button type="submit" className="h-11 w-full rounded-xl text-sm" disabled={isSubmitting}>
						{isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
						Atualizar senha
					</Button>
				</form>

				<button
					type="button"
					onClick={goToAuth}
					className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					Voltar ao login
				</button>
			</div>
		)
	}

	// ── Forgot password — ativado por ?view=forgot na URL ────────────────────
	if (currentView === "forgot") {
		return (
			<div className="w-full">
				<BrandHeader title="Recuperar senha" subtitle="Enviaremos um link de redefinição para o seu email institucional." />

				<form onSubmit={handleForgotPassword} className="space-y-4">
					{error && <ErrorBanner message={error} />}
					{successMessage && <SuccessBanner message={successMessage} />}

					<IconField id="forgot-email" icon={Mail} label="Email institucional">
						{(cls) => (
							<Input
								id="forgot-email"
								type="email"
								placeholder="seu.nome@fab.mil.br"
								className={cls}
								value={forgotEmail}
								onChange={(e) => setForgotEmail(e.target.value)}
								required
								autoComplete="email"
							/>
						)}
					</IconField>

					<Button type="submit" className="h-11 w-full rounded-xl text-sm" disabled={isSubmitting}>
						{isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
						Enviar link
					</Button>
				</form>

				<button
					type="button"
					onClick={goToAuth}
					className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="h-3.5 w-3.5" />
					Voltar ao login
				</button>
			</div>
		)
	}

	// ── Auth: Login + Register (toggle por link) ──────────────────────────────
	const isRegister = activeTab === "register"

	return (
		<div className="w-full">
			<BrandHeader eyebrow={isRegister ? "Crie sua conta no" : "Entre no"} title="RUMAER" />

			{isRegister ? (
				// ── REGISTER ──
				<form onSubmit={handleRegister} className="space-y-3.5">
					{error && <ErrorBanner message={error} />}

					<IconField id="register-name" icon={User} label="Nome completo">
						{(cls) => (
							<Input
								id="register-name"
								placeholder="Seu nome completo"
								className={cls}
								value={registerData.name}
								onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
								required
								autoComplete="name"
								disabled={isSubmitting}
							/>
						)}
					</IconField>

					<div>
						<IconField id="register-email" icon={Mail} label="Email institucional" invalid={!!registerEmailError}>
							{(cls) => (
								<Input
									id="register-email"
									type="email"
									placeholder="seu.nome@fab.mil.br"
									className={cls}
									value={registerData.email}
									onChange={handleRegisterEmailChange}
									required
									autoComplete="email"
									disabled={isSubmitting}
								/>
							)}
						</IconField>
						{registerEmailError && <FieldError>{registerEmailError}</FieldError>}
					</div>

					<IconField id="register-password" icon={Lock} label="Senha">
						{(cls) => (
							<Input
								id="register-password"
								type="password"
								placeholder="Mínimo 8 caracteres"
								className={cls}
								value={registerData.password}
								onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
								required
								minLength={8}
								autoComplete="new-password"
								disabled={isSubmitting}
							/>
						)}
					</IconField>

					<IconField id="register-confirm" icon={Lock} label="Confirmar senha">
						{(cls) => (
							<Input
								id="register-confirm"
								type="password"
								placeholder="Repita a senha"
								className={cls}
								value={registerData.confirm}
								onChange={(e) => setRegisterData({ ...registerData, confirm: e.target.value })}
								required
								autoComplete="new-password"
								disabled={isSubmitting}
							/>
						)}
					</IconField>

					<Button type="submit" className="mt-1 h-11 w-full rounded-xl text-sm" disabled={isSubmitting || !!registerEmailError}>
						{isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
						{isSubmitting ? "Criando..." : "Criar conta"}
					</Button>
				</form>
			) : (
				// ── LOGIN ──
				<form onSubmit={handleLogin} className="space-y-3.5">
					{isLocked && <ErrorBanner message={`Muitas tentativas. Tente novamente em ${retryAfter}s.`} />}
					{error && !isLocked && <ErrorBanner message={error} />}
					{successMessage && <SuccessBanner message={successMessage} />}

					<div>
						<IconField id="login-email" icon={Mail} label="Email institucional" invalid={!!emailError}>
							{(cls) => (
								<Input
									id="login-email"
									type="email"
									placeholder="seu.nome@fab.mil.br"
									className={cls}
									value={loginEmail}
									onChange={handleLoginEmailChange}
									required
									autoComplete="username"
									disabled={isSubmitting}
								/>
							)}
						</IconField>
						{emailError && <FieldError>{emailError}</FieldError>}
					</div>

					<div>
						<IconField id="login-password" icon={Lock} label="Senha" invalid={!!passwordError}>
							{(cls) => (
								<div className="relative">
									<Input
										id="login-password"
										type={showPassword ? "text" : "password"}
										placeholder="Sua senha"
										className={cn(cls, "pr-10")}
										value={loginPassword}
										onChange={handleLoginPasswordChange}
										required
										autoComplete="current-password"
										disabled={isSubmitting}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon-xs"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
									>
										{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
									</Button>
								</div>
							)}
						</IconField>
						{passwordError && <FieldError>{passwordError}</FieldError>}
					</div>

					<div className="flex items-center justify-between pt-0.5">
						<label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
							<input
								type="checkbox"
								checked={rememberMe}
								onChange={handleRememberMeChange}
								className="h-3.5 w-3.5 cursor-pointer rounded border border-border accent-primary"
								disabled={isSubmitting}
							/>
							Lembrar email
						</label>
						<button type="button" onClick={goToForgot} className="text-sm font-medium text-primary transition-colors hover:text-navy-deep">
							Esqueceu a senha?
						</button>
					</div>

					<Button type="submit" className="mt-1 h-11 w-full rounded-xl text-sm" disabled={isSubmitting || isLocked || !!emailError || !!passwordError}>
						{isLocked ? (
							`Bloqueado (${retryAfter}s)`
						) : (
							<>
								{isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
								{isSubmitting ? "Entrando..." : "Entrar"}
							</>
						)}
					</Button>
				</form>
			)}

			{/* ── Toggle login/cadastro ── */}
			<p className="mt-6 text-center text-sm text-muted-foreground">
				{isRegister ? "Já tem uma conta? " : "Não tem uma conta? "}
				<button
					type="button"
					onClick={() => switchTab(isRegister ? "login" : "register")}
					className="font-semibold text-foreground underline-offset-4 hover:underline"
				>
					{isRegister ? "Entrar" : "Cadastre-se"}
				</button>
			</p>
		</div>
	)
}
