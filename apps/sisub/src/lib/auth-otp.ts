/** Tipos de OTP que o Supabase manda por e-mail (`?type=…` no link). */
export type AuthOtpType = "email" | "recovery" | "signup" | "invite" | "magiclink" | "email_change"

const OTP_TYPES: readonly AuthOtpType[] = ["email", "recovery", "signup", "invite", "magiclink", "email_change"]

/**
 * O template de e-mail do projeto entrega o OTP como `token_hash` + `type` na
 * query. Verificar com o tipo errado devolve "Token has expired or is invalid",
 * então o tipo real precisa chegar ao `verifyOtp` — não dá para fixar "email".
 * Link sem tipo reconhecível cai em `recovery`, que é o único fluxo que pede
 * uma tela própria.
 */
export function parseOtpType(type: string | undefined): AuthOtpType {
	return OTP_TYPES.includes(type as AuthOtpType) ? (type as AuthOtpType) : "recovery"
}
