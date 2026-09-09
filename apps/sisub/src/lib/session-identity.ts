/**
 * @module session-identity
 * Sobrescreve, no payload de uma server function, os campos que nomeiam um usuário pelos
 * valores da sessão.
 *
 * Existe para que a garantia self-only apareça no CÓDIGO e não num comentário. Até aqui
 * `forecast.fn.ts` prometia numa linha de comentário que "o `userId` do payload é IGNORADO",
 * e a promessa se sustentava só na ordem do spread (`{ ...data, userId }`): trocar por
 * `data.userId` — ou inverter o spread — passava verde na suíte inteira.
 *
 * `withSessionIdentity(data, session, ["userId"])` diz na própria chamada o que a fn garante,
 * e o tipo de `fields` recusa um campo que o payload não declara — nomear `"email"` num
 * payload sem `email` é erro de typecheck, não uma sobrescrita que silenciosamente não
 * acontece.
 *
 * Módulo puro de propósito: nada de `env.server`/supabase aqui, senão o teste unitário
 * carregaria credencial na importação (a armadilha do `.env` local descrita no CLAUDE.md).
 */

/**
 * Identidade autenticada da request. Sempre derivada do JWT — nunca do corpo. Um email
 * vindo do cliente permite reivindicar a identidade de outra conta: `core.user_data.email`
 * é UNIQUE e é por ele que o console de permissões encontra uma pessoa.
 */
export type SessionIdentity = { userId: string; email: string }

/** Campos de payload que nomeiam um usuário e portanto não podem vir do cliente. */
export type IdentityField = "userId" | "user_id" | "email"

/** Nomes de campo de identidade presentes em `T`. */
type IdentityKeyOf<T> = Extract<keyof T, IdentityField>

/**
 * Devolve uma cópia de `payload` com cada campo de `fields` trocado pelo valor da sessão.
 *
 * O tipo de retorno é o próprio `T`: a fn continua entregando à operation exatamente o
 * formato que o schema descreve, só com o dono corrigido.
 *
 * @param payload - Payload já validado pelo `.validator()`
 * @param session - Identidade da sessão (`requireSessionIdentity()`)
 * @param fields  - Campos a sobrescrever; ao menos um, e todos precisam existir em `T`
 */
export function withSessionIdentity<T extends object, K extends IdentityKeyOf<T>>(payload: T, session: SessionIdentity, fields: readonly [K, ...K[]]): T {
	const out = { ...payload } as Record<string, unknown>
	for (const field of fields) {
		out[field] = field === "email" ? session.email : session.userId
	}
	return out as T
}
