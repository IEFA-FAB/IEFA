/**
 * @module auth-screen-handlers
 * Handlers da tela de autenticação, separados do React para serem testados com
 * setters falsos: recebem o estado do render e os setters do `useAuthScreen` e
 * chamam ambos na mesma ordem das cópias de `AuthScreen.tsx` que substituem.
 */

import {
	type AuthScreenMessages,
	type AuthTab,
	checkForgotInput,
	checkLoginInput,
	checkRegisterInput,
	DEFAULT_INVALID_CREDENTIALS_PATTERN,
	describeSignInFailure,
	FAB_INSTITUTIONAL_EMAIL_PATTERN,
	getEmailHint,
	getErrorMessage,
	getPasswordError,
	getPostLoginPath,
	type KeyValueStorage,
	persistRememberedEmail,
	type RegisterInput,
	syncRememberedEmailOnToggle,
} from "./auth-screen.ts"

/** Contrato das ações que a tela chama (`createAuthActions` satisfaz). */
export interface AuthScreenActions {
	signIn: (email: string, password: string) => Promise<void>
	signUp: (email: string, password: string, name: string) => Promise<void>
	resetPassword: (email: string) => Promise<void>
	updateUserPassword: (password: string) => Promise<{ error: Error | null }>
	verifyOtp: (token_hash: string, type: "email" | "recovery") => Promise<{ error: Error | null }>
}

export type AuthScreenNavigate = (options: { to: string; replace?: boolean }) => Promise<void> | void

/**
 * Comportamento que difere entre apps. Os defaults são o do portal/contrate;
 * nenhum app deve ter seu comportamento trocado por eles.
 */
export interface AuthScreenConfig {
	/** Chave do `localStorage` do "lembrar e-mail". */
	rememberEmailKey: string
	messages: AuthScreenMessages
	/** Padrão de e-mail aceito. Default: `FAB_INSTITUTIONAL_EMAIL_PATTERN`. */
	emailPattern?: RegExp
	/** Reconhece credencial recusada na mensagem do `signIn`. Default: `DEFAULT_INVALID_CREDENTIALS_PATTERN`. */
	invalidCredentialsPattern?: RegExp
	/** Trocar de aba limpa o banner de erro e o de sucesso. Default: `false`. */
	clearFeedbackOnTabSwitch?: boolean
	/**
	 * Depois do cadastro, a mensagem de sucesso é gravada DEPOIS de voltar à aba de
	 * login (sobrevive a `clearFeedbackOnTabSwitch`). Default: `false` (antes).
	 */
	signUpSuccessAfterTabSwitch?: boolean
	/** Só redireciona quem já está autenticado a partir da view de login. Default: `false`. */
	redirectOnlyFromAuthView?: boolean
	/** Como confirmar a nova senha: `alert` do navegador ou banner de sucesso. Default: `"alert"`. */
	resetSuccessFeedback?: "alert" | "banner"
}

export interface ResolvedAuthScreenConfig {
	rememberEmailKey: string
	messages: AuthScreenMessages
	emailPattern: RegExp
	invalidCredentialsPattern: RegExp
	clearFeedbackOnTabSwitch: boolean
	signUpSuccessAfterTabSwitch: boolean
	redirectOnlyFromAuthView: boolean
	resetSuccessFeedback: "alert" | "banner"
}

export function resolveAuthScreenConfig(config: AuthScreenConfig): ResolvedAuthScreenConfig {
	return {
		rememberEmailKey: config.rememberEmailKey,
		messages: config.messages,
		emailPattern: config.emailPattern ?? FAB_INSTITUTIONAL_EMAIL_PATTERN,
		invalidCredentialsPattern: config.invalidCredentialsPattern ?? DEFAULT_INVALID_CREDENTIALS_PATTERN,
		clearFeedbackOnTabSwitch: config.clearFeedbackOnTabSwitch ?? false,
		signUpSuccessAfterTabSwitch: config.signUpSuccessAfterTabSwitch ?? false,
		redirectOnlyFromAuthView: config.redirectOnlyFromAuthView ?? false,
		resetSuccessFeedback: config.resetSuccessFeedback ?? "alert",
	}
}

type Setter<T> = (value: T) => void

export interface AuthScreenSetters {
	setActiveTab: Setter<AuthTab>
	setIsSubmitting: Setter<boolean>
	setError: Setter<string>
	setSuccessMessage: Setter<string>
	setLoginEmail: Setter<string>
	setLoginPassword: Setter<string>
	setRememberMe: Setter<boolean>
	setEmailError: Setter<string>
	setPasswordError: Setter<string>
	setRegisterData: Setter<RegisterInput>
	setRegisterEmailError: Setter<string>
}

/** Valores do render atual que os handlers leem. */
export interface AuthScreenHandlerState {
	isLocked: boolean
	loginEmail: string
	loginPassword: string
	rememberMe: boolean
	registerData: RegisterInput
	forgotEmail: string
	newPassword: string
	redirect: string | undefined
}

export interface AuthScreenHandlerDeps {
	state: AuthScreenHandlerState
	set: AuthScreenSetters
	config: ResolvedAuthScreenConfig
	actions: AuthScreenActions
	onNavigate: AuthScreenNavigate
	onTabChange?: (tab: AuthTab) => void
	onViewChange?: (view: "forgot" | null) => void
	onSuccess: () => void
	onFailure: () => void
	/** Lido só dentro dos handlers: no SSR não existe `localStorage`. */
	getStorage: () => KeyValueStorage
	/** `alert` do navegador, injetado pelo mesmo motivo. */
	notify: (message: string) => void
}

type InputChange = { target: { value: string } }
type CheckboxChange = { target: { checked: boolean } }
type FormSubmit = { preventDefault(): void }

export function createAuthScreenHandlers(deps: AuthScreenHandlerDeps) {
	const { state, set, config, actions, onNavigate, onTabChange, onViewChange, onSuccess, onFailure, getStorage, notify } = deps
	const { messages, emailPattern } = config

	// ── Navegação de view via URL ─────────────────────────────────────────────
	const goToForgot = () => onViewChange?.("forgot")
	const goToAuth = () => onViewChange?.(null)

	const switchTab = (value: AuthTab) => {
		set.setActiveTab(value)
		if (config.clearFeedbackOnTabSwitch) {
			set.setError("")
			set.setSuccessMessage("")
		}
		onTabChange?.(value)
	}

	// ── Handlers de formulário ────────────────────────────────────────────────

	const handleLoginEmailChange = (e: InputChange) => {
		const v = e.target.value
		set.setLoginEmail(v)
		set.setError("")
		set.setEmailError(getEmailHint(v, emailPattern, messages.emailHint))
	}

	const handleLoginPasswordChange = (e: InputChange) => {
		set.setLoginPassword(e.target.value)
		set.setError("")
		set.setPasswordError("")
	}

	const handleRememberMeChange = (e: CheckboxChange) => {
		const checked = e.target.checked
		set.setRememberMe(checked)
		syncRememberedEmailOnToggle(getStorage(), config.rememberEmailKey, checked, state.loginEmail, emailPattern)
	}

	const handleLogin = async (e: FormSubmit) => {
		e.preventDefault()
		if (state.isLocked) return
		const check = checkLoginInput(state.loginEmail, state.loginPassword, emailPattern, messages)
		if (!check.ok) {
			const setFieldError = check.field === "email" ? set.setEmailError : set.setPasswordError
			setFieldError(check.message)
			return
		}
		set.setIsSubmitting(true)
		set.setError("")
		set.setEmailError("")
		set.setPasswordError("")
		try {
			await actions.signIn(check.email, state.loginPassword)
			onSuccess()
			persistRememberedEmail(getStorage(), config.rememberEmailKey, state.rememberMe ? check.email : null)
			await onNavigate({ to: getPostLoginPath(state.redirect), replace: true })
		} catch (err) {
			onFailure()
			const failure = describeSignInFailure(err, config.invalidCredentialsPattern, messages)
			const setFailure = failure.field === "password" ? set.setPasswordError : set.setError
			setFailure(failure.message)
		} finally {
			set.setIsSubmitting(false)
		}
	}

	const handleRegisterEmailChange = (e: InputChange) => {
		const v = e.target.value
		set.setRegisterData({ ...state.registerData, email: v })
		set.setError("")
		set.setRegisterEmailError(getEmailHint(v, emailPattern, messages.emailHint))
	}

	const showSignUpSuccess = (email: string) => {
		if (config.signUpSuccessAfterTabSwitch) {
			// switchTab limpa successMessage — setar depois para a mensagem sobreviver na aba de login.
			switchTab("login")
			set.setLoginEmail(email)
			set.setSuccessMessage(messages.signUpSuccess)
			return
		}
		set.setSuccessMessage(messages.signUpSuccess)
		switchTab("login")
		set.setLoginEmail(email)
	}

	const handleRegister = async (e: FormSubmit) => {
		e.preventDefault()
		const check = checkRegisterInput(state.registerData, emailPattern, messages)
		if (!check.ok) {
			const setFieldError = check.field === "email" ? set.setRegisterEmailError : set.setError
			setFieldError(check.message)
			return
		}
		set.setIsSubmitting(true)
		set.setError("")
		set.setRegisterEmailError("")
		try {
			await actions.signUp(check.email, state.registerData.password, state.registerData.name)
			showSignUpSuccess(check.email)
		} catch (err) {
			set.setError(getErrorMessage(err, messages.signUpFallback))
		} finally {
			set.setIsSubmitting(false)
		}
	}

	const handleForgotPassword = async (e: FormSubmit) => {
		e.preventDefault()
		const check = checkForgotInput(state.forgotEmail, emailPattern, messages)
		if (!check.ok) {
			set.setError(check.message)
			return
		}
		set.setIsSubmitting(true)
		set.setError("")
		try {
			await actions.resetPassword(check.email)
			set.setSuccessMessage(messages.forgotSuccess)
		} catch (err) {
			set.setError(getErrorMessage(err, messages.forgotFallback))
		} finally {
			set.setIsSubmitting(false)
		}
	}

	const handleResetPassword = async (e: FormSubmit) => {
		e.preventDefault()
		const resetPwErr = getPasswordError(state.newPassword)
		if (resetPwErr) {
			set.setError(resetPwErr)
			return
		}
		set.setIsSubmitting(true)
		set.setError("")
		try {
			const { error } = await actions.updateUserPassword(state.newPassword)
			if (error) throw error
			if (config.resetSuccessFeedback === "banner") set.setSuccessMessage(messages.resetSuccess)
			else notify(messages.resetSuccess)
			await onNavigate({ to: "/" })
		} catch (err) {
			set.setError(getErrorMessage(err, messages.resetFallback))
		} finally {
			set.setIsSubmitting(false)
		}
	}

	return {
		goToForgot,
		goToAuth,
		switchTab,
		handleLoginEmailChange,
		handleLoginPasswordChange,
		handleRememberMeChange,
		handleLogin,
		handleRegisterEmailChange,
		handleRegister,
		handleForgotPassword,
		handleResetPassword,
	}
}
