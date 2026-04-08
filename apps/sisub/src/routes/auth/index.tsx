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
import { useEffect, useState } from "react"
// Validation
import { z } from "zod"
// UI
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// Hooks + Services
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

const FAB_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@fab\.mil\.br$/
const REMEMBER_KEY = "fab_remember_email"

function validateEmail(v: string): string | null {
	if (!v) return "Email obrigatório."
	if (!FAB_EMAIL_RE.test(v)) return "Use seu email institucional @fab.mil.br."
	return null
}

function validatePassword(v: string): string | null {
	if (!v) return "Senha obrigatória."
	if (v.length < 6) return "Mínimo de 6 caracteres."
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
		supabase.auth.verifyOtp({ token_hash: search.token_hash as string, type: "email" }).then(({ error }) => {
			if (error) {
				setView("verify-error")
			} else {
				setView("verify-success")
				setTimeout(() => navigate({ to: search.redirect || "/hub" }), 2000)
			}
		})
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
								<Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
								<span className="text-sm font-medium">{item.text}</span>
							</div>
						)
					})}
				</div>

				<p className="mt-8 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
					<ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
							<Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-hidden />
							<p className="font-mono text-sm text-muted-foreground">Verificando email...</p>
						</div>
					)}

					{/* ── OTP: email confirmado ── */}
					{view === "verify-success" && (
						<div className="flex flex-col items-center gap-4 py-16" role="status" aria-live="polite">
							<CheckCircle2 className="h-8 w-8 text-primary" aria-hidden />
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
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>Solicite um novo email de confirmação.</AlertDescription>
							</Alert>
							<Button variant="ghost" size="sm" onClick={() => setView("tabs")} className="self-start gap-1.5 font-mono text-xs">
								<ArrowLeft className="h-3.5 w-3.5" aria-hidden />
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

interface LoginViewProps {
	onSubmit: (email: string, password: string) => Promise<void>
	onForgotPassword: () => void
}

function LoginView({ onSubmit, onForgotPassword }: LoginViewProps) {
	"use no memo"
	const [email, setEmail] = useState(() => {
		try {
			return localStorage.getItem(REMEMBER_KEY) ?? ""
		} catch {
			return ""
		}
	})
	const [password, setPassword] = useState("")
	const [remember, setRemember] = useState(() => {
		try {
			return !!localStorage.getItem(REMEMBER_KEY)
		} catch {
			return false
		}
	})
	const [showPassword, setShowPassword] = useState(false)
	const [error, setError] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)

	const emailErr = email ? validateEmail(email) : null
	const passwordErr = password ? validatePassword(password) : null

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		const eErr = validateEmail(email)
		const pErr = validatePassword(password)
		if (eErr || pErr) {
			setError(eErr || pErr || "")
			return
		}
		setIsSubmitting(true)
		setError("")
		try {
			if (remember) localStorage.setItem(REMEMBER_KEY, email)
			else localStorage.removeItem(REMEMBER_KEY)
			await onSubmit(email.trim().toLowerCase(), password)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao entrar. Tente novamente.")
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<form onSubmit={handleSubmit} noValidate className="space-y-5">
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Email */}
			<div className="space-y-1.5">
				<Label htmlFor="login-email" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Email
				</Label>
				<div className="relative">
					<Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="login-email"
						type="email"
						autoComplete="email"
						placeholder="seu.nome@fab.mil.br"
						value={email}
						onChange={(e) => {
							setEmail(e.target.value)
							setError("")
						}}
						className={cn("pl-9", emailErr && "border-destructive")}
						aria-invalid={!!emailErr || undefined}
						aria-describedby={emailErr ? "login-email-error" : undefined}
						disabled={isSubmitting}
					/>
				</div>
				{emailErr && (
					<p id="login-email-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {emailErr}
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
					<Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="login-password"
						type={showPassword ? "text" : "password"}
						autoComplete="current-password"
						placeholder="••••••"
						value={password}
						onChange={(e) => {
							setPassword(e.target.value)
							setError("")
						}}
						className={cn("pl-9 pr-10", passwordErr && "border-destructive")}
						aria-invalid={!!passwordErr || undefined}
						aria-describedby={passwordErr ? "login-password-error" : undefined}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={() => setShowPassword(!showPassword)}
						className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
						aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
					>
						{showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
					</button>
				</div>
				{passwordErr && (
					<p id="login-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {passwordErr}
					</p>
				)}
			</div>

			{/* Lembrar email */}
			<div className="flex items-center gap-2">
				<Checkbox id="remember" checked={remember} onCheckedChange={(c) => setRemember(!!c)} disabled={isSubmitting} />
				<label htmlFor="remember" className="font-mono text-xs text-muted-foreground cursor-pointer select-none">
					Lembrar email
				</label>
			</div>

			<Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
				{isSubmitting ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Entrando...
					</>
				) : (
					<>
						Entrar <ChevronRight className="h-4 w-4" aria-hidden />
					</>
				)}
			</Button>
		</form>
	)
}

/* ========================================================================
   REGISTER VIEW
   ======================================================================== */

interface RegisterViewProps {
	onSubmit: (email: string, password: string, name: string) => Promise<void>
	onBack: () => void
}

function RegisterView({ onSubmit, onBack }: RegisterViewProps) {
	"use no memo"
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [confirm, setConfirm] = useState("")
	const [showPassword, setShowPassword] = useState(false)
	const [showConfirm, setShowConfirm] = useState(false)
	const [error, setError] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [submitted, setSubmitted] = useState(false)

	const emailErr = email ? validateEmail(email) : null
	const passwordErr = password ? validatePassword(password) : null
	const confirmErr = confirm && confirm !== password ? "As senhas não coincidem." : null

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		if (!name.trim()) {
			setError("Nome obrigatório.")
			return
		}
		const eErr = validateEmail(email)
		const pErr = validatePassword(password)
		const cErr = password !== confirm ? "As senhas não coincidem." : null
		if (eErr || pErr || cErr) {
			setError(eErr || pErr || cErr || "")
			return
		}
		setIsSubmitting(true)
		setError("")
		try {
			await onSubmit(email.trim().toLowerCase(), password, name.trim())
			setSubmitted(true)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao criar conta. Tente novamente.")
		} finally {
			setIsSubmitting(false)
		}
	}

	if (submitted) {
		return (
			<div className="flex flex-col items-center gap-5 py-8 text-center">
				<CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
				<div>
					<p className="font-bold text-base mb-1">Cadastro realizado!</p>
					<p className="text-sm text-muted-foreground leading-relaxed">Verifique seu email institucional para ativar a conta antes de fazer login.</p>
				</div>
				<Button variant="outline" size="sm" onClick={onBack} className="gap-1.5 font-mono text-xs mt-2">
					<ArrowLeft className="h-3.5 w-3.5" aria-hidden />
					Ir para o login
				</Button>
			</div>
		)
	}

	return (
		<form onSubmit={handleSubmit} noValidate className="space-y-4">
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Nome */}
			<div className="space-y-1.5">
				<Label htmlFor="reg-name" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Nome completo
				</Label>
				<div className="relative">
					<UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-name"
						type="text"
						autoComplete="name"
						placeholder="Ten. Fulano da Silva"
						value={name}
						onChange={(e) => {
							setName(e.target.value)
							setError("")
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
					<Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-email"
						type="email"
						autoComplete="email"
						placeholder="seu.nome@fab.mil.br"
						value={email}
						onChange={(e) => {
							setEmail(e.target.value)
							setError("")
						}}
						className={cn("pl-9", emailErr && "border-destructive")}
						aria-invalid={!!emailErr || undefined}
						aria-describedby={emailErr ? "reg-email-error" : undefined}
						disabled={isSubmitting}
					/>
				</div>
				{emailErr && (
					<p id="reg-email-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {emailErr}
					</p>
				)}
			</div>

			{/* Senha */}
			<div className="space-y-1.5">
				<Label htmlFor="reg-password" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Senha
				</Label>
				<div className="relative">
					<Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-password"
						type={showPassword ? "text" : "password"}
						autoComplete="new-password"
						placeholder="Mínimo 6 caracteres"
						value={password}
						onChange={(e) => {
							setPassword(e.target.value)
							setError("")
						}}
						className={cn("pl-9 pr-10", passwordErr && "border-destructive")}
						aria-invalid={!!passwordErr || undefined}
						aria-describedby={passwordErr ? "reg-password-error" : undefined}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={() => setShowPassword(!showPassword)}
						className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
						aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
					>
						{showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
					</button>
				</div>
				{passwordErr && (
					<p id="reg-password-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {passwordErr}
					</p>
				)}
			</div>

			{/* Confirmar Senha */}
			<div className="space-y-1.5">
				<Label htmlFor="reg-confirm" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
					Confirmar senha
				</Label>
				<div className="relative">
					<Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
					<Input
						id="reg-confirm"
						type={showConfirm ? "text" : "password"}
						autoComplete="new-password"
						placeholder="Digite a senha novamente"
						value={confirm}
						onChange={(e) => {
							setConfirm(e.target.value)
							setError("")
						}}
						className={cn("pl-9 pr-10", confirmErr && "border-destructive")}
						aria-invalid={!!confirmErr || undefined}
						aria-describedby={confirmErr ? "reg-confirm-error" : undefined}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={() => setShowConfirm(!showConfirm)}
						className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-sm"
						aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
					>
						{showConfirm ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
					</button>
				</div>
				{confirmErr && (
					<p id="reg-confirm-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
						<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {confirmErr}
					</p>
				)}
			</div>

			<Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
				{isSubmitting ? (
					<>
						<Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Criando conta...
					</>
				) : (
					<>
						Criar conta <ChevronRight className="h-4 w-4" aria-hidden />
					</>
				)}
			</Button>
		</form>
	)
}

/* ========================================================================
   FORGOT VIEW
   ======================================================================== */

interface ForgotViewProps {
	onBack: () => void
	onSubmit: (email: string) => Promise<void>
}

function ForgotView({ onBack, onSubmit }: ForgotViewProps) {
	"use no memo"
	const [email, setEmail] = useState("")
	const [error, setError] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [submitted, setSubmitted] = useState(false)

	const emailErr = email ? validateEmail(email) : null

	const handleSubmit = async (e: React.FormEvent) => {
		"use no memo"
		e.preventDefault()
		const eErr = validateEmail(email)
		if (eErr) {
			setError(eErr)
			return
		}
		setIsSubmitting(true)
		setError("")
		try {
			await onSubmit(email.trim().toLowerCase())
			setSubmitted(true)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Erro ao enviar. Tente novamente.")
		} finally {
			setIsSubmitting(false)
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
					<ArrowLeft className="h-3.5 w-3.5" aria-hidden />
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
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className="space-y-1.5">
					<Label htmlFor="forgot-email" className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
						Email
					</Label>
					<div className="relative">
						<Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
						<Input
							id="forgot-email"
							type="email"
							autoComplete="email"
							placeholder="seu.nome@fab.mil.br"
							value={email}
							onChange={(e) => {
								setEmail(e.target.value)
								setError("")
							}}
							className={cn("pl-9", emailErr && "border-destructive")}
							aria-invalid={!!emailErr || undefined}
							aria-describedby={emailErr ? "forgot-email-error" : undefined}
							disabled={isSubmitting}
						/>
					</div>
					{emailErr && (
						<p id="forgot-email-error" role="alert" className="flex items-center gap-1.5 font-mono text-xs text-destructive">
							<AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> {emailErr}
						</p>
					)}
				</div>

				<div className="flex gap-3">
					<Button type="submit" className="flex-1 gap-2" disabled={isSubmitting}>
						{isSubmitting ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enviando...
							</>
						) : (
							<>
								Enviar link <ChevronRight className="h-4 w-4" aria-hidden />
							</>
						)}
					</Button>
					<Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting} aria-label="Voltar ao login">
						<ArrowLeft className="h-4 w-4" aria-hidden />
					</Button>
				</div>
			</form>
		</div>
	)
}
