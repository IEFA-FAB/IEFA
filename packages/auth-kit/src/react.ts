import { useEffect, useRef, useState } from "react"

import {
	type AuthTab,
	type AuthView,
	deriveAuthView,
	getPostLoginPath,
	getVerifiableOtpType,
	type RegisterInput,
	shouldRedirectAuthenticated,
} from "./auth-screen.ts"
import {
	type AuthScreenActions,
	type AuthScreenConfig,
	type AuthScreenNavigate,
	createAuthScreenHandlers,
	resolveAuthScreenConfig,
} from "./auth-screen-handlers.ts"
import { getRemainingSeconds, recordFailure, resetRateLimit } from "./rate-limiter.ts"

/**
 * Hook da trava de login: expõe o tempo restante e recalcula a cada segundo
 * enquanto estiver travado. Subpath `@iefa/auth-kit/react` para que a raiz do
 * pacote (usada em server functions) não puxe React.
 */
export function useLoginRateLimiter() {
	const [retryAfter, setRetryAfter] = useState(getRemainingSeconds)

	useEffect(() => {
		if (retryAfter <= 0) return
		const id = setTimeout(() => setRetryAfter(getRemainingSeconds()), 1000)
		return () => clearTimeout(id)
	}, [retryAfter])

	return {
		isLocked: retryAfter > 0,
		retryAfter,
		onFailure: () => setRetryAfter(recordFailure()),
		onSuccess: () => {
			resetRateLimit()
			setRetryAfter(0)
		},
	}
}

export interface UseAuthScreenOptions {
	isLoading: boolean
	isAuthenticated: boolean
	/**
	 * Sessão de recuperação aberta pelo próprio client (tokens no hash ou `?code=`),
	 * que também leva à view de nova senha. Default: `false`.
	 */
	isRecoverySession?: boolean
	searchParams: {
		redirect?: string
		tab?: AuthTab
		view?: "forgot"
		token_hash?: string
		type?: string
	}
	onNavigate: AuthScreenNavigate
	onTabChange?: (tab: AuthTab) => void
	// null = voltar aos tabs (remove ?view=forgot da URL, back button funciona)
	onViewChange?: (view: "forgot" | null) => void
	actions: AuthScreenActions
	/** Constante de módulo no app: o que difere do comportamento padrão. */
	config: AuthScreenConfig
}

const EMPTY_REGISTER: RegisterInput = { name: "", email: "", password: "", confirm: "" }

/**
 * Estado e handlers da tela de autenticação. Cada app mantém a própria view
 * (design systems diferentes) e lê tudo daqui.
 */
export function useAuthScreen({
	isLoading,
	isAuthenticated,
	isRecoverySession = false,
	searchParams,
	onNavigate,
	onTabChange,
	onViewChange,
	actions,
	config: rawConfig,
}: UseAuthScreenOptions) {
	const config = resolveAuthScreenConfig(rawConfig)
	const { isLocked, retryAfter, onFailure, onSuccess } = useLoginRateLimiter()

	// ── View derivada da URL — nunca estado local ─────────────────────────────
	// Prioridade: token_hash → reset | ?view=forgot → forgot | default → auth tabs
	const currentView: AuthView = deriveAuthView(Boolean(searchParams.token_hash || isRecoverySession), searchParams.view)

	const [activeTab, setActiveTab] = useState<AuthTab>(searchParams.tab || "login")

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

	const [registerData, setRegisterData] = useState(EMPTY_REGISTER)
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

	const { rememberEmailKey } = config
	useEffect(() => {
		const saved = localStorage.getItem(rememberEmailKey)
		if (saved) {
			setLoginEmail(saved)
			setRememberMe(true)
		}
		// A chave é string constante da config do app: o efeito roda só na montagem.
	}, [rememberEmailKey])

	// Com `redirectOnlyFromAuthView`, não arranca o usuário da tela de nova senha
	// (onde o verifyOtp já cria uma sessão de recuperação). Sem ele, a view nem
	// entra nas deps: mudar de view não dispara outro redirecionamento.
	const redirectGateView: AuthView = config.redirectOnlyFromAuthView ? currentView : "auth"
	useEffect(() => {
		if (shouldRedirectAuthenticated(isLoading, isAuthenticated, redirectGateView)) {
			onNavigate({ to: getPostLoginPath(searchParams.redirect), replace: true })
		}
	}, [isAuthenticated, isLoading, redirectGateView, searchParams.redirect, onNavigate])

	const handlers = createAuthScreenHandlers({
		state: { isLocked, loginEmail, loginPassword, rememberMe, registerData, forgotEmail, newPassword, redirect: searchParams.redirect },
		set: {
			setActiveTab,
			setIsSubmitting,
			setError,
			setSuccessMessage,
			setLoginEmail,
			setLoginPassword,
			setRememberMe,
			setEmailError,
			setPasswordError,
			setRegisterData,
			setRegisterEmailError,
		},
		config,
		actions,
		onNavigate,
		onTabChange,
		onViewChange,
		onSuccess,
		onFailure,
		getStorage: () => localStorage,
		notify: (message) => alert(message),
	})

	// O token é consumido no primeiro verifyOtp: a partir daí ele já não vale mais.
	// Guardamos qual token já foi tentado para não re-verificar num re-render
	// (`actions` muda de identidade a cada render, e o SIGNED_IN da sessão de
	// recuperação também dispara um), o que mostraria "Link inválido" à toa.
	const verifiedTokenRef = useRef<string | null>(null)
	const { otpInvalid } = config.messages
	useEffect(() => {
		// currentView === "reset" ≡ !!searchParams.token_hash — sem necessidade de incluí-lo nos deps.
		// resetPasswordForEmail gera links com type=recovery; a confirmação de cadastro,
		// type=email. Encaminhamos o tipo real — fixar "email" fazia a recuperação
		// falhar com "Auth session missing" na hora de salvar a nova senha.
		const tokenHash = searchParams.token_hash
		const otpType = getVerifiableOtpType(tokenHash, searchParams.type, verifiedTokenRef.current)
		if (tokenHash && otpType) {
			verifiedTokenRef.current = tokenHash
			const verify = async () => {
				const { error } = await actions.verifyOtp(tokenHash, otpType)
				if (error) setError(otpInvalid)
			}
			verify()
		}
		// `otpInvalid` é string constante da config do app: não dispara verificação nova.
	}, [searchParams.token_hash, searchParams.type, actions, otpInvalid])

	return {
		currentView,
		activeTab,
		isLocked,
		retryAfter,
		isSubmitting,
		error,
		successMessage,
		showPassword,
		setShowPassword,
		loginEmail,
		loginPassword,
		rememberMe,
		emailError,
		passwordError,
		registerData,
		setRegisterData,
		registerEmailError,
		forgotEmail,
		setForgotEmail,
		newPassword,
		setNewPassword,
		...handlers,
	}
}

export type AuthScreenController = ReturnType<typeof useAuthScreen>
