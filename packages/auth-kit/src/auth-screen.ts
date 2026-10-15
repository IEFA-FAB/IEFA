/**
 * @module auth-screen
 * Regras puras da tela de autenticação (login, cadastro, esqueci e nova senha)
 * que os apps `portal`, `contrate`, `rumaer`, `sucont` e `forms` repetiam cada
 * um na sua cópia de `AuthScreen.tsx`.
 *
 * O que muda de app para app (texto com "email" ou "e-mail", chave do "lembrar
 * e-mail", como reconhecer credencial inválida) entra por parâmetro: este módulo
 * não decide o comportamento de nenhum app, só deixa de repeti-lo.
 */

import { INVALID_CREDENTIALS_MESSAGE, normalizeEmail } from "./errors.ts"
import { safeRedirect } from "./redirect.ts"

/**
 * E-mail aceito pelas telas de login: parte local só com letras, números e
 * `.`/`_`/`-` entre eles, domínio exato `@fab.mil.br`.
 *
 * É mais estrito que `isFabEmail` (que espelha o hook do banco e aceita qualquer
 * parte local sem espaço): a tela recusa caractere especial antes de chegar ao
 * GoTrue. Os dois não se substituem.
 */
export const FAB_INSTITUTIONAL_EMAIL_PATTERN = /^[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@fab\.mil\.br$/

/**
 * Reconhece credencial inválida na mensagem que o `signIn` lança.
 *
 * O `signIn` de `createAuthActions` traduz a recusa para `INVALID_CREDENTIALS_MESSAGE`; o
 * padrão sai dessa constante, e não de uma cópia do texto, porque a cópia antiga
 * ("Email ou senha incorretos", sem hífen) nunca casou com o que o kit lança e o
 * texto neutro do app não aparecia. A frase em inglês do GoTrue fica para `signIn` que não
 * traduz. Sem caixa: a mensagem é texto de provider, não identificador. A constante entra
 * sem escape porque não tem metacaractere de regex (o teste garante).
 */
export const DEFAULT_INVALID_CREDENTIALS_PATTERN = new RegExp(`${INVALID_CREDENTIALS_MESSAGE}|invalid login credentials`, "i")

export type AuthView = "auth" | "forgot" | "reset"
export type AuthTab = "login" | "register"

/** Textos que a tela mostra; cada app passa os seus. */
export interface AuthScreenMessages {
	/** Dica ao digitar um e-mail fora do padrão (login e cadastro). */
	emailHint: string
	/** Erro ao enviar com e-mail fora do padrão. */
	emailInvalid: string
	passwordRequired: string
	/** Banner quando o `signIn` recusa a credencial: neutro, sem apontar qual campo está errado. */
	invalidCredentials: string
	/** Mensagem quando o `signIn` lança algo que não é `Error`. */
	unknownError: string
	/** Usada quando a mensagem do erro do `signIn` vem vazia. */
	signInFallback: string
	passwordMismatch: string
	signUpSuccess: string
	signUpFallback: string
	forgotSuccess: string
	forgotFallback: string
	resetSuccess: string
	resetFallback: string
	otpInvalid: string
}

/** Textos do portal, contrate, rumaer e forms ("email", sem hífen). */
export const FAB_EMAIL_AUTH_MESSAGES: AuthScreenMessages = {
	emailHint: "Use seu email institucional @fab.mil.br (sem caracteres especiais).",
	emailInvalid: "Email inválido. Use seu email @fab.mil.br (sem caracteres especiais).",
	passwordRequired: "Informe a senha.",
	invalidCredentials: "Senha incorreta ou email não cadastrado",
	unknownError: "Erro desconhecido",
	signInFallback: "Erro durante a autenticação. Tente mais tarde.",
	passwordMismatch: "As senhas não coincidem.",
	signUpSuccess: "Conta criada! Verifique seu email.",
	signUpFallback: "Erro ao criar conta.",
	forgotSuccess: "Link enviado! Verifique sua caixa de entrada.",
	forgotFallback: "Erro ao enviar email.",
	resetSuccess: "Senha atualizada com sucesso!",
	resetFallback: "Erro ao atualizar senha.",
	otpInvalid: "Link inválido ou expirado. Solicite uma nova recuperação.",
}

/** Regra de senha do cadastro e da nova senha: a primeira regra violada, ou `null`. */
export function getPasswordError(v: string): string | null {
	if (v.length < 8) return "Mínimo de 8 caracteres."
	if (!/[a-z]/.test(v)) return "Inclua pelo menos uma letra minúscula."
	if (!/[A-Z]/.test(v)) return "Inclua pelo menos uma letra maiúscula."
	if (!/\d/.test(v)) return "Inclua pelo menos um número."
	return null
}

/**
 * View derivada da URL — nunca estado local.
 * Prioridade: link de redefinição → reset | ?view=forgot → forgot | default → auth.
 */
export function deriveAuthView(isResetLink: boolean, view: string | undefined): AuthView {
	if (isResetLink) return "reset"
	return view === "forgot" ? "forgot" : "auth"
}

export function isEmailAccepted(raw: string, pattern: RegExp): boolean {
	return pattern.test(normalizeEmail(raw))
}

/** Dica de campo enquanto a pessoa digita: vazia para campo vazio ou e-mail aceito. */
export function getEmailHint(raw: string, pattern: RegExp, hint: string): string {
	return raw && !isEmailAccepted(raw, pattern) ? hint : ""
}

export type LoginInputCheck = { ok: true; email: string } | { ok: false; field: "email" | "password"; message: string }

/** Validação do envio do login, na ordem da tela: e-mail primeiro, depois senha vazia. */
export function checkLoginInput(email: string, password: string, pattern: RegExp, messages: AuthScreenMessages): LoginInputCheck {
	const norm = normalizeEmail(email)
	if (!pattern.test(norm)) return { ok: false, field: "email", message: messages.emailInvalid }
	if (!password) return { ok: false, field: "password", message: messages.passwordRequired }
	return { ok: true, email: norm }
}

export interface RegisterInput {
	name: string
	email: string
	password: string
	confirm: string
}

export type RegisterInputCheck = { ok: true; email: string } | { ok: false; field: "email" | "form"; message: string }

/** Validação do cadastro: e-mail, regra de senha, confirmação — a primeira falha vence. */
export function checkRegisterInput(data: RegisterInput, pattern: RegExp, messages: AuthScreenMessages): RegisterInputCheck {
	const norm = normalizeEmail(data.email)
	if (!pattern.test(norm)) return { ok: false, field: "email", message: messages.emailInvalid }
	const passwordError = getPasswordError(data.password)
	if (passwordError) return { ok: false, field: "form", message: passwordError }
	if (data.password !== data.confirm) return { ok: false, field: "form", message: messages.passwordMismatch }
	return { ok: true, email: norm }
}

export type ForgotInputCheck = { ok: true; email: string } | { ok: false; message: string }

export function checkForgotInput(email: string, pattern: RegExp, messages: AuthScreenMessages): ForgotInputCheck {
	const norm = normalizeEmail(email)
	if (!pattern.test(norm)) return { ok: false, message: messages.emailInvalid }
	return { ok: true, email: norm }
}

/** Mensagem do erro, ou o fallback quando não é `Error`. `Error` com mensagem vazia devolve "". */
export function getErrorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback
}

/**
 * Texto do banner quando o `signIn` falha. Credencial recusada vira a mensagem neutra do app.
 *
 * Toda falha vai para o banner, nunca para um campo: erro no campo de senha apontaria a senha
 * como culpada quando o e-mail é que não existe (`openspec/specs/forms-auth`), e erro de campo
 * desabilita o Entrar até a pessoa mexer naquele campo. O banner some ao editar qualquer campo
 * do login e ao trocar de aba.
 */
export function describeSignInFailure(err: unknown, invalidCredentialsPattern: RegExp, messages: AuthScreenMessages): string {
	const msg = getErrorMessage(err, messages.unknownError)
	if (invalidCredentialsPattern.test(msg)) return messages.invalidCredentials
	return msg || messages.signInFallback
}

/** Destino depois do login: o `redirect` da URL, se interno, ou a raiz. */
export function getPostLoginPath(redirect: string | undefined): string {
	return safeRedirect(redirect) ?? "/"
}

/** Quem já está autenticado sai da tela — `gateView` restringe a qual view isso vale. */
export function shouldRedirectAuthenticated(isLoading: boolean, isAuthenticated: boolean, gateView: AuthView): boolean {
	return !isLoading && isAuthenticated && gateView === "auth"
}

/**
 * Tipo de OTP a verificar agora, ou `null`. O token é consumido no primeiro
 * `verifyOtp`; `lastVerifiedToken` evita re-verificar o mesmo token.
 * resetPasswordForEmail gera links com type=recovery; a confirmação de cadastro,
 * type=email. Os demais tipos não são verificados por esta tela.
 */
export function getVerifiableOtpType(tokenHash: string | undefined, type: string | undefined, lastVerifiedToken: string | null): "email" | "recovery" | null {
	if (!tokenHash || (type !== "email" && type !== "recovery")) return null
	return lastVerifiedToken !== tokenHash ? type : null
}

/** Subconjunto do `Storage` que o "lembrar e-mail" usa (o `localStorage` no navegador). */
export interface KeyValueStorage {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
	removeItem(key: string): void
}

/** Grava o e-mail lembrado, ou apaga quando `email` é `null`. */
export function persistRememberedEmail(storage: KeyValueStorage, key: string, email: string | null): void {
	if (email !== null) storage.setItem(key, email)
	else storage.removeItem(key)
}

/** Ao marcar/desmarcar "lembrar e-mail": grava só e-mail preenchido e aceito; senão apaga. */
export function syncRememberedEmailOnToggle(storage: KeyValueStorage, key: string, checked: boolean, rawEmail: string, pattern: RegExp): void {
	const norm = normalizeEmail(rawEmail)
	const shouldKeep = checked && rawEmail !== "" && pattern.test(norm)
	persistRememberedEmail(storage, key, shouldKeep ? norm : null)
}
