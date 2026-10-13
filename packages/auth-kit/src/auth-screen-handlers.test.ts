import { describe, expect, test } from "bun:test"

import { FAB_EMAIL_AUTH_MESSAGES as M } from "./auth-screen.ts"
import {
	type AuthScreenActions,
	type AuthScreenConfig,
	type AuthScreenHandlerState,
	type AuthScreenSetters,
	createAuthScreenHandlers,
	resolveAuthScreenConfig,
} from "./auth-screen-handlers.ts"

/** Registra cada efeito, na ordem, como "nome(valor)". */
function harness(opts: { state?: Partial<AuthScreenHandlerState>; config?: Partial<AuthScreenConfig>; actions?: Partial<AuthScreenActions> } = {}) {
	const log: string[] = []
	const rec =
		(name: string) =>
		(...args: unknown[]) => {
			log.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`)
		}
	const set: AuthScreenSetters = {
		setActiveTab: rec("setActiveTab"),
		setIsSubmitting: rec("setIsSubmitting"),
		setError: rec("setError"),
		setSuccessMessage: rec("setSuccessMessage"),
		setLoginEmail: rec("setLoginEmail"),
		setLoginPassword: rec("setLoginPassword"),
		setRememberMe: rec("setRememberMe"),
		setEmailError: rec("setEmailError"),
		setPasswordError: rec("setPasswordError"),
		setRegisterData: rec("setRegisterData"),
		setRegisterEmailError: rec("setRegisterEmailError"),
	}
	const actions: AuthScreenActions = {
		signIn: async (...a) => void rec("signIn")(...a),
		signUp: async (...a) => void rec("signUp")(...a),
		resetPassword: async (...a) => void rec("resetPassword")(...a),
		updateUserPassword: async (...a) => {
			rec("updateUserPassword")(...a)
			return { error: null }
		},
		verifyOtp: async () => ({ error: null }),
		...opts.actions,
	}
	const state: AuthScreenHandlerState = {
		isLocked: false,
		loginEmail: "",
		loginPassword: "",
		rememberMe: false,
		registerData: { name: "", email: "", password: "", confirm: "" },
		forgotEmail: "",
		newPassword: "",
		redirect: undefined,
		...opts.state,
	}
	const handlers = createAuthScreenHandlers({
		state,
		set,
		config: resolveAuthScreenConfig({ rememberEmailKey: "k", messages: M, ...opts.config }),
		actions,
		onNavigate: rec("navigate"),
		onTabChange: rec("onTabChange"),
		onViewChange: rec("onViewChange"),
		onSuccess: rec("onSuccess"),
		onFailure: rec("onFailure"),
		getStorage: () => ({
			getItem: () => null,
			setItem: rec("storage.set"),
			removeItem: rec("storage.remove"),
		}),
		notify: rec("alert"),
	})
	return { log, handlers }
}

const submit = { preventDefault() {} }
const input = (value: string) => ({ target: { value } })

describe("resolveAuthScreenConfig", () => {
	test("defaults são os do portal", () => {
		const c = resolveAuthScreenConfig({ rememberEmailKey: "k", messages: M })
		expect(c.clearFeedbackOnTabSwitch).toBe(false)
		expect(c.signUpSuccessAfterTabSwitch).toBe(false)
		expect(c.redirectOnlyFromAuthView).toBe(false)
		expect(c.resetSuccessFeedback).toBe("alert")
		expect(c.emailPattern.test("a@fab.mil.br")).toBe(true)
		expect(c.invalidCredentialsPattern.test("Invalid login credentials")).toBe(true)
	})
	test("valores explícitos vencem", () => {
		const pattern = /x/
		const c = resolveAuthScreenConfig({
			rememberEmailKey: "k",
			messages: M,
			emailPattern: pattern,
			invalidCredentialsPattern: pattern,
			clearFeedbackOnTabSwitch: true,
			signUpSuccessAfterTabSwitch: true,
			redirectOnlyFromAuthView: true,
			resetSuccessFeedback: "banner",
		})
		expect(c).toMatchObject({
			clearFeedbackOnTabSwitch: true,
			signUpSuccessAfterTabSwitch: true,
			redirectOnlyFromAuthView: true,
			resetSuccessFeedback: "banner",
		})
		expect(c.emailPattern).toBe(pattern)
		expect(c.invalidCredentialsPattern).toBe(pattern)
	})
})

describe("navegação", () => {
	test("goToForgot / goToAuth", () => {
		const { log, handlers } = harness()
		handlers.goToForgot()
		handlers.goToAuth()
		expect(log).toEqual(['onViewChange("forgot")', "onViewChange(null)"])
	})
	test("switchTab sem limpar feedback (portal)", () => {
		const { log, handlers } = harness()
		handlers.switchTab("register")
		expect(log).toEqual(['setActiveTab("register")', 'onTabChange("register")'])
	})
	test("switchTab limpando feedback (rumaer, sucont)", () => {
		const { log, handlers } = harness({ config: { clearFeedbackOnTabSwitch: true } })
		handlers.switchTab("login")
		expect(log).toEqual(['setActiveTab("login")', 'setError("")', 'setSuccessMessage("")', 'onTabChange("login")'])
	})
})

describe("campos do login", () => {
	test("e-mail fora do padrão mostra a dica", () => {
		const { log, handlers } = harness()
		handlers.handleLoginEmailChange(input("a@x.com"))
		expect(log).toEqual(['setLoginEmail("a@x.com")', 'setError("")', `setEmailError(${JSON.stringify(M.emailHint)})`])
	})
	test("e-mail aceito limpa a dica", () => {
		const { log, handlers } = harness()
		handlers.handleLoginEmailChange(input("a@fab.mil.br"))
		expect(log.at(-1)).toBe('setEmailError("")')
	})
	test("senha limpa erros", () => {
		const { log, handlers } = harness()
		handlers.handleLoginPasswordChange(input("x"))
		expect(log).toEqual(['setLoginPassword("x")', 'setError("")', 'setPasswordError("")'])
	})
	test("lembrar e-mail marcado com e-mail aceito grava", () => {
		const { log, handlers } = harness({ state: { loginEmail: "A@fab.mil.br" } })
		handlers.handleRememberMeChange({ target: { checked: true } })
		expect(log).toEqual(["setRememberMe(true)", 'storage.set("k","a@fab.mil.br")'])
	})
	test("lembrar e-mail desmarcado apaga", () => {
		const { log, handlers } = harness({ state: { loginEmail: "a@fab.mil.br" } })
		handlers.handleRememberMeChange({ target: { checked: false } })
		expect(log).toEqual(["setRememberMe(false)", 'storage.remove("k")'])
	})
})

describe("handleLogin", () => {
	test("travado não faz nada", async () => {
		const { log, handlers } = harness({ state: { isLocked: true, loginEmail: "a@fab.mil.br", loginPassword: "x" } })
		await handlers.handleLogin(submit)
		expect(log).toEqual([])
	})
	test("e-mail inválido", async () => {
		const { log, handlers } = harness({ state: { loginEmail: "a@x.com" } })
		await handlers.handleLogin(submit)
		expect(log).toEqual([`setEmailError(${JSON.stringify(M.emailInvalid)})`])
	})
	test("senha vazia", async () => {
		const { log, handlers } = harness({ state: { loginEmail: "a@fab.mil.br" } })
		await handlers.handleLogin(submit)
		expect(log).toEqual([`setPasswordError(${JSON.stringify(M.passwordRequired)})`])
	})
	test("sucesso lembrando o e-mail", async () => {
		const { log, handlers } = harness({ state: { loginEmail: " A@fab.mil.br", loginPassword: "pw", rememberMe: true, redirect: "/x" } })
		await handlers.handleLogin(submit)
		expect(log).toEqual([
			"setIsSubmitting(true)",
			'setError("")',
			'setEmailError("")',
			'setPasswordError("")',
			'signIn("a@fab.mil.br","pw")',
			"onSuccess()",
			'storage.set("k","a@fab.mil.br")',
			'navigate({"to":"/x","replace":true})',
			"setIsSubmitting(false)",
		])
	})
	test("sucesso sem lembrar apaga e cai na raiz com redirect externo", async () => {
		const { log, handlers } = harness({ state: { loginEmail: "a@fab.mil.br", loginPassword: "pw", redirect: "https://evil.com" } })
		await handlers.handleLogin(submit)
		expect(log.slice(-3)).toEqual(['storage.remove("k")', 'navigate({"to":"/","replace":true})', "setIsSubmitting(false)"])
	})
	test("credencial recusada vai para o campo de senha", async () => {
		const { log, handlers } = harness({
			state: { loginEmail: "a@fab.mil.br", loginPassword: "pw" },
			actions: {
				signIn: async () => {
					throw new Error("Invalid login credentials")
				},
			},
		})
		await handlers.handleLogin(submit)
		expect(log.slice(-3)).toEqual(["onFailure()", `setPasswordError(${JSON.stringify(M.invalidCredentials)})`, "setIsSubmitting(false)"])
	})
	test("outra falha vai para o banner", async () => {
		const { log, handlers } = harness({
			state: { loginEmail: "a@fab.mil.br", loginPassword: "pw" },
			actions: {
				signIn: async () => {
					throw new Error("Confirme seu e-mail antes de entrar")
				},
			},
		})
		await handlers.handleLogin(submit)
		expect(log.slice(-3)).toEqual(["onFailure()", 'setError("Confirme seu e-mail antes de entrar")', "setIsSubmitting(false)"])
	})
	test("padrão de credencial do app é respeitado", async () => {
		const { log, handlers } = harness({
			config: { invalidCredentialsPattern: /e-mail ou senha incorretos/i },
			state: { loginEmail: "a@fab.mil.br", loginPassword: "pw" },
			actions: {
				signIn: async () => {
					throw new Error("E-mail ou senha incorretos")
				},
			},
		})
		await handlers.handleLogin(submit)
		expect(log.at(-2)).toBe(`setPasswordError(${JSON.stringify(M.invalidCredentials)})`)
	})
})

describe("cadastro", () => {
	const valid = { name: "Nome", email: "A@fab.mil.br", password: "Abcdefg1", confirm: "Abcdefg1" }

	test("e-mail do cadastro: dica e dado parcial", () => {
		const { log, handlers } = harness({ state: { registerData: { ...valid, email: "" } } })
		handlers.handleRegisterEmailChange(input("a@x.com"))
		expect(log).toEqual([
			`setRegisterData(${JSON.stringify({ ...valid, email: "a@x.com" })})`,
			'setError("")',
			`setRegisterEmailError(${JSON.stringify(M.emailHint)})`,
		])
	})
	test("e-mail inválido no envio", async () => {
		const { log, handlers } = harness({ state: { registerData: { ...valid, email: "a@x.com" } } })
		await handlers.handleRegister(submit)
		expect(log).toEqual([`setRegisterEmailError(${JSON.stringify(M.emailInvalid)})`])
	})
	test("senha fraca", async () => {
		const { log, handlers } = harness({ state: { registerData: { ...valid, password: "abc", confirm: "abc" } } })
		await handlers.handleRegister(submit)
		expect(log).toEqual(['setError("Mínimo de 8 caracteres.")'])
	})
	test("sucesso: mensagem ANTES de trocar de aba (portal, rumaer)", async () => {
		const { log, handlers } = harness({ state: { registerData: valid } })
		await handlers.handleRegister(submit)
		expect(log).toEqual([
			"setIsSubmitting(true)",
			'setError("")',
			'setRegisterEmailError("")',
			'signUp("a@fab.mil.br","Abcdefg1","Nome")',
			`setSuccessMessage(${JSON.stringify(M.signUpSuccess)})`,
			'setActiveTab("login")',
			'onTabChange("login")',
			'setLoginEmail("a@fab.mil.br")',
			"setIsSubmitting(false)",
		])
	})
	// rumaer: switchTab limpa o feedback depois da mensagem — ela some. Comportamento preservado.
	test("sucesso com limpeza na troca de aba e mensagem antes: a mensagem é apagada (rumaer)", async () => {
		const { log, handlers } = harness({ state: { registerData: valid }, config: { clearFeedbackOnTabSwitch: true } })
		await handlers.handleRegister(submit)
		const success = log.indexOf(`setSuccessMessage(${JSON.stringify(M.signUpSuccess)})`)
		const cleared = log.indexOf('setSuccessMessage("")')
		expect(success).toBeGreaterThan(-1)
		expect(cleared).toBeGreaterThan(success)
	})
	test("sucesso: mensagem DEPOIS de trocar de aba (sucont)", async () => {
		const { log, handlers } = harness({ state: { registerData: valid }, config: { clearFeedbackOnTabSwitch: true, signUpSuccessAfterTabSwitch: true } })
		await handlers.handleRegister(submit)
		expect(log.slice(4)).toEqual([
			'setActiveTab("login")',
			'setError("")',
			'setSuccessMessage("")',
			'onTabChange("login")',
			'setLoginEmail("a@fab.mil.br")',
			`setSuccessMessage(${JSON.stringify(M.signUpSuccess)})`,
			"setIsSubmitting(false)",
		])
	})
	test("falha do signUp", async () => {
		const { log, handlers } = harness({
			state: { registerData: valid },
			actions: {
				signUp: async () => {
					throw "x"
				},
			},
		})
		await handlers.handleRegister(submit)
		expect(log.slice(-2)).toEqual([`setError(${JSON.stringify(M.signUpFallback)})`, "setIsSubmitting(false)"])
	})
})

describe("esqueci a senha", () => {
	test("e-mail inválido", async () => {
		const { log, handlers } = harness({ state: { forgotEmail: "a@x.com" } })
		await handlers.handleForgotPassword(submit)
		expect(log).toEqual([`setError(${JSON.stringify(M.emailInvalid)})`])
	})
	test("sucesso", async () => {
		const { log, handlers } = harness({ state: { forgotEmail: " A@fab.mil.br" } })
		await handlers.handleForgotPassword(submit)
		expect(log).toEqual([
			"setIsSubmitting(true)",
			'setError("")',
			'resetPassword("a@fab.mil.br")',
			`setSuccessMessage(${JSON.stringify(M.forgotSuccess)})`,
			"setIsSubmitting(false)",
		])
	})
	test("falha", async () => {
		const { log, handlers } = harness({
			state: { forgotEmail: "a@fab.mil.br" },
			actions: {
				resetPassword: async () => {
					throw new Error("rede")
				},
			},
		})
		await handlers.handleForgotPassword(submit)
		expect(log.slice(-2)).toEqual(['setError("rede")', "setIsSubmitting(false)"])
	})
})

describe("nova senha", () => {
	test("senha fraca", async () => {
		const { log, handlers } = harness({ state: { newPassword: "abc" } })
		await handlers.handleResetPassword(submit)
		expect(log).toEqual(['setError("Mínimo de 8 caracteres.")'])
	})
	test("sucesso com alert (portal, rumaer)", async () => {
		const { log, handlers } = harness({ state: { newPassword: "Abcdefg1" } })
		await handlers.handleResetPassword(submit)
		expect(log).toEqual([
			"setIsSubmitting(true)",
			'setError("")',
			'updateUserPassword("Abcdefg1")',
			`alert(${JSON.stringify(M.resetSuccess)})`,
			'navigate({"to":"/"})',
			"setIsSubmitting(false)",
		])
	})
	test("sucesso com banner (sucont)", async () => {
		const { log, handlers } = harness({ state: { newPassword: "Abcdefg1" }, config: { resetSuccessFeedback: "banner" } })
		await handlers.handleResetPassword(submit)
		expect(log.slice(3, 5)).toEqual([`setSuccessMessage(${JSON.stringify(M.resetSuccess)})`, 'navigate({"to":"/"})'])
	})
	test("erro devolvido pelo updateUserPassword", async () => {
		const { log, handlers } = harness({
			state: { newPassword: "Abcdefg1" },
			actions: { updateUserPassword: async () => ({ error: new Error("Auth session missing") }) },
		})
		await handlers.handleResetPassword(submit)
		expect(log.slice(-2)).toEqual(['setError("Auth session missing")', "setIsSubmitting(false)"])
	})
	test("lançamento que não é Error usa o fallback", async () => {
		const { log, handlers } = harness({
			state: { newPassword: "Abcdefg1" },
			actions: {
				updateUserPassword: async () => {
					throw "x"
				},
			},
		})
		await handlers.handleResetPassword(submit)
		expect(log.at(-2)).toBe(`setError(${JSON.stringify(M.resetFallback)})`)
	})
})
