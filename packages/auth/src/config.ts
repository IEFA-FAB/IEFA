// packages/auth/src/config.ts
import type { User } from "@supabase/supabase-js";

export type PublicPath = string | RegExp | ((pathname: string) => boolean);

export type AuthBrand = {
  title?: string;     // ex: "SISUB"
  subtitle?: string;  // ex: "Gerencie a demanda do rancho"
  logoUrl?: string;   // opcional
};

export type AuthUIText = {
  // Login
  loginTitle?: string;
  loginSubtitle?: string;
  loginButton?: string;
  forgotPassword?: string;
  rememberEmail?: string;
  invalidEmailMsg?: string;
  weakPasswordMsg?: string;
  sendingMsg?: string;
  // Registro
  registerTitle?: string;
  registerSubtitle?: string;
  createAccountBtn?: string;
  // Reset
  resetTitle?: string;
  resetSubtitle?: string;
  updatingPasswordBtn?: string;
  // Mensagens comuns
  checkingAuth?: string;
  recoveringEmailSent?: string;
  genericAuthError?: string;
};

export type StorageKeys = {
  rememberEmail: string;
  redirect: string;
};

export type FetchUserMeta = (user: User) => Promise<Record<string, unknown>>;

export type AuthConfig = {
  loginPath?: string;               // ex: "/login"
  defaultRedirect?: string;         // ex: "/rancho"
  publicPaths?: PublicPath[];       // rotas públicas
  emailRegex?: RegExp;              // ex: /^[...]+@fab\.mil\.br$/
  storageKeys?: StorageKeys;        // remember/redirect keys
  brand?: AuthBrand;                // titulo/subtitulo/logo
  ui?: AuthUIText;                  // textos opcionais/overrides
  fetchUserMeta?: FetchUserMeta;    // opcional (ex: role/om)
};

export const DEFAULT_CONFIG: Required<Pick<
  AuthConfig,
  "loginPath" | "defaultRedirect" | "publicPaths" | "emailRegex" | "storageKeys" | "brand" | "ui"
>> = {
  loginPath: "/login",
  defaultRedirect: "/rancho",
  publicPaths: [
    "/login",
    "/register",
    "/auth/reset-password",
    "/healthz",
    "/favicon.ico",
    "/favicon.svg",
    (p) => p.startsWith("/assets"),
  ],
  emailRegex: /^[a-zA-Z0-9._%+-]+@fab\.mil\.br$/,
  storageKeys: {
    rememberEmail: "fab_remember_email",
    redirect: "auth:redirectTo",
  },
  brand: {
    title: "SISUB",
    subtitle: "Gerencie a demanda do rancho",
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
};

export function resolveAuthConfig(overrides?: AuthConfig) {
  const base = DEFAULT_CONFIG;
  return {
    ...base,
    ...overrides,
    storageKeys: { ...base.storageKeys, ...overrides?.storageKeys },
    brand: { ...base.brand, ...overrides?.brand },
    ui: { ...base.ui, ...overrides?.ui },
    publicPaths: overrides?.publicPaths ?? base.publicPaths,
  };
}