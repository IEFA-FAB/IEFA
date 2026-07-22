/** Tipos de OTP que o Supabase manda por email (`?type=…` no link). */
export type AuthOtpType = "email" | "recovery" | "signup" | "invite" | "magiclink" | "email_change"

const OTP_TYPES: readonly AuthOtpType[] = ["email", "recovery", "signup", "invite", "magiclink", "email_change"]

export function parseOtpType(type: string | undefined): AuthOtpType {
	return OTP_TYPES.includes(type as AuthOtpType) ? (type as AuthOtpType) : "recovery"
}

/**
 * Só o link de recuperação exige que o usuário permaneça em /auth para digitar a
 * nova senha. Nos demais (signup, invite, magiclink) o verifyOtp já cria a sessão
 * e o usuário deve seguir para o app — segurar a página nesses casos deixaria o
 * link consumido e o usuário parado na tela de login.
 */
export function isPasswordRecoveryLink(search: { token_hash?: string; type?: string }): boolean {
	if (!search.token_hash) return false
	const type = parseOtpType(search.type)
	return type === "recovery" || type === "email"
}
