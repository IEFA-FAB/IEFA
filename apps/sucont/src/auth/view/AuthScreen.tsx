import { useLoginRateLimiter } from "@iefa/auth-kit/react"
import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { ArrowLeft, CheckCircle, CircleAlert, Eye, EyeOff, Loader2, Lock, Mail, Monitor, ShieldAlert, User } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { TOOL_STAGES } from "#/lib/types"
import { cn } from "#/lib/utils"

const FAB_EMAIL_REGEX = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/
const STORAGE_KEY_REMEMBER_EMAIL = "sucont_remember_email"

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
	if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded
	return fallback
}

// View derivada da URL — "reset" ativado por token_hash, "forgot" por ?view=forgot
export type AuthView = "auth" | "forgot" | "reset"

export interface AuthScreenProps {
	isLoading: boolean
	isAuthenticated: boolean
	searchParams: {
		redirect?: string
		denied?: string
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
		verifyOtp: (token_hash: string, type: "email" | "recovery") => Promise<{ error: Error | null }>
	}
}

// ─── Shell + primitivos compartilhados ────────────────────────────────────────

// As etapas vêm de `TOOL_STAGES`, não de uma cópia: são as mesmas quatro que
// agrupam o catálogo, e aqui dizem a quem ainda não entrou para que serve o hub.
// Uma segunda lista com o mesmo conteúdo divergiria em silêncio.
const SHELL_HIGHLIGHTS = TOOL_STAGES

/**
 * Casca da página de autenticação: duas colunas, como no sisub.
 *
 * A coluna da esquerda só aparece a partir de `lg` — em telas estreitas o
 * formulário ocupa a largura inteira e o material de apresentação sai da frente.
 * Antes esta tela era um cartão solto no meio de um fundo vazio, sem dizer o que
 * havia do outro lado do login.
 */
function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen bg-tech-bg flex flex-col">
			<div className="flex-1 flex flex-col lg:flex-row lg:items-stretch max-w-6xl w-full mx-auto px-6 py-10 gap-12">
				{/* ── Apresentação (desktop) ───────────────────── */}
				<aside className="hidden lg:flex lg:w-2/5 xl:w-[45%] flex-col justify-center gap-10">
					<Brand />
					<div className="flex flex-col gap-2">
						<h2 className="text-display text-foreground leading-tight">O acompanhamento contábil da seção, num lugar só</h2>
						<p className="text-body text-muted-foreground leading-relaxed">
							Ferramentas de análise, comunicação e consulta do SUCONT-4, organizadas pelo ponto do trabalho em que você está.
						</p>
					</div>
					<ol className="flex flex-col gap-5">
						{SHELL_HIGHLIGHTS.map((item, i) => (
							<li key={item.id} className="flex items-start gap-4">
								<span className="font-mono text-display text-muted-foreground/40 tabular-nums leading-none pt-0.5" aria-hidden="true">
									{String(i + 1).padStart(2, "0")}
								</span>
								<div className="flex flex-col gap-0.5">
									<span className="text-subheading text-foreground">{item.label}</span>
									<span className="text-caption text-muted-foreground leading-relaxed">{item.description}</span>
								</div>
							</li>
						))}
					</ol>
				</aside>

				{/* ── Formulário ───────────────────────────────── */}
				<section className="flex-1 flex flex-col justify-center" aria-label="Autenticação">
					<div className="w-full max-w-sm mx-auto flex flex-col gap-8">
						{/* A marca acompanha o formulário quando a coluna da esquerda não cabe. */}
						<div className="lg:hidden flex justify-center">
							<Brand />
						</div>
						{children}
					</div>
				</section>
			</div>

			<footer className="px-6 pb-10 max-w-6xl w-full mx-auto flex flex-col items-center gap-2">
				<LegalFooterLinks
					className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
					linkClassName="text-label font-mono text-muted-foreground transition-colors hover:text-foreground"
				/>
				<p className="text-hint font-mono text-muted-foreground">© {new Date().getFullYear()} SUCONT-4 | DIREF | FAB</p>
			</footer>
		</div>
	)
}

function Brand() {
	return (
		<div className="flex items-center gap-3">
			<div className="w-11 h-11 bg-tech-blue rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
				<Monitor className="w-6 h-6" />
			</div>
			<div className="flex flex-col">
				<h1 className="text-heading text-foreground leading-tight">SUCONT-4 HUB</h1>
				<span className="text-label text-muted-foreground">DIREF • COMAER</span>
			</div>
		</div>
	)
}

// Cartão do formulário — título/subtítulo opcionais no topo.
function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
	return (
		<div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col gap-4">
			{(title || subtitle) && (
				<div className="flex flex-col gap-1">
					{title && <h2 className="text-subheading text-foreground">{title}</h2>}
					{subtitle && <p className="text-caption leading-relaxed text-muted-foreground">{subtitle}</p>}
				</div>
			)}
			{children}
		</div>
	)
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			{children}
		</div>
	)
}

function FieldError({ children }: { children: React.ReactNode }) {
	return (
		<p className="mt-1 flex items-center gap-1 text-caption text-destructive" role="alert">
			<CircleAlert className="h-3 w-3 shrink-0" aria-hidden />
			{children}
		</p>
	)
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-caption text-destructive">
			<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
			{message}
		</div>
	)
}

function SuccessBanner({ message }: { message: string }) {
	return (
		<div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-caption text-success">
			<CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
			{message}
		</div>
	)
}

function BackToLogin({ onClick }: { onClick: () => void }) {
	return (
		<Button
			type="button"
			onClick={onClick}
			variant="ghost"
			className="mx-auto mt-5 h-auto gap-1.5 p-0 text-caption text-muted-foreground hover:bg-transparent hover:text-foreground"
		>
			<ArrowLeft className="h-3.5 w-3.5" />
			Voltar ao login
		</Button>
	)
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

export function AuthScreen({ isLoading, isAuthenticated, searchParams, onNavigate, onTabChange, onViewChange, actions }: AuthScreenProps) {
	const { isLocked, retryAfter, onFailure, onSuccess } = useLoginRateLimiter()

	// View derivada da URL — nunca estado local.
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

	// Limpa erros sempre que a view muda via URL (ex: back button, goToForgot).
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

	// Redireciona quando já autenticado — só na view de login (não arranca o usuário
	// da tela de nova senha, onde o verifyOtp já cria uma sessão de recuperação).
	useEffect(() => {
		if (!isLoading && isAuthenticated && currentView === "auth") {
			onNavigate({ to: safeRedirect(searchParams.redirect, "/"), replace: true })
		}
	}, [isAuthenticated, isLoading, currentView, searchParams.redirect, onNavigate])

	const goToForgot = () => onViewChange?.("forgot")
	const goToAuth = () => onViewChange?.(null)

	const switchTab = (value: "login" | "register") => {
		setActiveTab(value)
		setError("")
		setSuccessMessage("")
		onTabChange?.(value)
	}

	// ── Handlers ──────────────────────────────────────────────────────────────

	const handleLoginEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = e.target.value
		setLoginEmail(v)
		setError("")
		setEmailError("")
		if (v && !FAB_EMAIL_REGEX.test(normalizeEmail(v))) {
			setEmailError("Use seu e-mail institucional @fab.mil.br (sem caracteres especiais).")
		}
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
			setEmailError("E-mail inválido. Use seu e-mail @fab.mil.br (sem caracteres especiais).")
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
			if (/e-mail ou senha incorretos|invalid login credentials/i.test(msg)) {
				setPasswordError("Senha incorreta ou e-mail não cadastrado")
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
			setRegisterEmailError("Use seu e-mail institucional @fab.mil.br (sem caracteres especiais).")
		}
	}

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault()
		const norm = normalizeEmail(registerData.email)
		if (!FAB_EMAIL_REGEX.test(norm)) {
			setRegisterEmailError("E-mail inválido. Use seu e-mail @fab.mil.br (sem caracteres especiais).")
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
			// switchTab limpa successMessage — setar depois para a mensagem sobreviver na aba de login.
			switchTab("login")
			setLoginEmail(norm)
			setSuccessMessage("Conta criada! Verifique seu e-mail para confirmar.")
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
			setError("E-mail inválido. Use seu e-mail @fab.mil.br (sem caracteres especiais).")
			return
		}
		setIsSubmitting(true)
		setError("")
		try {
			await actions.resetPassword(norm)
			setSuccessMessage("Link enviado! Verifique sua caixa de entrada.")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao enviar e-mail.")
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
			const { error: updateError } = await actions.updateUserPassword(newPassword)
			if (updateError) throw updateError
			setSuccessMessage("Senha atualizada com sucesso!")
			await onNavigate({ to: "/" })
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao atualizar senha.")
		} finally {
			setIsSubmitting(false)
		}
	}

	// Token de recuperação é consumido no primeiro verifyOtp: a partir daí ele já não
	// é mais válido. Guardamos qual token já foi tentado para não re-verificar num
	// re-render (actions muda de identidade a cada render; o SIGNED_IN da sessão de
	// recuperação também dispara re-render), o que mostraria "Link inválido" à toa.
	const verifiedTokenRef = useRef<string | null>(null)
	useEffect(() => {
		// currentView === "reset" ≡ !!searchParams.token_hash — o link do e-mail traz o token.
		// resetPasswordForEmail gera links com type=recovery; a confirmação de cadastro,
		// type=email. Encaminhamos o tipo real para o verifyOtp em ambos os casos.
		const tokenHash = searchParams.token_hash
		const otpType = searchParams.type
		if (tokenHash && (otpType === "email" || otpType === "recovery") && verifiedTokenRef.current !== tokenHash) {
			verifiedTokenRef.current = tokenHash
			const verify = async () => {
				const { error: otpError } = await actions.verifyOtp(tokenHash, otpType)
				if (otpError) setError("Link inválido ou expirado. Solicite uma nova recuperação.")
			}
			verify()
		}
	}, [searchParams.token_hash, searchParams.type, actions])

	// ── Loading ───────────────────────────────────────────────────────────────
	if (isLoading) {
		return (
			<Shell>
				<Card>
					<div className="flex items-center justify-center gap-3 py-6">
						<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
						<span className="text-body text-muted-foreground">Verificando autenticação...</span>
					</div>
				</Card>
			</Shell>
		)
	}

	// ── Nova senha — ativado por token_hash na URL (link do e-mail) ────────────
	if (currentView === "reset") {
		return (
			<Shell>
				<Card title="Nova senha" subtitle="Defina uma nova senha segura para sua conta.">
					<form onSubmit={handleResetPassword} className="flex flex-col gap-4">
						{error && <ErrorBanner message={error} />}
						{successMessage && <SuccessBanner message={successMessage} />}

						<Field id="reset-password" label="Nova senha">
							<Input
								id="reset-password"
								type="password"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								required
								minLength={8}
								placeholder="Mínimo 8 caracteres"
								autoComplete="new-password"
							/>
						</Field>

						<Button type="submit" className="w-full" disabled={isSubmitting}>
							{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
							{isSubmitting ? "Atualizando..." : "Atualizar senha"}
						</Button>
					</form>
				</Card>
				<div className="flex justify-center">
					<BackToLogin onClick={goToAuth} />
				</div>
			</Shell>
		)
	}

	// ── Recuperar senha — ativado por ?view=forgot na URL ─────────────────────
	if (currentView === "forgot") {
		return (
			<Shell>
				<Card title="Recuperar senha" subtitle="Enviaremos um link de redefinição para o seu e-mail institucional.">
					<form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
						{error && <ErrorBanner message={error} />}
						{successMessage && <SuccessBanner message={successMessage} />}

						<Field id="forgot-email" label="E-mail institucional">
							<Input
								id="forgot-email"
								type="email"
								placeholder="usuario@fab.mil.br"
								value={forgotEmail}
								onChange={(e) => setForgotEmail(e.target.value)}
								required
								autoComplete="email"
							/>
						</Field>

						<Button type="submit" className="w-full" disabled={isSubmitting}>
							{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
							{isSubmitting ? "Enviando..." : "Enviar link"}
						</Button>
					</form>
				</Card>
				<div className="flex justify-center">
					<BackToLogin onClick={goToAuth} />
				</div>
			</Shell>
		)
	}

	// ── Login + Cadastro (toggle por link) ────────────────────────────────────
	const isRegister = activeTab === "register"

	return (
		<Shell>
			{searchParams.denied ? (
				<div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning">
					<ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
					<p className="text-caption leading-relaxed">
						Sua conta está autenticada, mas ainda não possui acesso ao SUCONT-4 HUB. Solicite a liberação a um administrador da seção.
					</p>
				</div>
			) : null}

			<Card>
				{isRegister ? (
					// ── CADASTRO ──
					<form onSubmit={handleRegister} className="flex flex-col gap-4">
						{error && <ErrorBanner message={error} />}

						<Field id="register-name" label="Nome completo">
							<div className="relative">
								<User className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="register-name"
									placeholder="João Silva"
									className="pl-9"
									value={registerData.name}
									onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
									required
									autoComplete="name"
									disabled={isSubmitting}
								/>
							</div>
						</Field>

						<Field id="register-email" label="E-mail institucional">
							<div className="relative">
								<Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="register-email"
									type="email"
									placeholder="usuario@fab.mil.br"
									className={cn("pl-9", registerEmailError && "border-destructive")}
									value={registerData.email}
									onChange={handleRegisterEmailChange}
									required
									autoComplete="email"
									disabled={isSubmitting}
								/>
							</div>
							{registerEmailError && <FieldError>{registerEmailError}</FieldError>}
						</Field>

						<Field id="register-password" label="Senha">
							<Input
								id="register-password"
								type="password"
								placeholder="Mínimo 8 caracteres"
								value={registerData.password}
								onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
								required
								minLength={8}
								autoComplete="new-password"
								disabled={isSubmitting}
							/>
						</Field>

						<Field id="register-confirm" label="Confirmar senha">
							<Input
								id="register-confirm"
								type="password"
								placeholder="Repita a senha"
								value={registerData.confirm}
								onChange={(e) => setRegisterData({ ...registerData, confirm: e.target.value })}
								required
								autoComplete="new-password"
								disabled={isSubmitting}
							/>
						</Field>

						<Button type="submit" className="w-full mt-1" disabled={isSubmitting || !!registerEmailError}>
							{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
							{isSubmitting ? "Criando..." : "Criar conta"}
						</Button>
					</form>
				) : (
					// ── LOGIN ──
					<form onSubmit={handleLogin} className="flex flex-col gap-4">
						{isLocked && <ErrorBanner message={`Muitas tentativas. Tente novamente em ${retryAfter}s.`} />}
						{error && !isLocked && <ErrorBanner message={error} />}
						{successMessage && <SuccessBanner message={successMessage} />}

						<Field id="email" label="E-mail institucional">
							<div className="relative">
								<Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="email"
									type="email"
									autoComplete="username"
									placeholder="usuario@fab.mil.br"
									className={cn("pl-9", emailError && "border-destructive")}
									value={loginEmail}
									onChange={handleLoginEmailChange}
									required
									disabled={isSubmitting}
								/>
							</div>
							{emailError && <FieldError>{emailError}</FieldError>}
						</Field>

						<Field id="password" label="Senha">
							<div className="relative">
								<Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="password"
									type={showPassword ? "text" : "password"}
									autoComplete="current-password"
									placeholder="Sua senha"
									className={cn("pl-9 pr-10", passwordError && "border-destructive")}
									value={loginPassword}
									onChange={(e) => {
										setLoginPassword(e.target.value)
										setError("")
										setPasswordError("")
									}}
									required
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
							{passwordError && <FieldError>{passwordError}</FieldError>}
						</Field>

						<div className="flex items-center justify-between">
							<label className="flex cursor-pointer items-center gap-2 text-caption text-muted-foreground">
								<input
									type="checkbox"
									checked={rememberMe}
									onChange={handleRememberMeChange}
									className="h-3.5 w-3.5 cursor-pointer rounded border border-border accent-tech-blue"
									disabled={isSubmitting}
								/>
								Lembrar e-mail
							</label>
							<Button type="button" onClick={goToForgot} variant="link" className="h-auto p-0 text-caption text-tech-blue">
								Esqueceu a senha?
							</Button>
						</div>

						<Button type="submit" className="w-full" disabled={isSubmitting || isLocked || !!emailError}>
							{isLocked ? (
								`Bloqueado (${retryAfter}s)`
							) : (
								<>
									{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
									{isSubmitting ? "Entrando..." : "Entrar"}
								</>
							)}
						</Button>
					</form>
				)}

				<p className="text-center text-caption text-muted-foreground">
					{isRegister ? "Já tem uma conta? " : "Não tem uma conta? "}
					<Button
						type="button"
						onClick={() => switchTab(isRegister ? "login" : "register")}
						variant="link"
						className="h-auto p-0 font-semibold text-foreground"
					>
						{isRegister ? "Entrar" : "Cadastre-se"}
					</Button>
				</p>
			</Card>
		</Shell>
	)
}
