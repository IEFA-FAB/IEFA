import { type AuthScreenConfig, type AuthTab, FAB_EMAIL_AUTH_MESSAGES } from "@iefa/auth-kit"
import { type AuthScreenController, useAuthScreen } from "@iefa/auth-kit/react"
import { ArrowLeft, CheckCircle, Eye, EyeClosed, Lock, Mail, Refresh, User, WarningCircle } from "iconoir-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// view derivada da URL — "reset" ativado por token_hash (ou pela sessão de
// recuperação que o client abre sozinho), "forgot" por ?view=forgot
export type { AuthView } from "@iefa/auth-kit"

// Regras e textos da tela vêm de @iefa/auth-kit; aqui só o que é deste app.
// portal e contrate têm este arquivo idêntico (cópia por contrato).
const AUTH_SCREEN_CONFIG: AuthScreenConfig = {
	rememberEmailKey: "fab_remember_email",
	messages: FAB_EMAIL_AUTH_MESSAGES,
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

type ScreenProps = { screen: AuthScreenController }

// ─── Views ────────────────────────────────────────────────────────────────────

// ── Reset password — ativado por token_hash na URL (link do email) ────────
function ResetPasswordView({ screen }: ScreenProps) {
	const { error, isSubmitting, newPassword, setNewPassword, goToAuth, handleResetPassword } = screen
	return (
		<div className="w-full">
			<Button type="button" variant="ghost" size="sm" onClick={goToAuth} className="mb-6 text-muted-foreground px-2">
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
						<Button type="submit" className="w-full h-11" disabled={isSubmitting}>
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
function ForgotPasswordView({ screen }: ScreenProps) {
	const { error, successMessage, isSubmitting, forgotEmail, setForgotEmail, goToAuth, handleForgotPassword } = screen
	return (
		<div className="w-full">
			{/* goToAuth remove ?view=forgot — back button do browser também funciona */}
			<Button type="button" variant="ghost" size="sm" onClick={goToAuth} className="mb-6 text-muted-foreground px-2">
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
						<Button type="submit" className="w-full h-11" disabled={isSubmitting}>
							{isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
							Enviar Link
						</Button>
					</div>
				</form>
			</div>
		</div>
	)
}

function LoginPasswordField({ screen }: ScreenProps) {
	const { isSubmitting, showPassword, setShowPassword, loginPassword, passwordError, goToForgot, handleLoginPasswordChange } = screen
	return (
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
					disabled={isSubmitting}
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					onClick={() => setShowPassword(!showPassword)}
					className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
					aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
				>
					{showPassword ? <EyeClosed className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
				</Button>
			</div>
			{passwordError && <FieldError>{passwordError}</FieldError>}
		</div>
	)
}

function LoginPanel({ screen }: ScreenProps) {
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
		handleLogin,
		handleLoginEmailChange,
		handleRememberMeChange,
	} = screen
	return (
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
					<LoginPasswordField screen={screen} />

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
					<Button type="submit" className="w-full h-11" disabled={isSubmitting || isLocked || !!emailError || !!passwordError}>
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
	)
}

function RegisterPanel({ screen }: ScreenProps) {
	const { error, isSubmitting, registerData, setRegisterData, registerEmailError, handleRegister, handleRegisterEmailChange } = screen
	return (
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
						<FieldLabel>Nome completo</FieldLabel>
						<div className="relative">
							<User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
							<Input
								placeholder="João Silva"
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
					<Button type="submit" className="w-full h-11" disabled={isSubmitting || !!registerEmailError}>
						{isSubmitting && <Refresh className="mr-2 h-4 w-4 animate-spin" />}
						{isSubmitting ? "Criando..." : "Criar conta"}
					</Button>
				</div>
			</form>
		</div>
	)
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

export function AuthScreen(props: AuthScreenProps) {
	const screen = useAuthScreen({ ...props, config: AUTH_SCREEN_CONFIG })

	// ── Loading ───────────────────────────────────────────────────────────────
	if (props.isLoading) {
		return (
			<div className="border border-border bg-card px-8 py-10 flex items-center gap-3">
				<Refresh className="h-4 w-4 animate-spin text-muted-foreground" />
				<span className="text-sm text-muted-foreground">Verificando autenticação...</span>
			</div>
		)
	}

	if (screen.currentView === "reset") return <ResetPasswordView screen={screen} />
	if (screen.currentView === "forgot") return <ForgotPasswordView screen={screen} />

	// ── Auth: Login + Register tabs ───────────────────────────────────────────
	return (
		<div className="w-full">
			<Tabs value={screen.activeTab} onValueChange={(value: AuthTab) => screen.switchTab(value)} className="w-full gap-0">
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
					<LoginPanel screen={screen} />
				</TabsContent>

				{/* ── REGISTER ── */}
				<TabsContent value="register" className="mt-0">
					<RegisterPanel screen={screen} />
				</TabsContent>
			</Tabs>
		</div>
	)
}
