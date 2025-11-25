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
	cn,
	Input,
	Label,
} from "@iefa/ui";
import {
	AlertCircle,
	CheckCircle,
	Eye,
	EyeOff,
	Loader2,
	Lock,
	Mail,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../model/auth-provider";
import { FAB_EMAIL_REGEX, STORAGE_KEYS } from "../model/constants";
import { getRedirectTo, safeRedirect } from "../model/redirect";

function preserveRedirectTo(path: string, search: string) {
	const qs = new URLSearchParams(search);
	const query = qs.toString();
	return `${path}${query ? `?${query}` : ""}`;
}

export function Login() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [rememberMe, setRememberMe] = useState(false);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [apiError, setApiError] = useState("");
	const [emailError, setEmailError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [showForgotPassword, setShowForgotPassword] = useState(false);
	const [resetEmail, setResetEmail] = useState("");
	const [isResettingPassword, setIsResettingPassword] = useState(false);
	const [passwordError, setPasswordError] = useState("");

	const { signIn, resetPassword, isAuthenticated, isLoading } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	// Carrega email salvo (remember me)
	useEffect(() => {
		const savedEmail = localStorage.getItem(STORAGE_KEYS.rememberEmail);
		if (savedEmail) {
			setEmail(savedEmail);
			setRememberMe(true);
		}
	}, []);

	// Redireciona se já estiver autenticado (respeita redirectTo/state.from)
	useEffect(() => {
		if (!isLoading && isAuthenticated) {
			const target = safeRedirect(
				getRedirectTo(location.search, location.state),
				"/rancho",
			);
			navigate(target, { replace: true });
		}
	}, [isAuthenticated, isLoading, navigate, location.search, location.state]);

	const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newEmail = e.target.value;
		setEmail(newEmail);
		setApiError("");

		if (newEmail && !FAB_EMAIL_REGEX.test(newEmail)) {
			setEmailError("Por favor, utilize um email institucional (@fab.mil.br).");
		} else {
			setEmailError("");
		}
	};

	const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setPassword(e.target.value);
		setApiError("");
		setPasswordError("");
	};

	const handleRememberMeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const checked = e.target.checked;
		setRememberMe(checked);

		if (checked && email && FAB_EMAIL_REGEX.test(email)) {
			localStorage.setItem(STORAGE_KEYS.rememberEmail, email);
		} else {
			localStorage.removeItem(STORAGE_KEYS.rememberEmail);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!FAB_EMAIL_REGEX.test(email)) {
			setEmailError("O email fornecido não é um email válido da FAB.");
			return;
		}

		if (password.length < 6) {
			setApiError("A senha deve ter pelo menos 6 caracteres.");
			return;
		}

		setIsSubmitting(true);
		setApiError("");
		setEmailError("");

		try {
			await signIn(email, password);

			// Persistência do email conforme "Lembrar email"
			if (rememberMe) {
				localStorage.setItem(STORAGE_KEYS.rememberEmail, email);
			} else {
				localStorage.removeItem(STORAGE_KEYS.rememberEmail);
			}

			// Redireciona imediatamente após login com base no redirectTo/state
			const target = safeRedirect(
				getRedirectTo(location.search, location.state),
				"/rancho",
			);
			navigate(target, { replace: true });
		} catch (err: any) {
			console.error("Falha no login:", err);
			if (err?.code === "INVALID_CREDENTIALS") {
				setPasswordError("Senha incorreta");
				setApiError(""); // não mostrar alerta geral neste caso
			} else {
				setApiError(
					err?.message ||
						"Ocorreu um erro durante a autenticação. Tente mais tarde.",
				);
				setPasswordError("");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleForgotPassword = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!FAB_EMAIL_REGEX.test(resetEmail)) {
			setApiError("Por favor, insira um email válido da FAB.");
			return;
		}

		setIsResettingPassword(true);
		setApiError("");

		try {
			await resetPassword(resetEmail);
			setSuccessMessage(
				"Email de recuperação enviado! Verifique sua caixa de entrada.",
			);
			setShowForgotPassword(false);
			setResetEmail("");
		} catch (err: any) {
			console.error("Erro ao enviar email de recuperação:", err);
			setApiError(
				err?.message || "Erro ao enviar email de recuperação. Tente novamente.",
			);
		} finally {
			setIsResettingPassword(false);
		}
	};

	const registerHref = preserveRedirectTo("/register", location.search);

	// Loading
	if (isLoading) {
		return (
			<Card className="w-full max-w-md mx-auto">
				<CardContent className="flex items-center justify-center py-8">
					<Loader2 className="h-8 w-8 animate-spin" />
					<span className="ml-2">Verificando autenticação...</span>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full max-w-md mx-auto">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl text-center">
					{showForgotPassword ? "Recuperar Senha" : "Entrar"}
				</CardTitle>
				<CardDescription className="text-center">
					{showForgotPassword
						? "Digite seu email para receber instruções de recuperação"
						: "Acesso restrito a emails @fab.mil.br"}
				</CardDescription>
			</CardHeader>

			{!showForgotPassword ? (
				<form onSubmit={handleSubmit}>
					<CardContent className="space-y-4">
						{apiError && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{apiError}</AlertDescription>
							</Alert>
						)}

						{successMessage && (
							<Alert className="border-green-200 bg-green-50">
								<CheckCircle className="h-4 w-4 text-green-600" />
								<AlertDescription className="text-green-800">
									{successMessage}
								</AlertDescription>
							</Alert>
						)}

						<div className="space-y-2">
							<Label htmlFor="email">Email Institucional</Label>
							<div className="relative">
								<Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="email"
									type="email"
									placeholder="seu.nome@fab.mil.br"
									value={email}
									onChange={handleEmailChange}
									className={cn("pl-10", {
										"border-red-500 focus-visible:ring-red-500": emailError,
									})}
									required
									disabled={isSubmitting}
									autoComplete="email"
								/>
							</div>
							{emailError && (
								<p className="text-sm text-red-600 mt-1 flex items-center">
									<AlertCircle className="h-3 w-3 mr-1" />
									{emailError}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">Senha</Label>
							<div className="relative">
								<Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="password"
									type={showPassword ? "text" : "password"}
									placeholder="••••••••"
									value={password}
									onChange={handlePasswordChange}
									className={cn("pl-10 pr-10", {
										"border-red-500 focus-visible:ring-red-500":
											!!passwordError,
									})}
									required
									disabled={isSubmitting}
									autoComplete="current-password"
									minLength={6}
								/>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
									onClick={() => setShowPassword((s) => !s)}
									disabled={isSubmitting}
								>
									{showPassword ? (
										<EyeOff className="h-4 w-4 text-muted-foreground" />
									) : (
										<Eye className="h-4 w-4 text-muted-foreground" />
									)}
								</Button>
							</div>
							{passwordError && (
								<p className="text-sm text-red-600 mt-1 flex items-center">
									<AlertCircle className="h-3 w-3 mr-1" />
									{passwordError}
								</p>
							)}
						</div>

						<div className="flex items-center justify-between">
							<div className="flex items-center space-x-2">
								<input
									id="remember"
									type="checkbox"
									checked={rememberMe}
									onChange={handleRememberMeChange}
									className="rounded border-gray-300"
									disabled={isSubmitting}
									title="Lembrar email"
								/>
								<Label htmlFor="remember" className="text-sm font-normal">
									Lembrar email
								</Label>
							</div>

							<Button
								type="button"
								variant="link"
								className="px-0 font-normal text-sm"
								onClick={() => {
									setShowForgotPassword(true);
									setApiError("");
									setSuccessMessage("");
								}}
								disabled={isSubmitting}
							>
								Esqueceu a senha?
							</Button>
						</div>
					</CardContent>

					<CardFooter className="flex flex-col space-y-4">
						<Button
							type="submit"
							className="w-full my-6 py-3 text-lg font-semibold"
							disabled={isSubmitting || !!emailError || !email || !password}
						>
							{isSubmitting && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							{isSubmitting ? "Entrando..." : "Entrar"}
						</Button>

						<p className="text-sm text-center text-muted-foreground">
							Não tem uma conta?{" "}
							<Link
								to={registerHref}
								className="text-primary hover:underline font-medium"
							>
								Cadastre-se
							</Link>
						</p>
					</CardFooter>
				</form>
			) : (
				<form onSubmit={handleForgotPassword}>
					<CardContent className="space-y-4">
						{apiError && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{apiError}</AlertDescription>
							</Alert>
						)}

						<div className="space-y-2">
							<Label htmlFor="resetEmail">Email Institucional</Label>
							<div className="relative">
								<Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
								<Input
									id="resetEmail"
									type="email"
									placeholder="seu.nome@fab.mil.br"
									value={resetEmail}
									onChange={(e) => {
										setResetEmail(e.target.value);
										setApiError("");
									}}
									className="pl-10"
									required
									disabled={isResettingPassword}
									autoComplete="email"
								/>
							</div>
						</div>
					</CardContent>

					<CardFooter className="flex flex-col space-y-4">
						<Button
							type="submit"
							className="w-full my-6 py-3 text-lg font-semibold"
							disabled={isResettingPassword || !resetEmail}
						>
							{isResettingPassword && (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							)}
							{isResettingPassword
								? "Enviando..."
								: "Enviar Email de Recuperação"}
						</Button>

						<Button
							type="button"
							variant="outline"
							className="w-full"
							onClick={() => {
								setShowForgotPassword(false);
								setResetEmail("");
								setApiError("");
							}}
							disabled={isResettingPassword}
						>
							Voltar ao Login
						</Button>
					</CardFooter>
				</form>
			)}
		</Card>
	);
}
