import { type AuthScreenConfig, FAB_EMAIL_AUTH_MESSAGES } from "@iefa/auth-kit"
import { type AuthScreenController, useAuthScreen } from "@iefa/auth-kit/react"
import { ArrowLeft, CheckCircle, CircleAlert, Eye, EyeOff, Lock, Mail, RefreshCw, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// view derivada da URL — "reset" ativado por token_hash (ou pela sessão de
// recuperação que o client abre sozinho), "forgot" por ?view=forgot
export type { AuthView } from "@iefa/auth-kit"

// Regras e textos da tela vêm de @iefa/auth-kit; aqui só o que é deste app.
// Trocar entre login e cadastro limpa os banners; a mensagem de conta criada é
// gravada depois dessa troca para sobreviver na aba de login.
// Nome no padrão que o scanner do inventário de cookies reconhece (`@iefa/legal-kit`).
const STORAGE_KEY_REMEMBER_EMAIL = "fab_remember_email"

const AUTH_SCREEN_CONFIG: AuthScreenConfig = {
	rememberEmailKey: STORAGE_KEY_REMEMBER_EMAIL,
	messages: FAB_EMAIL_AUTH_MESSAGES,
	clearFeedbackOnTabSwitch: true,
}

export interface AuthScreenProps {
	isLoading: boolean
	isAuthenticated: boolean
	/**
	 * O template `{{ .ConfirmationURL }}` devolve o link sem token_hash: os tokens
	 * chegam no hash (ou como `?code=`) e o próprio client os consome, emitindo
	 * PASSWORD_RECOVERY. Sem esse sinal a tela mostraria o login para quem acabou
	 * de clicar em "redefinir senha".
	 */
	isRecoverySession?: boolean
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
		verifyOtp: (token_hash: string, type: "email" | "recovery") => Promise<{ error: Error | null }>
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

/**
 * Só a `message` fica na região anunciada (`role="alert"`). O `detail` fica fora dela: a contagem
 * da trava muda a cada segundo e, dentro do alerta, o leitor de tela a anunciaria a cada troca.
 */
function ErrorBanner({ message, detail }: { message: string; detail?: string }) {
	return (
		<div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
			<CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
			<span>
				<span role="alert">{message}</span>
				{detail && ` ${detail}`}
			</span>
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

type ScreenProps = { screen: AuthScreenController }

// ─── Views ────────────────────────────────────────────────────────────────────

// ── Reset password — ativado por token_hash na URL (link do email) ────────
function ResetPasswordView({ screen }: ScreenProps) {
	const { error, isSubmitting, newPassword, setNewPassword, goToAuth, handleResetPassword } = screen
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

				<Button type="submit" className="h-11 w-full rounded-xl" disabled={isSubmitting}>
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
function ForgotPasswordView({ screen }: ScreenProps) {
	const { error, successMessage, isSubmitting, forgotEmail, setForgotEmail, goToAuth, handleForgotPassword } = screen
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

				<Button type="submit" className="h-11 w-full rounded-xl" disabled={isSubmitting}>
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

// ── REGISTER ──
function RegisterForm({ screen }: ScreenProps) {
	const { error, isSubmitting, registerData, setRegisterData, registerEmailError, handleRegister, handleRegisterEmailChange } = screen
	return (
		<form onSubmit={handleRegister} className="space-y-3.5">
			{error && <ErrorBanner message={error} />}

			<IconField id="register-name" icon={User} label="Nome completo">
				{(cls) => (
					<Input
						id="register-name"
						placeholder="João Silva"
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

			<Button type="submit" className="mt-1 h-11 w-full rounded-xl" disabled={isSubmitting || !!registerEmailError}>
				{isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
				{isSubmitting ? "Criando..." : "Criar conta"}
			</Button>
		</form>
	)
}

function LoginPasswordField({ screen }: ScreenProps) {
	const { isSubmitting, showPassword, setShowPassword, loginPassword, passwordError, handleLoginPasswordChange } = screen
	return (
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
							className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground"
							aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
						>
							{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
						</Button>
					</div>
				)}
			</IconField>
			{passwordError && <FieldError>{passwordError}</FieldError>}
		</div>
	)
}

// ── LOGIN ──
function LoginForm({ screen }: ScreenProps) {
	const {
		isLocked,
		retryAfter,
		error,
		successMessage,
		isSubmitting,
		loginEmail,
		emailError,
		passwordError,
		rememberMe,
		goToForgot,
		handleLogin,
		handleLoginEmailChange,
		handleRememberMeChange,
	} = screen
	return (
		<form onSubmit={handleLogin} className="space-y-3.5">
			{isLocked && <ErrorBanner message="Muitas tentativas." detail={`Tente novamente em ${retryAfter}s.`} />}
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

			<LoginPasswordField screen={screen} />

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

			<Button type="submit" className="mt-1 h-11 w-full rounded-xl" disabled={isSubmitting || isLocked || !!emailError || !!passwordError}>
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
	)
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

export function AuthScreen(props: AuthScreenProps) {
	const screen = useAuthScreen({ ...props, config: AUTH_SCREEN_CONFIG })

	// ── Loading ───────────────────────────────────────────────────────────────
	if (props.isLoading) {
		return (
			<div className="flex items-center justify-center gap-3 py-10">
				<RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
				<span className="text-sm text-muted-foreground">Verificando autenticação...</span>
			</div>
		)
	}

	if (screen.currentView === "reset") return <ResetPasswordView screen={screen} />
	if (screen.currentView === "forgot") return <ForgotPasswordView screen={screen} />

	// ── Auth: Login + Register (toggle por link) ──────────────────────────────
	const isRegister = screen.activeTab === "register"

	return (
		<div className="w-full">
			<BrandHeader eyebrow={isRegister ? "Crie sua conta no" : "Entre no"} title="RUMAER" />

			{isRegister ? <RegisterForm screen={screen} /> : <LoginForm screen={screen} />}

			{/* ── Toggle login/cadastro ── */}
			<p className="mt-6 text-center text-sm text-muted-foreground">
				{isRegister ? "Já tem uma conta? " : "Não tem uma conta? "}
				<button
					type="button"
					onClick={() => screen.switchTab(isRegister ? "login" : "register")}
					className="font-semibold text-foreground underline-offset-4 hover:underline"
				>
					{isRegister ? "Entrar" : "Cadastre-se"}
				</button>
			</p>
		</div>
	)
}
