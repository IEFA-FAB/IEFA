import { describe, expect, test } from "bun:test"

import {
	checkForgotInput,
	checkLoginInput,
	checkRegisterInput,
	DEFAULT_INVALID_CREDENTIALS_PATTERN,
	deriveAuthView,
	describeSignInFailure,
	getEmailHint,
	getErrorMessage,
	getPasswordError,
	getPostLoginPath,
	getVerifiableOtpType,
	isEmailAccepted,
	type KeyValueStorage,
	FAB_EMAIL_AUTH_MESSAGES as M,
	FAB_INSTITUTIONAL_EMAIL_PATTERN as P,
	persistRememberedEmail,
	shouldRedirectAuthenticated,
	syncRememberedEmailOnToggle,
} from "./auth-screen.ts"

function memoryStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial))
	const calls: string[] = []
	const storage: KeyValueStorage = {
		getItem: (k) => store.get(k) ?? null,
		setItem: (k, v) => {
			calls.push(`set:${k}=${v}`)
			store.set(k, v)
		},
		removeItem: (k) => {
			calls.push(`remove:${k}`)
			store.delete(k)
		},
	}
	return { storage, store, calls }
}

describe("FAB_INSTITUTIONAL_EMAIL_PATTERN", () => {
	test.each([
		["fulano@fab.mil.br", true],
		["fulano.silva@fab.mil.br", true],
		["fulano_silva-2@fab.mil.br", true],
		["fulano..silva@fab.mil.br", false],
		[".fulano@fab.mil.br", false],
		["fulano+x@fab.mil.br", false],
		["fulano@fab.mil.br.evil.com", false],
		["fulano@evil.fab.mil.br", false],
		["fulano@gmail.com", false],
	])("%s → %p", (email, expected) => {
		expect(P.test(email)).toBe(expected)
	})
})

describe("getPasswordError", () => {
	test.each([
		["Ab1", "Mínimo de 8 caracteres."],
		["ABCDEFG1", "Inclua pelo menos uma letra minúscula."],
		["abcdefg1", "Inclua pelo menos uma letra maiúscula."],
		["Abcdefgh", "Inclua pelo menos um número."],
		["Abcdefg1", null],
	])("%s → %p", (pw, expected) => {
		expect(getPasswordError(pw)).toBe(expected)
	})
})

describe("deriveAuthView", () => {
	test("link de redefinição vence ?view=forgot", () => expect(deriveAuthView(true, "forgot")).toBe("reset"))
	test("?view=forgot", () => expect(deriveAuthView(false, "forgot")).toBe("forgot"))
	test("default", () => expect(deriveAuthView(false, undefined)).toBe("auth"))
	test("valor desconhecido de view cai em auth", () => expect(deriveAuthView(false, "x")).toBe("auth"))
})

describe("isEmailAccepted / getEmailHint", () => {
	test("normaliza caixa e espaço antes de testar", () => expect(isEmailAccepted("  Fulano@FAB.mil.br ", P)).toBe(true))
	test("campo vazio não mostra dica", () => expect(getEmailHint("", P, "dica")).toBe(""))
	test("e-mail aceito não mostra dica", () => expect(getEmailHint("a@fab.mil.br", P, "dica")).toBe(""))
	test("e-mail fora do padrão mostra a dica", () => expect(getEmailHint("a@gmail.com", P, "dica")).toBe("dica"))
})

describe("checkLoginInput", () => {
	test("e-mail inválido falha no campo de e-mail, antes da senha", () => {
		expect(checkLoginInput("x@gmail.com", "", P, M)).toEqual({ ok: false, field: "email", message: M.emailInvalid })
	})
	test("senha vazia falha no campo de senha", () => {
		expect(checkLoginInput("a@fab.mil.br", "", P, M)).toEqual({ ok: false, field: "password", message: M.passwordRequired })
	})
	test("ok devolve o e-mail normalizado", () => {
		expect(checkLoginInput(" A@Fab.Mil.Br ", "x", P, M)).toEqual({ ok: true, email: "a@fab.mil.br" })
	})
})

describe("checkRegisterInput", () => {
	const base = { name: "N", email: "a@fab.mil.br", password: "Abcdefg1", confirm: "Abcdefg1" }
	test("e-mail inválido falha no campo de e-mail", () => {
		expect(checkRegisterInput({ ...base, email: "a@x.com", password: "" }, P, M)).toEqual({ ok: false, field: "email", message: M.emailInvalid })
	})
	test("regra de senha falha no formulário", () => {
		expect(checkRegisterInput({ ...base, password: "abc" }, P, M)).toEqual({ ok: false, field: "form", message: "Mínimo de 8 caracteres." })
	})
	test("confirmação diferente falha no formulário", () => {
		expect(checkRegisterInput({ ...base, confirm: "Abcdefg2" }, P, M)).toEqual({ ok: false, field: "form", message: M.passwordMismatch })
	})
	test("ok devolve o e-mail normalizado", () => {
		expect(checkRegisterInput({ ...base, email: "A@FAB.MIL.BR" }, P, M)).toEqual({ ok: true, email: "a@fab.mil.br" })
	})
})

describe("checkForgotInput", () => {
	test("inválido", () => expect(checkForgotInput("a@x.com", P, M)).toEqual({ ok: false, message: M.emailInvalid }))
	test("ok", () => expect(checkForgotInput(" A@fab.mil.br", P, M)).toEqual({ ok: true, email: "a@fab.mil.br" }))
})

describe("getErrorMessage", () => {
	test("Error → message", () => expect(getErrorMessage(new Error("boom"), "fb")).toBe("boom"))
	test("Error com mensagem vazia → vazio, não o fallback", () => expect(getErrorMessage(new Error(""), "fb")).toBe(""))
	test("não-Error → fallback", () => expect(getErrorMessage("boom", "fb")).toBe("fb"))
})

describe("describeSignInFailure", () => {
	const SUCONT_PATTERN = /e-mail ou senha incorretos|invalid login credentials/i
	test("padrão default casa 'Invalid login credentials'", () => {
		expect(describeSignInFailure(new Error("Invalid login credentials"), DEFAULT_INVALID_CREDENTIALS_PATTERN, M)).toEqual({
			field: "password",
			message: M.invalidCredentials,
		})
	})
	test("padrão default casa 'Email ou senha incorretos'", () => {
		expect(describeSignInFailure(new Error("Email ou senha incorretos"), DEFAULT_INVALID_CREDENTIALS_PATTERN, M).field).toBe("password")
	})
	// Comportamento preservado: o `signIn` do kit lança "E-mail ou senha incorretos" (com hífen),
	// que o padrão default não reconhece — a mensagem vai para o banner.
	test("padrão default NÃO casa 'E-mail ou senha incorretos'", () => {
		expect(describeSignInFailure(new Error("E-mail ou senha incorretos"), DEFAULT_INVALID_CREDENTIALS_PATTERN, M)).toEqual({
			field: "form",
			message: "E-mail ou senha incorretos",
		})
	})
	test("padrão default é sensível a caixa", () => {
		expect(describeSignInFailure(new Error("invalid login credentials"), DEFAULT_INVALID_CREDENTIALS_PATTERN, M).field).toBe("form")
	})
	test("padrão do sucont casa com hífen e sem caixa", () => {
		expect(describeSignInFailure(new Error("E-mail ou senha incorretos"), SUCONT_PATTERN, M).field).toBe("password")
		expect(describeSignInFailure(new Error("INVALID LOGIN CREDENTIALS"), SUCONT_PATTERN, M).field).toBe("password")
	})
	test("não-Error vira 'Erro desconhecido' no banner", () => {
		expect(describeSignInFailure(42, DEFAULT_INVALID_CREDENTIALS_PATTERN, M)).toEqual({ field: "form", message: M.unknownError })
	})
	test("Error com mensagem vazia usa o fallback de autenticação", () => {
		expect(describeSignInFailure(new Error(""), DEFAULT_INVALID_CREDENTIALS_PATTERN, M)).toEqual({ field: "form", message: M.signInFallback })
	})
})

describe("getPostLoginPath", () => {
	test("redirect interno", () => expect(getPostLoginPath("/journal?x=1")).toBe("/journal?x=1"))
	test("redirect externo cai na raiz", () => expect(getPostLoginPath("https://evil.com")).toBe("/"))
	test("sem redirect cai na raiz", () => expect(getPostLoginPath(undefined)).toBe("/"))
})

describe("shouldRedirectAuthenticated", () => {
	test("autenticado, carregado, na view de login", () => expect(shouldRedirectAuthenticated(false, true, "auth")).toBe(true))
	test("carregando", () => expect(shouldRedirectAuthenticated(true, true, "auth")).toBe(false))
	test("não autenticado", () => expect(shouldRedirectAuthenticated(false, false, "auth")).toBe(false))
	test("fora da view de login", () => expect(shouldRedirectAuthenticated(false, true, "reset")).toBe(false))
})

describe("getVerifiableOtpType", () => {
	test("sem token", () => expect(getVerifiableOtpType(undefined, "recovery", null)).toBeNull())
	test("token vazio", () => expect(getVerifiableOtpType("", "recovery", null)).toBeNull())
	test("tipo fora de email/recovery", () => expect(getVerifiableOtpType("t", "signup", null)).toBeNull())
	test("sem tipo", () => expect(getVerifiableOtpType("t", undefined, null)).toBeNull())
	test("recovery", () => expect(getVerifiableOtpType("t", "recovery", null)).toBe("recovery"))
	test("email", () => expect(getVerifiableOtpType("t", "email", "outro")).toBe("email"))
	test("token já verificado", () => expect(getVerifiableOtpType("t", "recovery", "t")).toBeNull())
})

describe("lembrar e-mail", () => {
	test("persistRememberedEmail grava e apaga", () => {
		const { storage, calls } = memoryStorage()
		persistRememberedEmail(storage, "k", "a@fab.mil.br")
		persistRememberedEmail(storage, "k", null)
		expect(calls).toEqual(["set:k=a@fab.mil.br", "remove:k"])
	})
	test("persistRememberedEmail grava string vazia (só null apaga)", () => {
		const { storage, calls } = memoryStorage()
		persistRememberedEmail(storage, "k", "")
		expect(calls).toEqual(["set:k="])
	})
	test("marcar com e-mail aceito grava normalizado", () => {
		const { storage, calls } = memoryStorage()
		syncRememberedEmailOnToggle(storage, "k", true, " A@fab.mil.br ", P)
		expect(calls).toEqual(["set:k=a@fab.mil.br"])
	})
	test("marcar com e-mail vazio apaga", () => {
		const { storage, calls } = memoryStorage()
		syncRememberedEmailOnToggle(storage, "k", true, "", P)
		expect(calls).toEqual(["remove:k"])
	})
	test("marcar com e-mail fora do padrão apaga", () => {
		const { storage, calls } = memoryStorage()
		syncRememberedEmailOnToggle(storage, "k", true, "a@gmail.com", P)
		expect(calls).toEqual(["remove:k"])
	})
	test("desmarcar apaga", () => {
		const { storage, calls } = memoryStorage({ k: "a@fab.mil.br" })
		syncRememberedEmailOnToggle(storage, "k", false, "a@fab.mil.br", P)
		expect(calls).toEqual(["remove:k"])
	})
})
