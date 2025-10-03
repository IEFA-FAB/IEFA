import { AuthError } from "@supabase/supabase-js";

export type NormalizedAuthError = {
  code:
    | "INVALID_CREDENTIALS"
    | "EMAIL_NOT_CONFIRMED"
    | "RATE_LIMITED"
    | "INVALID_EMAIL"
    | "WEAK_PASSWORD"
    | "SIGNUP_DISABLED"
    | "ALREADY_REGISTERED"
    | "UNKNOWN";
  message: string;
};

export function normalizeAuthError(e: any): NormalizedAuthError {
  const status = e?.status as number | undefined;
  const msg = (e?.message as string | undefined) || "Erro de autenticação";

  if (/invalid login credentials/i.test(msg)) {
    return {
      code: "INVALID_CREDENTIALS",
      message: "Email ou senha incorretos",
    };
  }
  if (/email not confirmed/i.test(msg)) {
    return {
      code: "EMAIL_NOT_CONFIRMED",
      message: "Por favor, confirme seu email antes de fazer login",
    };
  }
  if (/rate limit/i.test(msg) || status === 429) {
    return {
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Aguarde um pouco e tente novamente.",
    };
  }
  if (/invalid format/i.test(msg)) {
    return { code: "INVALID_EMAIL", message: "Formato de email inválido" };
  }
  if (/at least 6 characters/i.test(msg)) {
    return {
      code: "WEAK_PASSWORD",
      message: "A senha deve ter pelo menos 6 caracteres",
    };
  }
  if (/signup is disabled/i.test(msg)) {
    return {
      code: "SIGNUP_DISABLED",
      message: "Cadastro temporariamente desabilitado",
    };
  }
  if (/user already registered/i.test(msg)) {
    return {
      code: "ALREADY_REGISTERED",
      message: "Este email já está cadastrado",
    };
  }
  return { code: "UNKNOWN", message: msg };
}

export function getAuthErrorMessage(error: AuthError): string {
  switch (error.message) {
    case "Invalid login credentials":
      return "Email ou senha incorretos";
    case "Email not confirmed":
      return "Por favor, confirme seu email antes de fazer login";
    case "User already registered":
      return "Este email já está cadastrado";
    case "Password should be at least 6 characters":
      return "A senha deve ter pelo menos 6 caracteres";
    case "Unable to validate email address: invalid format":
      return "Formato de email inválido";
    case "Signup is disabled":
      return "Cadastro temporariamente desabilitado";
    default:
      return error.message;
  }
}
