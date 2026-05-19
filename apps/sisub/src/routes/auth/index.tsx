// Routing
import { createFileRoute } from "@tanstack/react-router"
// Icons
import {
	AlertCircle,
	ArrowLeft,
	BarChart3,
	CheckCircle2,
	ChevronRight,
	ClipboardCheck,
	Eye,
	EyeOff,
	Loader2,
	Lock,
	Mail,
	QrCode,
	ShieldCheck,
	User as UserIcon,
} from "lucide-react"
// React
import { useEffect, useReducer, useState } from "react"
// Validation
import { z } from "zod"
// Hooks + Services
import { useLoginRateLimiter } from "@/auth/rate-limiter"
// UI
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/auth/useAuth"
import { cn } from "@/lib/cn"
import supabase from "@/lib/supabase"

/* ========================================================================
   ROUTE DEFINITION
   ======================================================================== */

const searchSchema = z.object({
	redirect: z.string().optional(),
	tab: z.enum(["login", "register"]).optional().default("login"),
	token_hash: z.string().optional(),
	type: z.string().optional(),
})

export const Route = createFileRoute("/auth/")({
	validateSearch: searchSchema,
	head: () => ({
		meta: [{ title: "Entrar — SISUB" }, { name: "description", content: "Acesse o Sistema de Subsistência da Força Aérea Brasileira." }],
	}),
	component: AuthPage,
})

/* ========================================================================
   HELPERS
   ======================================================================== */

const FAB_EMAIL_RE = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/
const REMEMBER_KEY = "fab_remember_email"

function validateEmail(v: string): string | null {
	if (!v) return "Email obrigatório."
	if (!FAB_EMAIL_RE.test(v)) return "Use seu email institucional @fab.mil.br (sem caracteres especiais)."
	return null
}

function validatePassword(v: string): string | null {
	if (!v) return "Senha obrigatória."
	if (v.length < 8) return "Mínimo de 8 caracteres."
	if (!/[a-z]/.test(v)) return "Inclua pelo menos uma letra minúscula."
	if (!/[A-Z]/.test(v)) return "Inclua pelo menos uma letra maiúscula."
	if (!/\d/.test(v)) return "Inclua pelo menos um número."
	return null
}

/* ========================================================================
   INFO PANEL DATA  (mesma linguagem visual do steps da landing page)
   ======================================================================== */

const HIGHLIGHTS = [
	{ icon: ClipboardCheck, text: "Cardápios e planejamento nutricional" },
	{ icon: QrCode, text: "Controle de presença por QR code" },
	{ icon: BarChart3, text: "Analytics e BI operacional" },
]

/* ========================================================================
   TYPES
   ======================================================================== */

type AuthView = "tabs" | "forgot" | "verify-loading" | "verify-success" | "verify-error"

/* ========================================================================
   VIEW-MODEL (ROTA)
   ======================================================================== */

function AuthPage() {
	const { signIn, signUp, resetPassword } = useAuth()
	const search = Route.useSearch()
	const navigate = Route.useNavigate()

	const hasOtp = !!(search.token_hash && search.type === "email")
	const [view, setView] = useState<AuthView>(hasOtp ? "verify-loading" : "tabs")

	// Verificação de OTP (confirmação de email via link)
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount, hasOtp/navigate/search are stable
	useEffect(() => {
		if (!hasOtp) return
		let timerId: ReturnType<typeof setTimeout>
		supabase.auth.verifyOtp({ token_hash: search.token_hash as string, type: "email" }).then(({ error }) => {
			if (error) {
				setView("verify-error")
			} else {
				setView("verify-success")
				timerId = setTimeout(() => navigate({ to: search.redirect || "/hub" }), 2000)
			}
		})
		return () => clearTimeout(timerId)
	}, [])

	const changeTab = (tab: "login" | "register") => navigate({ search: (prev) => ({ ...prev, tab }), replace: true })

	const handleSignIn = async (email: string, password: string) => {
		await signIn(email, password)
		await navigate({ to: search.redirect || "/hub" })
	}

	const handleSignUp = async (email: string, password: string, name: string) => {
		await signUp(email, password, name)
	}

	return (
		<div className="flex-1 flex w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8">
			{/* ============================================================
			    ESQUERDA — painel de info, visível apenas desktop (lg+)
			    ============================================================ */}
			<aside
				className="hidden lg:flex lg:w-2/5 xl:w-[45%] flex-col justify-center border-r border-border py-12 pr-12 xl:pr-16 animate-fade-slide-in"
				aria-label="Informações do sistema"
			>
				<p className="font-mono text-xs text-muted-foreground tracking-[0.2em] uppercase mb-8">Sistema de Subsistência · Força Aérea Brasileira</p>

				<h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[0.95] text-foreground mb-6">
					Gerencie
					<br />o <span className="text-primary">rancho</span>
					<br />
					da sua OM.
				</h1>

				<p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-[22rem]">
					Plataforma integrada de subsistência — do planejamento nutricional ao empenho de insumos, em toda a rede da FAB.
				</p>

				{/* Lista de destaques — mesmo padrão dos steps da landing page */}
				<div className="border-y border-border divide-y divide-border">
					{HIGHLIGHTS.map((item, i) => {
						const Icon = item.icon
						return (
							<div key={item.text} className="flex items-center gap-4 py-4 stagger-item">
								<span className="font-mono text-xl font-bold text-muted-foreground/40 tabular-nums min-w-[2rem] leading-none">
									{String(i + 1).padStart(2, "0")}
								</span>
								<Icon className="size-4 text-primary shrink-0" aria-hidden />
								<span className="text-sm font-medium">{item.text}</span>
							</div>
						)
					})}
				</div>

				<p className="mt-8 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
					<ShieldCheck className="size-3.5 shrink-0" aria-hidden />
					Acesso restrito a militares da FAB (@fab.mil.br)
				</p>
			</aside>

			{/* ============================================================
			    DIREITA — painel de formulários
			    ============================================================ */}
			<section className="flex-1 flex flex-col justify-center py-10 lg:pl-12 xl:pl-16" aria-label="Autenticação">
				<div className="w-full max-w-sm mx-auto lg:mx-0">
					{/* ── OTP: verificando ── */}
					{view === "verify-loading" && (
						<div className="flex flex-col items-center gap-4 py-16" role="status" aria-live="polite">
							<Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden />
							<p className="font-mono text-sm text-muted-foreground">Verificando email...</p>
						</div>
					)}

					{/* ── OTP: email confirmado ── */}
					{view === "verify-success" && (
						<div className="flex flex-col items-center gap-4 py-16" role="status" aria-live="polite">
							<CheckCircle2 className="size-8 text-primary" aria-hidden />
							<p className="font-bold text-lg">Email confirmado!</p>
							<p className="font-mono text-sm text-muted-foreground">Redirecionando para o sistema...</p>
						</div>
					)}

					{/* ── OTP: link inválido ── */}
					{view === "verify-error" && (
						<div className="flex flex-col gap-5">
							<div>
								<p className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase mb-2">Confirmação de email</p>
								<h2 className="text-xl font-bold mb-1">Link inválido</h2>
								<p className="text-sm text-muted-foreground">O link de confirmação expirou ou não é mais válido.</p>
							</div>
							<Alert variant="destructive">
								<AlertCircle className="size-4" />
								<AlertDescription>Solicite um novo email de confirmação.</AlertDescription>
							</Alert>
							<Button variant="ghost" size="sm" onClick={() => setView("tabs")} className="self-start gap-1.5 font-mono text-xs">
								<ArrowLeft className="size-3.5" aria-hidden />
								Voltar ao login
							</Button>
						</div>
					)}

					{/* ── Recuperar senha ── */}
					{view === "forgot" && <ForgotView onBack={() => setView("tabs")} onSubmit={resetPassword} />}

					{/* ── Tabs: Entrar / Criar conta ── */}
					{view === "tabs" && (
						<Tabs value={search.tab} onValueChange={(v) => changeTab(v as "login" | "register")}>
							<TabsList className="w-full mb-8">
								<TabsTrigger value="login" className="flex-1">
									Entrar
								</TabsTrigger>
								<TabsTrigger value="register" className="flex-1">
									Criar conta
								</TabsTrigger>
							</TabsList>

							<TabsContent value="login">
								<LoginView onSubmit={handleSignIn} onForgotPassword={() => setView("forgot")} />
							</TabsContent>

							<TabsContent value="register">
								<RegisterView onSubmit={handleSignUp} onBack={() => changeTab("login")} />
							</TabsContent>
						</Tabs>
					)}
				</div>
			</section>
		</div>
	)
}

/* ========================================================================
   LOGIN VIEW
   ======================================================================== */

// ─── LoginView reducer ────────────────────────────────────────────────────────

type LoginState = {
	email: string
	password: string
	remember: boolean
	showPassword: boolean
	error: string
	isSubmitting: boolean
}

type LoginAction =
	| { type: "SET_EMAIL"; value: string }
	| { type: "SET_PASSWORD"; value: string }
	| { type: "SET_REMEMBER"; value: boolean }
	| { type: "TOGGLE_SHOW_PASSWORD" }
	| { type: "SET_ERROR"; value: string }
	| { type: "SET_SUBMITTING"; value: boolean }

function loginReducer(state: LoginState, action: LoginAction): LoginState {
	switch (action.type) {
		case "SET_EMAIL":
			return { ...state, email: action.value }
		case "SET_PASSWORD":
			return { ...state, password: action.value }
		case "SET_REMEMBER":
			return { ...state, remember: action.value }
		case "TOGGLE_SHOW_PASSWORD":
			return { ...state, showPassword: !state.showPassword }
		case "SET_ERROR":
			return { ...state, error: action.value }
		case "SET_SUBMITTING":
			return { ...state, isSubmitting: action.value }
		default:
			return state
	}
}

interface LoginViewProps {
	onSubmit: (email: string, password: string) => Promise<void>
	onForgotPassword: () => void
}

function LoginView({ onSubmit, onForgotPassword }: LoginViewProps) {
	"use no memo"
	const { isLocked, retryAfter, onFailure, onSuccess } = useLoginRateLimiter()
	const [loginState, dispatch] = useReducer(loginReducer, undefined, () => {
		let savedEmail = ""
		let hasSaved = false
		try {
			savedEmail = localStorage.getItem(REMEMBER_KEY) ?? ""
			hasSaved = !!savedEmail
		} catch {}
		return { email: savedEmail, password: "", remember: hasSaved, showPassword: false, error: "", isSubmitting: false }
	})
	const { email, password, remember, showPassword, error, isSubmitting } = loginState

	const emailErr = email ? validateEmail(email) : null
	const passwordErr = null

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		if (isLocked) return
		const eErr = validateEmail(email)
		if (!password) {
			dispatch({ type: "SET_ERROR", value: "Senha obrigatória." })
			return
		}
		if (eErr) {
			dispatch({ type: "SET_ERROR", value: eErr })
			return
		}
		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })
		try {
			if (remember) localStorage.setItem(REMEMBER_KEY, email)
			else localStorage.removeItem(REMEMBER_KEY)
			await onSubmit(email.trim().toLowerCase(), password)
			onSuccess()
		} catch (err) {
			onFailure()
			dispatch({ type: "SET_ERROR", value: err instanceof Error ? err.message : "Erro ao entrar. Tente novamente." })
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	return (
		<form onSubmit={handleSubmit} noValidate className="space-y-5">
			{isLocked && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertDescription>Muitas tentativas. Tente novamente em {retryAfter}s.</AlertDescription>
				</Alert>
			)}
			{error && !isLocked && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Email */}
			<div className="space-y-1.5">
				<Label htmlFor="login-email" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Email
				</Label>
				<div className="relative">
					<Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="login-email"
						type="email"
						autoComplete="email"
						placeholder="seu.nome@fab.mil.br"
						value={email}
						onChange={(e) => {
							dispatch({ type: "SET_EMAIL", value: e.target.value })
							dispatch({ type: "SET_ERROR", value: "" })
						}}
						className={cn("pl-9", emailErr && "border-destructive")}
						aria-invalid={!!emailErr || undefined}
						aria-describedby={emailErr ? "login-email-error" : undefined}
						disabled={isSubmitting}
					/>
				</div>
				{emailErr && (
					<p id="login-email-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="size-3 shrink-0" aria-hidden /> {emailErr}
					</p>
				)}
			</div>

			{/* Senha */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<Label htmlFor="login-password" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
						Senha
					</Label>
					<button
						type="button"
						onClick={onForgotPassword}
						className="cursor-pointer font-mono text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
					>
						Esqueceu a senha?
					</button>
				</div>
				<div className="relative">
					<Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="login-password"
						type={showPassword ? "text" : "password"}
						autoComplete="current-password"
						placeholder="••••••"
						value={password}
						onChange={(e) => {
							dispatch({ type: "SET_PASSWORD", value: e.target.value })
							dispatch({ type: "SET_ERROR", value: "" })
						}}
						className={cn("pl-9 pr-10", passwordErr && "border-destructive")}
						aria-invalid={!!passwordErr || undefined}
						aria-describedby={passwordErr ? "login-password-error" : undefined}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={() => dispatch({ type: "TOGGLE_SHOW_PASSWORD" })}
						className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
						aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
					>
						{showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
					</button>
				</div>
				{passwordErr && (
					<p id="login-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="size-3 shrink-0" aria-hidden /> {passwordErr}
					</p>
				)}
			</div>

			{/* Lembrar email */}
			<div className="flex items-center gap-2">
				<Checkbox id="remember" checked={remember} onCheckedChange={(c) => dispatch({ type: "SET_REMEMBER", value: !!c })} disabled={isSubmitting} />
				<label htmlFor="remember" className="font-mono text-xs text-muted-foreground cursor-pointer select-none">
					Lembrar email
				</label>
			</div>

			<Button type="submit" className="w-full gap-2" disabled={isSubmitting || isLocked}>
				{isLocked ? (
					<>Bloqueado ({retryAfter}s)</>
				) : isSubmitting ? (
					<>
						<Loader2 className="size-4 animate-spin" aria-hidden /> Entrando...
					</>
				) : (
					<>
						Entrar <ChevronRight className="size-4" aria-hidden />
					</>
				)}
			</Button>
		</form>
	)
}

/* ========================================================================
   REGISTER VIEW
   ======================================================================== */

// ─── RegisterView reducer ─────────────────────────────────────────────────────

type RegisterState = {
	name: string
	email: string
	password: string
	confirm: string
	showPassword: boolean
	showConfirm: boolean
	error: string
	isSubmitting: boolean
	submitted: boolean
}

type RegisterAction =
	| { type: "SET_NAME"; value: string }
	| { type: "SET_EMAIL"; value: string }
	| { type: "SET_PASSWORD"; value: string }
	| { type: "SET_CONFIRM"; value: string }
	| { type: "TOGGLE_SHOW_PASSWORD" }
	| { type: "TOGGLE_SHOW_CONFIRM" }
	| { type: "SET_ERROR"; value: string }
	| { type: "SET_SUBMITTING"; value: boolean }
	| { type: "SET_SUBMITTED"; value: boolean }

const initialRegisterState: RegisterState = {
	name: "",
	email: "",
	password: "",
	confirm: "",
	showPassword: false,
	showConfirm: false,
	error: "",
	isSubmitting: false,
	submitted: false,
}

function registerReducer(state: RegisterState, action: RegisterAction): RegisterState {
	switch (action.type) {
		case "SET_NAME":
			return { ...state, name: action.value }
		case "SET_EMAIL":
			return { ...state, email: action.value }
		case "SET_PASSWORD":
			return { ...state, password: action.value }
		case "SET_CONFIRM":
			return { ...state, confirm: action.value }
		case "TOGGLE_SHOW_PASSWORD":
			return { ...state, showPassword: !state.showPassword }
		case "TOGGLE_SHOW_CONFIRM":
			return { ...state, showConfirm: !state.showConfirm }
		case "SET_ERROR":
			return { ...state, error: action.value }
		case "SET_SUBMITTING":
			return { ...state, isSubmitting: action.value }
		case "SET_SUBMITTED":
			return { ...state, submitted: action.value }
		default:
			return state
	}
}

interface RegisterViewProps {
	onSubmit: (email: string, password: string, name: string) => Promise<void>
	onBack: () => void
}

function RegisterView({ onSubmit, onBack }: RegisterViewProps) {
	"use no memo"
	const [regState, dispatch] = useReducer(registerReducer, initialRegisterState)
	const { name, email, password, confirm, showPassword, showConfirm, error, isSubmitting, submitted } = regState

	const emailErr = email ? validateEmail(email) : null
	const passwordErr = password ? validatePassword(password) : null
	const confirmErr = confirm && confirm !== password ? "As senhas não coincidem." : null

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		if (!name.trim()) {
			dispatch({ type: "SET_ERROR", value: "Nome obrigatório." })
			return
		}
		const eErr = validateEmail(email)
		const pErr = validatePassword(password)
		const cErr = password !== confirm ? "As senhas não coincidem." : null
		if (eErr || pErr || cErr) {
			dispatch({ type: "SET_ERROR", value: eErr || pErr || cErr || "" })
			return
		}
		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })
		try {
			await onSubmit(email.trim().toLowerCase(), password, name.trim())
			dispatch({ type: "SET_SUBMITTED", value: true })
		} catch (err) {
			dispatch({ type: "SET_ERROR", value: err instanceof Error ? err.message : "Erro ao criar conta. Tente novamente." })
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	if (submitted) {
		return (
			<div className="flex flex-col items-center gap-5 py-8 text-center">
				<CheckCircle2 className="size-10 text-primary" aria-hidden />
				<div>
					<p className="font-bold text-base mb-1">Cadastro realizado!</p>
					<p className="text-sm text-muted-foreground leading-relaxed">Verifique seu email institucional para ativar a conta antes de fazer login.</p>
				</div>
				<Button variant="outline" size="sm" onClick={onBack} className="gap-1.5 font-mono text-xs mt-2">
					<ArrowLeft className="size-3.5" aria-hidden />
					Ir para o login
				</Button>
			</div>
		)
	}

	return (
		<form onSubmit={handleSubmit} noValidate className="space-y-4">
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="size-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Nome */}
			<div className="space-y-1.5">
				<Label htmlFor="reg-name" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Nome completo
				</Label>
				<div className="relative">
					<UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-name"
						type="text"
						autoComplete="name"
						placeholder="Ten. Fulano da Silva"
						value={name}
						onChange={(e) => {
							dispatch({ type: "SET_NAME", value: e.target.value })
							dispatch({ type: "SET_ERROR", value: "" })
						}}
						className="pl-9"
						disabled={isSubmitting}
					/>
				</div>
			</div>

			{/* Email */}
			<div className="space-y-1.5">
				<Label htmlFor="reg-email" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Email institucional
				</Label>
				<div className="relative">
					<Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-email"
						type="email"
						autoComplete="email"
						placeholder="seu.nome@fab.mil.br"
						value={email}
						onChange={(e) => {
							dispatch({ type: "SET_EMAIL", value: e.target.value })
							dispatch({ type: "SET_ERROR", value: "" })
						}}
						className={cn("pl-9", emailErr && "border-destructive")}
						aria-invalid={!!emailErr || undefined}
						aria-describedby={emailErr ? "reg-email-error" : undefined}
						disabled={isSubmitting}
					/>
				</div>
				{emailErr && (
					<p id="reg-email-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="size-3 shrink-0" aria-hidden /> {emailErr}
					</p>
				)}
			</div>

			{/* Senha */}
			<div className="space-y-1.5">
				<Label htmlFor="reg-password" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Senha
				</Label>
				<div className="relative">
					<Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-password"
						type={showPassword ? "text" : "password"}
						autoComplete="new-password"
						placeholder="Mínimo 8 caracteres"
						value={password}
						onChange={(e) => {
							dispatch({ type: "SET_PASSWORD", value: e.target.value })
							dispatch({ type: "SET_ERROR", value: "" })
						}}
						className={cn("pl-9 pr-10", passwordErr && "border-destructive")}
						aria-invalid={!!passwordErr || undefined}
						aria-describedby={passwordErr ? "reg-password-error" : undefined}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={() => dispatch({ type: "TOGGLE_SHOW_PASSWORD" })}
						className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
						aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
					>
						{showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
					</button>
				</div>
				{passwordErr && (
					<p id="reg-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="size-3 shrink-0" aria-hidden /> {passwordErr}
					</p>
				)}
			</div>

			{/* Confirmar Senha */}
			<div className="space-y-1.5">
				<Label htmlFor="reg-confirm" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Confirmar senha
				</Label>
				<div className="relative">
					<Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-confirm"
						type={showConfirm ? "text" : "password"}
						autoComplete="new-password"
						placeholder="Digite a senha novamente"
						value={confirm}
						onChange={(e) => {
							dispatch({ type: "SET_CONFIRM", value: e.target.value })
							dispatch({ type: "SET_ERROR", value: "" })
						}}
						className={cn("pl-9 pr-10", confirmErr && "border-destructive")}
						aria-invalid={!!confirmErr || undefined}
						aria-describedby={confirmErr ? "reg-confirm-error" : undefined}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={() => dispatch({ type: "TOGGLE_SHOW_CONFIRM" })}
						className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
						aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
					>
						{showConfirm ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
					</button>
				</div>
				{confirmErr && (
					<p id="reg-confirm-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="size-3 shrink-0" aria-hidden /> {confirmErr}
					</p>
				)}
			</div>

			<Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
				{isSubmitting ? (
					<>
						<Loader2 className="size-4 animate-spin" aria-hidden /> Criando conta...
					</>
				) : (
					<>
						Criar conta <ChevronRight className="size-4" aria-hidden />
					</>
				)}
			</Button>
		</form>
	)
}

/* ========================================================================
   FORGOT VIEW
   ======================================================================== */

// ─── ForgotView reducer ───────────────────────────────────────────────────────

type ForgotState = {
	email: string
	error: string
	isSubmitting: boolean
	submitted: boolean
}

type ForgotAction =
	| { type: "SET_EMAIL"; value: string }
	| { type: "SET_ERROR"; value: string }
	| { type: "SET_SUBMITTING"; value: boolean }
	| { type: "SET_SUBMITTED"; value: boolean }

const initialForgotState: ForgotState = { email: "", error: "", isSubmitting: false, submitted: false }

function forgotReducer(state: ForgotState, action: ForgotAction): ForgotState {
	switch (action.type) {
		case "SET_EMAIL":
			return { ...state, email: action.value }
		case "SET_ERROR":
			return { ...state, error: action.value }
		case "SET_SUBMITTING":
			return { ...state, isSubmitting: action.value }
		case "SET_SUBMITTED":
			return { ...state, submitted: action.value }
		default:
			return state
	}
}

interface ForgotViewProps {
	onBack: () => void
	onSubmit: (email: string) => Promise<void>
}

function ForgotView({ onBack, onSubmit }: ForgotViewProps) {
	"use no memo"
	const [forgotState, dispatch] = useReducer(forgotReducer, initialForgotState)
	const { email, error, isSubmitting, submitted } = forgotState

	const emailErr = email ? validateEmail(email) : null

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		const eErr = validateEmail(email)
		if (eErr) {
			dispatch({ type: "SET_ERROR", value: eErr })
			return
		}
		dispatch({ type: "SET_SUBMITTING", value: true })
		dispatch({ type: "SET_ERROR", value: "" })
		try {
			await onSubmit(email.trim().toLowerCase())
			dispatch({ type: "SET_SUBMITTED", value: true })
		} catch (err) {
			dispatch({ type: "SET_ERROR", value: err instanceof Error ? err.message : "Erro ao enviar. Tente novamente." })
		} finally {
			dispatch({ type: "SET_SUBMITTING", value: false })
		}
	}

	if (submitted) {
		return (
			<div className="flex flex-col gap-6">
				<div>
					<p className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase mb-2">Recuperação de senha</p>
					<h2 className="text-xl font-bold mb-1">Email enviado!</h2>
					<p className="text-sm text-muted-foreground leading-relaxed">Verifique sua caixa de entrada. O link de redefinição expira em alguns minutos.</p>
				</div>
				<Button variant="ghost" size="sm" onClick={onBack} className="self-start gap-1.5 font-mono text-xs">
					<ArrowLeft className="size-3.5" aria-hidden />
					Voltar ao login
				</Button>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase mb-2">Recuperação de senha</p>
				<h2 className="text-xl font-bold mb-1">Esqueceu sua senha?</h2>
				<p className="text-sm text-muted-foreground leading-relaxed">Informe seu email institucional e enviaremos um link de redefinição.</p>
			</div>

			<form onSubmit={handleSubmit} noValidate className="space-y-5">
				{error && (
					<Alert variant="destructive">
						<AlertCircle className="size-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className="space-y-1.5">
					<Label htmlFor="forgot-email" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
						Email
					</Label>
					<div className="relative">
						<Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
						<Input
							id="forgot-email"
							type="email"
							autoComplete="email"
							placeholder="seu.nome@fab.mil.br"
							value={email}
							onChange={(e) => {
								dispatch({ type: "SET_EMAIL", value: e.target.value })
								dispatch({ type: "SET_ERROR", value: "" })
							}}
							className={cn("pl-9", emailErr && "border-destructive")}
							aria-invalid={!!emailErr || undefined}
							aria-describedby={emailErr ? "forgot-email-error" : undefined}
							disabled={isSubmitting}
						/>
					</div>
					{emailErr && (
						<p id="forgot-email-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
							<AlertCircle className="size-3 shrink-0" aria-hidden /> {emailErr}
						</p>
					)}
				</div>

				<div className="flex gap-3">
					<Button type="submit" className="flex-1 gap-2" disabled={isSubmitting}>
						{isSubmitting ? (
							<>
								<Loader2 className="size-4 animate-spin" aria-hidden /> Enviando...
							</>
						) : (
							<>
								Enviar link <ChevronRight className="size-4" aria-hidden />
							</>
						)}
					</Button>
					<Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting} aria-label="Voltar ao login">
						<ArrowLeft className="size-4" aria-hidden />
					</Button>
				</div>
			</form>
		</div>
	)
}
