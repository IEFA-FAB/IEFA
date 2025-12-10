import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@iefa/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	CheckCircle2,
	Eye,
	EyeOff,
	Loader2,
	Lock,
	Mail,
	User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import supabase from "@/utils/supabase";

// FAB Email validation regex
const FAB_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@fab\.mil\.br$/;
const STORAGE_KEY_REMEMBER_EMAIL = "fab_remember_email";

// Normalize email: trim and lowercase
function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

// Safe redirect utility
function safeRedirect(
	target: string | null | undefined,
	fallback = "/",
): string {
	if (!target) return fallback;
	let decoded = target;
	try {
		decoded = decodeURIComponent(target);
	} catch {}
	if (decoded.startsWith("/") && !decoded.startsWith("//")) {
		return decoded;
	}
	return fallback;
}

// Schema for URL search params
const authSearchSchema = z.object({
	redirect: z.string().optional(),
	tab: z.enum(["login", "register"]).optional().default("login"),
	token_hash: z.string().optional(),
	type: z.string().optional(),
});

export const Route = createFileRoute("/auth/")({
	validateSearch: authSearchSchema,
	component: AuthPage,
});

type AuthView = "auth" | "forgot" | "reset";

function AuthPage() {
	const { signIn, signUp, resetPassword, isAuthenticated, isLoading } =
		useAuth();
	const router = useRouter();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	// --- ESTADOS GERAIS ---
	const [currentView, setCurrentView] = useState<AuthView>(
		search.token_hash ? "reset" : "auth",
	);
	const [activeTab, setActiveTab] = useState<string>(search.tab || "login");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [showPassword, setShowPassword] = useState(false);

	// --- ESTADOS DOS FORMULÁRIOS ---
	const [loginEmail, setLoginEmail] = useState("");
	const [loginPassword, setLoginPassword] = useState("");
	const [rememberMe, setRememberMe] = useState(false);
	const [emailError, setEmailError] = useState("");
	const [passwordError, setPasswordError] = useState("");

	const [registerData, setRegisterData] = useState({
		name: "",
		email: "",
		password: "",
		confirm: "",
	});
	const [registerEmailError, setRegisterEmailError] = useState("");

	const [forgotEmail, setForgotEmail] = useState("");
	const [newPassword, setNewPassword] = useState("");

	// Carrega email salvo (remember me) ao montar
	useEffect(() => {
		const savedEmail = localStorage.getItem(STORAGE_KEY_REMEMBER_EMAIL);
		if (savedEmail) {
			setLoginEmail(savedEmail);
			setRememberMe(true);
		}
	}, []);

	// Redireciona se já estiver autenticado
	useEffect(() => {
		if (!isLoading && isAuthenticated) {
			const target = safeRedirect(search.redirect, "/");
			router.navigate({ to: target, replace: true });
		}
	}, [isAuthenticated, isLoading, router, search.redirect]);

	// Sincroniza a Tab com a URL
	const handleTabChange = (value: string) => {
		setActiveTab(value);
		setError("");
		setSuccessMessage("");
		navigate({
			search: (prev) => ({ ...prev, tab: value as "login" | "register" }),
			replace: true,
		});
	};

	// Troca de visualização (Login <-> Esqueci Senha)
	const switchView = (view: AuthView) => {
		setError("");
		setSuccessMessage("");
		setEmailError("");
		setPasswordError("");
		setRegisterEmailError("");
		setCurrentView(view);
	};

	// --- HANDLERS ---

	const handleLoginEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const email = e.target.value;
		setLoginEmail(email);
		setError("");
		setEmailError("");

		const normalized = normalizeEmail(email);
		if (email && !FAB_EMAIL_REGEX.test(normalized)) {
			setEmailError("Por favor, utilize um email institucional (@fab.mil.br).");
		}
	};

	const handleLoginPasswordChange = (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		setLoginPassword(e.target.value);
		setError("");
		setPasswordError("");
	};

	const handleRememberMeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setRememberMe(checked);

		const normalized = normalizeEmail(loginEmail);
		if (checked && loginEmail && FAB_EMAIL_REGEX.test(normalized)) {
			localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, normalized);
		} else {
			localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL);
		}
	};

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();

		const normalized = normalizeEmail(loginEmail);

		// Validação local
		if (!FAB_EMAIL_REGEX.test(normalized)) {
			setEmailError("O email fornecido não é um email válido da FAB.");
			return;
		}

		if (loginPassword.length < 6) {
			setPasswordError("A senha deve ter pelo menos 6 caracteres.");
			return;
		}

		setIsSubmitting(true);
		setError("");
		setEmailError("");
		setPasswordError("");

		try {
			await signIn(normalized, loginPassword);

			// Persistência do email conforme "Lembrar email"
			if (rememberMe) {
				localStorage.setItem(STORAGE_KEY_REMEMBER_EMAIL, normalized);
			} else {
				localStorage.removeItem(STORAGE_KEY_REMEMBER_EMAIL);
			}

			// Redireciona após login
			const target = safeRedirect(search.redirect, "/");
			await router.navigate({ to: target, replace: true });
		} catch (err) {
			console.error("Falha no login:", err);
			const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
			// Tratamento de erros específicos
			if (errorMsg.includes("Email ou senha incorretos")) {
				setPasswordError("Senha incorreta");
			} else {
				setError(
					errorMsg ||
						"Ocorreu um erro durante a autenticação. Tente mais tarde.",
				);
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleRegisterEmailChange = (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		const email = e.target.value;
		setRegisterData({ ...registerData, email });
		setError("");
		setRegisterEmailError("");

		const normalized = normalizeEmail(email);
		if (email && !FAB_EMAIL_REGEX.test(normalized)) {
			setRegisterEmailError(
				"Por favor, utilize um email institucional (@fab.mil.br).",
			);
		}
	};

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault();

		const normalized = normalizeEmail(registerData.email);

		// Validação local
		if (!FAB_EMAIL_REGEX.test(normalized)) {
			setRegisterEmailError("O email fornecido não é um email válido da FAB.");
			return;
		}

		if (registerData.password.length < 6) {
			setError("A senha deve ter pelo menos 6 caracteres.");
			return;
		}

		if (registerData.password !== registerData.confirm) {
			setError("As senhas não coincidem.");
			return;
		}

		setIsSubmitting(true);
		setError("");
		setRegisterEmailError("");

		try {
			await signUp(normalized, registerData.password, registerData.name);
			setSuccessMessage("Conta criada! Verifique seu email.");
			handleTabChange("login");
			setLoginEmail(normalized);
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Erro ao criar conta.";
			setError(errorMsg);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleForgotPassword = async (e: React.FormEvent) => {
		e.preventDefault();

		const normalized = normalizeEmail(forgotEmail);

		if (!FAB_EMAIL_REGEX.test(normalized)) {
			setError("Por favor, insira um email válido da FAB.");
			return;
		}

		setIsSubmitting(true);
		setError("");

		try {
			await resetPassword(normalized);
			setSuccessMessage(
				"Email de recuperação enviado! Verifique sua caixa de entrada.",
			);
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Erro ao enviar email.";
			setError(errorMsg);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleResetPassword = async (e: React.FormEvent) => {
		e.preventDefault();

		if (newPassword.length < 6) {
			setError("A senha deve ter pelo menos 6 caracteres.");
			return;
		}

		setIsSubmitting(true);
		setError("");

		try {
			const { error } = await supabase.auth.updateUser({
				password: newPassword,
			});
			if (error) throw error;
			alert("Senha atualizada com sucesso!");
			await router.navigate({ to: "/" });
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "Erro ao atualizar senha.";
			setError(errorMsg);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Verifica validade do token de reset ao montar, se estiver na view de reset
	useEffect(() => {
		if (
			currentView === "reset" &&
			search.token_hash &&
			search.type === "email"
		) {
			const verifyOtp = async () => {
				if (!search.token_hash) return;
				const { error } = await supabase.auth.verifyOtp({
					token_hash: search.token_hash,
					type: "email",
				});
				if (error) {
					setError("Link inválido ou expirado. Solicite uma nova recuperação.");
				}
			};
			verifyOtp();
		}
	}, [currentView, search.token_hash, search.type]);

	// --- COMMON STYLES ---
	// Removed Glassmorphism, using standard Card tokens
	const cardClasses =
		"w-full max-w-2xl justify-self-center border shadow-2xl rounded-3xl overflow-hidden bg-card text-card-foreground";

	const inputClasses =
		"bg-background border-input hover:bg-accent/5 focus:border-primary/50 focus:ring-primary/20 h-12 rounded-xl transition-all text-base";

	const buttonClasses =
		"w-full rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 h-12 text-base transition-all hover:-translate-y-0.5";

	const labelClasses = "text-muted-foreground font-medium ml-1 text-sm";
	const iconClasses =
		"absolute left-4 top-4 h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors";

	// Loading state during auth check
	if (isLoading) {
		return (
			<Card className={cardClasses}>
				<CardContent className="flex items-center justify-center py-12">
					<Loader2 className="h-8 w-8 animate-spin mr-2" />
					<span>Verificando autenticação...</span>
				</CardContent>
			</Card>
		);
	}

	// 1. VIEW: RESET PASSWORD (Token na URL)
	if (currentView === "reset") {
		return (
			<Card className={cardClasses}>
				<CardHeader className="text-center space-y-3 pb-4 pt-8">
					<CardTitle className="text-3xl font-bold tracking-tight">
						Nova Senha
					</CardTitle>
					<CardDescription className="text-muted-foreground text-base">
						Defina sua nova senha segura.
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleResetPassword}>
					<CardContent className="space-y-6 px-8">
						{error && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
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
									onChange={(e) => setNewPassword(e.target.value)}
									required
									minLength={6}
									placeholder="Mínimo 6 caracteres"
									autoComplete="new-password"
								/>
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-2">
						<Button
							type="submit"
							className={buttonClasses}
							disabled={isSubmitting || !!error}
						>
							{isSubmitting && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
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
		);
	}

	// 2. VIEW: FORGOT PASSWORD
	if (currentView === "forgot") {
		return (
			<Card className={cardClasses}>
				<CardHeader className="text-center space-y-3 pb-4 pt-8">
					<CardTitle className="text-3xl font-bold tracking-tight">
						Recuperar Senha
					</CardTitle>
					<CardDescription className="text-muted-foreground text-base">
						Digite seu email para receber um link de redefinição.
					</CardDescription>
				</CardHeader>
				<form onSubmit={handleForgotPassword}>
					<CardContent className="space-y-6 px-8">
						{error && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						{successMessage && (
							<Alert className="bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400">
								<CheckCircle2 className="h-4 w-4" />
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
									onChange={(e) => setForgotEmail(e.target.value)}
									required
									autoComplete="email"
								/>
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex flex-col gap-4 px-8 pb-8 pt-8">
						<Button
							type="submit"
							className={buttonClasses}
							disabled={isSubmitting}
						>
							{isSubmitting && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							Enviar Link
						</Button>
						<Button
							variant="ghost"
							type="button"
							className="w-full rounded-full text-muted-foreground hover:text-foreground hover:bg-accent h-10"
							onClick={() => switchView("auth")}
						>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Voltar ao Login
						</Button>
					</CardFooter>
				</form>
			</Card>
		);
	}

	// 3. VIEW: AUTH (LOGIN & REGISTER TABS)
	return (
		<div className="w-full max-w-2xl mx-auto animate-fade-in-up">
			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
				className="w-full"
			>
				{/* dark style specified directly because of bug in shadcn tabs that dark mode don't work in this specific case unless it is directly specified */}
				<TabsList className="grid w-full grid-cols-2 mb-8 bg-muted p-1.5 rounded-full h-14">
					<TabsTrigger
						value="login"
						className="rounded-full h-full text-base font-medium data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-md dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background dark:data-[state=active]:shadow-md transition-all duration-300"
					>
						Entrar
					</TabsTrigger>
					<TabsTrigger
						value="register"
						className="rounded-full h-full text-base font-medium data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-md dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background dark:data-[state=active]:shadow-md transition-all duration-300"
					>
						Cadastrar
					</TabsTrigger>
				</TabsList>

				{/* --- LOGIN TAB --- */}
				<TabsContent value="login" className="w-full mt-0">
					<Card className={cardClasses}>
						<CardHeader className="space-y-3 text-center pb-4 pt-8">
							<CardTitle className="text-3xl font-bold tracking-tight">
								Bem-vindo de volta
							</CardTitle>
							<CardDescription className="text-muted-foreground text-base">
								Acesso restrito a emails @fab.mil.br
							</CardDescription>
						</CardHeader>

						<form onSubmit={handleLogin}>
							<CardContent className="space-y-6 px-8">
								{error && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertDescription>{error}</AlertDescription>
									</Alert>
								)}
								{successMessage && (
									<Alert className="bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400">
										<CheckCircle2 className="h-4 w-4" />
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
											className={`${inputClasses} pl-11 ${emailError ? "border-destructive ring-destructive/20" : ""}`}
											value={loginEmail}
											onChange={handleLoginEmailChange}
											required
											autoComplete="username"
											disabled={isSubmitting}
										/>
									</div>
									{emailError && (
										<p className="text-sm text-destructive mt-1 flex items-center">
											<AlertCircle className="h-3 w-3 mr-1" />
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
											type="password"
											placeholder="••••••••"
											className={`${inputClasses} pl-11 pr-11 ${passwordError ? "border-destructive ring-destructive/20" : ""}`}
											value={loginPassword}
											onChange={handleLoginPasswordChange}
											required
											autoComplete="current-password"
											minLength={6}
											disabled={isSubmitting}
										/>
										<button
											type="button"
											onClick={() => setShowPassword(!showPassword)}
											className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
										>
											{showPassword ? (
												<EyeOff className="h-4 w-4" />
											) : (
												<Eye className="h-4 w-4" />
											)}
										</button>
									</div>
									{passwordError && (
										<p className="text-sm text-destructive mt-1 flex items-center">
											<AlertCircle className="h-3 w-3 mr-1" />
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
										className="rounded border-gray-300 dark:border-gray-600"
										disabled={isSubmitting}
									/>
									<Label
										htmlFor="remember"
										className="text-sm font-normal text-muted-foreground"
									>
										Lembrar email
									</Label>
								</div>
							</CardContent>

							<CardFooter className="pb-8 px-8 pt-8">
								<Button
									type="submit"
									className={buttonClasses}
									disabled={isSubmitting || !!emailError}
								>
									{isSubmitting && (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									{isSubmitting ? "Entrando..." : "Entrar"}
								</Button>
							</CardFooter>
						</form>
					</Card>
				</TabsContent>

				{/* --- REGISTER TAB --- */}
				<TabsContent value="register" className="mt-0">
					<Card className={cardClasses}>
						<CardHeader className="text-center pb-4 pt-8 space-y-3">
							<CardTitle className="text-3xl font-bold tracking-tight">
								Criar conta
							</CardTitle>
							<CardDescription className="text-muted-foreground text-base">
								Acesso restrito a emails @fab.mil.br
							</CardDescription>
						</CardHeader>
						<form onSubmit={handleRegister}>
							<CardContent className="space-y-6 px-8">
								{error && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
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
											onChange={(e) =>
												setRegisterData({
													...registerData,
													name: e.target.value,
												})
											}
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
											className={`${inputClasses} pl-11 ${registerEmailError ? "border-destructive ring-destructive/20" : ""}`}
											value={registerData.email}
											onChange={handleRegisterEmailChange}
											required
											autoComplete="email"
											disabled={isSubmitting}
										/>
									</div>
									{registerEmailError && (
										<p className="text-sm text-destructive mt-1 flex items-center">
											<AlertCircle className="h-3 w-3 mr-1" />
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
											onChange={(e) =>
												setRegisterData({
													...registerData,
													password: e.target.value,
												})
											}
											required
											minLength={6}
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
											onChange={(e) =>
												setRegisterData({
													...registerData,
													confirm: e.target.value,
												})
											}
											required
											autoComplete="new-password"
											disabled={isSubmitting}
										/>
									</div>
								</div>
							</CardContent>
							<CardFooter className="pb-8 px-8 pt-8">
								<Button
									type="submit"
									className={buttonClasses}
									disabled={isSubmitting || !!registerEmailError}
								>
									{isSubmitting && (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									{isSubmitting ? "Criando..." : "Criar conta"}
								</Button>
							</CardFooter>
						</form>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
