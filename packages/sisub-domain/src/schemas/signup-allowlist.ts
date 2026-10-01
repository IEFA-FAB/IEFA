import { z } from "zod"
import { UuidSchema } from "./common.ts"

/**
 * Autorização de cadastro de e-mail FORA de `@fab.mil.br` (`access_control.signup_allowlist`,
 * migration 20261001100000).
 *
 * O e-mail aqui NÃO escolhe de quem é a linha lida ou escrita: é o endereço que passa a poder
 * ganhar conta. Quem autoriza é sempre o da sessão (`ctx.userId`) — não há campo de ator.
 *
 * A regra "e-mail institucional não precisa de autorização" mora no banco
 * (`SIGNUP_ALLOWLIST_INSTITUTIONAL`) e na tela (`isFabEmail`, `@iefa/auth-kit`); repeti-la aqui
 * daria ao domínio uma terceira cópia do padrão para divergir.
 */

/** Motivo: obrigatório, e longo o bastante para não ser um "." — ele é lido em auditoria. */
export const SIGNUP_ALLOWLIST_REASON_MIN_LENGTH = 10
export const SIGNUP_ALLOWLIST_REASON_MAX_LENGTH = 500

/** Mesmo formato do CHECK da tabela: um `@`, sem espaço, domínio com ponto. */
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export const AuthorizeExternalSignupSchema = z.object({
	email: z.string().trim().toLowerCase().max(254, "O e-mail deve ter no máximo 254 caracteres.").regex(EMAIL_SHAPE, "Informe um e-mail válido."),
	reason: z
		.string()
		.trim()
		.min(SIGNUP_ALLOWLIST_REASON_MIN_LENGTH, `Informe o motivo (mínimo de ${SIGNUP_ALLOWLIST_REASON_MIN_LENGTH} caracteres).`)
		.max(SIGNUP_ALLOWLIST_REASON_MAX_LENGTH, `O motivo deve ter no máximo ${SIGNUP_ALLOWLIST_REASON_MAX_LENGTH} caracteres.`),
})
export type AuthorizeExternalSignup = z.infer<typeof AuthorizeExternalSignupSchema>

export const RevokeExternalSignupSchema = z.object({
	id: UuidSchema,
})
export type RevokeExternalSignup = z.infer<typeof RevokeExternalSignupSchema>
