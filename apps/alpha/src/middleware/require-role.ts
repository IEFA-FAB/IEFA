import type { Context, Next } from "hono"
import { type AlphaAccess, type AlphaRole, hasRole } from "../lib/alpha-access.ts"

/**
 * Exige um papel do α em alguma OM — ou, com `{ global: true }`, sem recorte nenhum.
 *
 * O global existe para o que é CATÁLOGO COMPARTILHADO (regras de conformidade, fontes
 * normativas): promover uma regra muda o parecer de todas as OMs, então o ACI de uma OM não
 * a decide sozinho.
 *
 * Para o que pertence a um processo, este guard NÃO basta: ele só diz que o usuário é ACI em
 * ALGUMA OM. A rota confere a OM do processo (`decideSubmissionReview`).
 *
 * Arquivo próprio, sem o `authMiddleware`, para as rotas serem testáveis sem o `env` do
 * serviço.
 */
export function requireRole(role: AlphaRole, options: { global?: true } = {}) {
	return async (c: Context, next: Next) => {
		const access = c.get("access") as AlphaAccess | undefined
		if (!access || !hasRole(access, role, options)) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}
		await next()
	}
}
