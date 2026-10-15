import { type AuthScreenConfig, FAB_EMAIL_AUTH_MESSAGES } from "@iefa/auth-kit"
import { type AuthScreenController, useAuthScreen } from "@iefa/auth-kit/react"
import { LegalFooterLinks } from "@iefa/legal-kit/react"
import { ArrowLeft, CheckCircle, CircleAlert, Eye, EyeOff, Loader2, Lock, Mail, Monitor, ShieldAlert, User } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "#/components/ui/input-group"
import { Label } from "#/components/ui/label"
import { TOOL_STAGES } from "#/lib/types"

// View derivada da URL — "reset" ativado por token_hash, "forgot" por ?view=forgot
export type { AuthView } from "@iefa/auth-kit"

/**
 * Regras da tela vêm de @iefa/auth-kit; aqui o que é deste app:
 * - textos com "e-mail";
 * - trocar entre login e cadastro limpa os banners, e a mensagem de conta criada
 *   é gravada depois dessa troca para sobreviver na aba de login;
 * - quem já está autenticado só é redirecionado a partir da view de login (não
 *   arranca o usuário da tela de nova senha, onde o verifyOtp já cria uma sessão
 *   de recuperação);
 * - nova senha salva é confirmada em banner, não em `alert`.
 */
// Nome no padrão que o scanner do inventário de cookies reconhece (`@iefa/legal-kit`).
const STORAGE_KEY_REMEMBER_EMAIL = "sucont_remember_email"

const AUTH_SCREEN_CONFIG: AuthScreenConfig = {
	rememberEmailKey: STORAGE_KEY_REMEMBER_EMAIL,
	messages: {
		...FAB_EMAIL_AUTH_MESSAGES,
		emailHint: "Use seu e-mail institucional @fab.mil.br (sem caracteres especiais).",
		emailInvalid: "E-mail inválido. Use seu e-mail @fab.mil.br (sem caracteres especiais).",
		invalidCredentials: "Senha incorreta ou e-mail não cadastrado",
		signUpSuccess: "Conta criada! Verifique seu e-mail para confirmar.",
		forgotFallback: "Erro ao enviar e-mail.",
	},
	clearFeedbackOnTabSwitch: true,
	redirectOnlyFromAuthView: true,
	resetSuccessFeedback: "banner",
}

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

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
	return (
		<p id={id} className="mt-1 flex items-center gap-1 text-caption text-destructive" role="alert">
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
		<div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-caption text-destructive">
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
		<div className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-caption text-success">
			<CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
			{message}
		</div>
	)
}

function BackToLogin({ onClick }: { onClick: () => void }) {
	return (
		<Button type="button" onClick={onClick} variant="subtle" size="sm" className="mx-auto mt-5">
			<ArrowLeft />
			Voltar ao login
		</Button>
	)
}

type ScreenProps = { screen: AuthScreenController }

// ─── Views ────────────────────────────────────────────────────────────────────

// ── Nova senha — ativado por token_hash na URL (link do e-mail) ────────────
function ResetPasswordView({ screen }: ScreenProps) {
	const { error, successMessage, isSubmitting, newPassword, setNewPassword, goToAuth, handleResetPassword } = screen
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
function ForgotPasswordView({ screen }: ScreenProps) {
	const { error, successMessage, isSubmitting, forgotEmail, setForgotEmail, goToAuth, handleForgotPassword } = screen
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

// ── CADASTRO ──
function RegisterForm({ screen }: ScreenProps) {
	const { error, isSubmitting, registerData, setRegisterData, registerEmailError, handleRegister, handleRegisterEmailChange } = screen
	return (
		<form onSubmit={handleRegister} className="flex flex-col gap-4">
			{error && <ErrorBanner message={error} />}

			<Field id="register-name" label="Nome completo">
				<InputGroup>
					<InputGroupAddon>
						<User />
					</InputGroupAddon>
					<InputGroupInput
						id="register-name"
						placeholder="João Silva"
						value={registerData.name}
						onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
						required
						autoComplete="name"
						disabled={isSubmitting}
					/>
				</InputGroup>
			</Field>

			<Field id="register-email" label="E-mail institucional">
				<InputGroup>
					<InputGroupAddon>
						<Mail />
					</InputGroupAddon>
					<InputGroupInput
						id="register-email"
						type="email"
						placeholder="usuario@fab.mil.br"
						aria-invalid={registerEmailError ? true : undefined}
						aria-describedby={registerEmailError ? "register-email-error" : undefined}
						value={registerData.email}
						onChange={handleRegisterEmailChange}
						required
						autoComplete="email"
						disabled={isSubmitting}
					/>
				</InputGroup>
				{registerEmailError && <FieldError id="register-email-error">{registerEmailError}</FieldError>}
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
	)
}

function LoginPasswordField({ screen }: ScreenProps) {
	const { isSubmitting, showPassword, setShowPassword, loginPassword, passwordError, handleLoginPasswordChange } = screen
	return (
		<Field id="password" label="Senha">
			<InputGroup>
				<InputGroupAddon>
					<Lock />
				</InputGroupAddon>
				<InputGroupInput
					id="password"
					type={showPassword ? "text" : "password"}
					autoComplete="current-password"
					placeholder="Sua senha"
					aria-invalid={passwordError ? true : undefined}
					aria-describedby={passwordError ? "password-error" : undefined}
					value={loginPassword}
					onChange={handleLoginPasswordChange}
					required
					disabled={isSubmitting}
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						variant="subtle"
						size="icon-xs"
						onClick={() => setShowPassword(!showPassword)}
						aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
					>
						{showPassword ? <EyeOff /> : <Eye />}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
			{passwordError && <FieldError id="password-error">{passwordError}</FieldError>}
		</Field>
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
		rememberMe,
		goToForgot,
		handleLogin,
		handleLoginEmailChange,
		handleRememberMeChange,
	} = screen
	return (
		<form onSubmit={handleLogin} className="flex flex-col gap-4">
			{isLocked && <ErrorBanner message="Muitas tentativas." detail={`Tente novamente em ${retryAfter}s.`} />}
			{error && !isLocked && <ErrorBanner message={error} />}
			{successMessage && <SuccessBanner message={successMessage} />}

			<Field id="email" label="E-mail institucional">
				<InputGroup>
					<InputGroupAddon>
						<Mail />
					</InputGroupAddon>
					<InputGroupInput
						id="email"
						type="email"
						autoComplete="username"
						placeholder="usuario@fab.mil.br"
						aria-invalid={emailError ? true : undefined}
						aria-describedby={emailError ? "email-error" : undefined}
						value={loginEmail}
						onChange={handleLoginEmailChange}
						required
						disabled={isSubmitting}
					/>
				</InputGroup>
				{emailError && <FieldError id="email-error">{emailError}</FieldError>}
			</Field>

			<LoginPasswordField screen={screen} />

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
				<Button type="button" onClick={goToForgot} variant="link" className="h-auto p-0 text-tech-blue">
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
	)
}

// ─── AuthScreen ───────────────────────────────────────────────────────────────

export function AuthScreen(props: AuthScreenProps) {
	// Aqui só o token_hash abre a view de nova senha: não há sessão de recuperação.
	const screen = useAuthScreen({ ...props, isRecoverySession: false, config: AUTH_SCREEN_CONFIG })

	// ── Loading ───────────────────────────────────────────────────────────────
	if (props.isLoading) {
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

	if (screen.currentView === "reset") return <ResetPasswordView screen={screen} />
	if (screen.currentView === "forgot") return <ForgotPasswordView screen={screen} />

	// ── Login + Cadastro (toggle por link) ────────────────────────────────────
	const isRegister = screen.activeTab === "register"

	return (
		<Shell>
			{props.searchParams.denied ? (
				<div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning">
					<ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
					<p className="text-caption leading-relaxed">
						Sua conta está autenticada, mas ainda não possui acesso ao SUCONT-4 HUB. Solicite a liberação a um administrador da seção.
					</p>
				</div>
			) : null}

			<Card>
				{isRegister ? <RegisterForm screen={screen} /> : <LoginForm screen={screen} />}

				<p className="text-center text-caption text-muted-foreground">
					{isRegister ? "Já tem uma conta? " : "Não tem uma conta? "}
					<Button type="button" onClick={() => screen.switchTab(isRegister ? "login" : "register")} variant="link" className="h-auto p-0 text-foreground">
						{isRegister ? "Entrar" : "Cadastre-se"}
					</Button>
				</p>
			</Card>
		</Shell>
	)
}
