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

/** Sessão entregue no fragmento da URL pelo fluxo implícito do GoTrue. */
export type ImplicitSession = { accessToken: string; refreshToken: string; type: string | null }

/**
 * Lê `#access_token=…&refresh_token=…` do fragmento.
 *
 * O convite do admin API (`inviteUserByEmail`, console de e-mails externos) não tem code
 * verifier, então o GoTrue devolve a sessão no fluxo IMPLÍCITO — e o client do navegador, em
 * PKCE, recusa esse formato ("Not a valid PKCE flow url"). A tela que recebe o convite o consome
 * à mão com `setSession`, que valida o token no GoTrue antes de aceitar. `null` quando o
 * fragmento não traz os dois tokens.
 */
export function readImplicitSession(hash: string): ImplicitSession | null {
	const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
	const accessToken = params.get("access_token")
	const refreshToken = params.get("refresh_token")
	if (!accessToken || !refreshToken) return null
	return { accessToken, refreshToken, type: params.get("type") }
}
