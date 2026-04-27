import type { Context, Next } from "hono"
import { supabase } from "../db/supabase.ts"

export type AppRole = "app_requisitante" | "app_licitacoes" | "app_aci"

export async function authMiddleware(c: Context, next: Next) {
	const token = c.req.header("Authorization")?.replace("Bearer ", "")
	if (!token) {
		return c.json({ error: "Unauthorized", code: "MISSING_TOKEN" }, 401)
	}

	const {
		data: { user },
		error,
	} = await supabase.auth.getUser(token)
	if (error || !user) {
		return c.json({ error: "Unauthorized", code: "INVALID_TOKEN" }, 401)
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
