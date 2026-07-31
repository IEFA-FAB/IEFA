import type { Context, Next } from "hono"
import { WWW_AUTHENTICATE } from "../api/agent-discovery.ts"
import { supabase } from "../db/supabase.ts"

export type AppRole = "app_requisitante" | "app_licitacoes" | "app_aci"

/**
 * O `WWW-Authenticate` aponta os metadados do recurso (RFC 9728). Sem ele o
 * cliente recebe 401 sem nenhuma pista de qual emissor aceita — que é o problema
 * que essa RFC existe para resolver.
 */
function unauthorized(c: Context, code: "MISSING_TOKEN" | "INVALID_TOKEN") {
	c.header("WWW-Authenticate", WWW_AUTHENTICATE)
	return c.json({ error: "Unauthorized", code }, 401)
}

export async function authMiddleware(c: Context, next: Next) {
	const token = c.req.header("Authorization")?.replace("Bearer ", "")
	if (!token) {
		return unauthorized(c, "MISSING_TOKEN")
	}

	const {
		data: { user },
		error,
	} = await supabase.auth.getUser(token)
	if (error || !user) {
		return unauthorized(c, "INVALID_TOKEN")
	}

	c.set("user", user)
	c.set("role", user.app_metadata?.role as AppRole)
	await next()
}

export function requireRole(allowedRoles: AppRole[]) {
	return async (c: Context, next: Next) => {
		const role = c.get("role") as AppRole
		if (!allowedRoles.includes(role)) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}
		await next()
	}
}
