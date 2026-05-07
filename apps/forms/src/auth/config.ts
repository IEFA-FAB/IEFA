import type { User } from "@supabase/supabase-js"

export type PublicPath = string | RegExp | ((pathname: string) => boolean)

export type AuthBrand = {
	title?: string
	subtitle?: string
	logoUrl?: string
}

export type AuthUIText = {
	loginTitle?: string
	loginSubtitle?: string
	loginButton?: string
	forgotPassword?: string
	rememberEmail?: string
	invalidEmailMsg?: string
	weakPasswordMsg?: string
	sendingMsg?: string
	registerTitle?: string
	registerSubtitle?: string
	createAccountBtn?: string
	resetTitle?: string
	resetSubtitle?: string
	updatingPasswordBtn?: string
	checkingAuth?: string
	recoveringEmailSent?: string
	genericAuthError?: string
}

export type StorageKeys = {
	rememberEmail: string
	redirect: string
}

export type FetchUserMeta = (user: User) => Promise<Record<string, unknown>>

export type AuthConfig = {
	loginPath?: string
	defaultRedirect?: string
	publicPaths?: PublicPath[]
	emailRegex?: RegExp
	storageKeys?: StorageKeys
	brand?: AuthBrand
	ui?: AuthUIText
	fetchUserMeta?: FetchUserMeta
}

export const DEFAULT_CONFIG: Required<Pick<AuthConfig, "loginPath" | "defaultRedirect" | "publicPaths" | "emailRegex" | "storageKeys" | "brand" | "ui">> = {
	loginPath: "/login",
	defaultRedirect: "/",
	publicPaths: ["/login", "/register", "/auth/reset-password", "/health", "/favicon.ico", "/favicon.svg", (p) => p.startsWith("/assets")],
	emailRegex: /^[a-zA-Z0-9._%+-]+@fab\.mil\.br$/,
	storageKeys: {
		rememberEmail: "fab_remember_email",
		redirect: "auth:redirectTo",
	},
	brand: {
		title: "Formulários IEFA",
		subtitle: "Questionários e pesquisas internas",
		logoUrl: "",
	},
	ui: {
		loginTitle: "Entrar",
		loginSubtitle: "Acesso restrito a emails @fab.mil.br",
		loginButton: "Entrar",
		forgotPassword: "Esqueceu a senha?",
		rememberEmail: "Lembrar email",
		invalidEmailMsg: "Por favor, utilize um email institucional (@fab.mil.br).",
		weakPasswordMsg: "A senha deve ter pelo menos 6 caracteres.",
		sendingMsg: "Enviando...",
		registerTitle: "Criar Conta",
		registerSubtitle: "Acesso restrito a emails @fab.mil.br",
		createAccountBtn: "Criar Conta",
		resetTitle: "Definir nova senha",
		resetSubtitle: "Crie sua nova senha para acessar o sistema",
		updatingPasswordBtn: "Atualizar senha",
		checkingAuth: "Verificando autenticação...",
		recoveringEmailSent: "Email de recuperação enviado! Verifique sua caixa de entrada.",
		genericAuthError: "Ocorreu um erro durante a autenticação. Tente mais tarde.",
	},
}

export function resolveAuthConfig(overrides?: AuthConfig) {
	const base = DEFAULT_CONFIG
	return {
		...base,
		...overrides,
		storageKeys: { ...base.storageKeys, ...overrides?.storageKeys },
		brand: { ...base.brand, ...overrides?.brand },
		ui: { ...base.ui, ...overrides?.ui },
		publicPaths: overrides?.publicPaths ?? base.publicPaths,
	}
}
