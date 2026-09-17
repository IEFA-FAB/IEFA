import { resolveUserPermissions, type UserPermission } from "@iefa/pbac"
import { createServiceRoleClient } from "@iefa/supabase-kit"
import type { Context, Next } from "hono"
import { WWW_AUTHENTICATE } from "../api/agent-discovery.ts"
import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"
import { type AlphaAccess, type AlphaLevel, isAlphaDenied, resolveAlphaAccess } from "../lib/alpha-access.ts"

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

	// Falha ao ler permissões fecha a porta: tratar como "sem grant" rebaixaria o ACI em
	// silêncio e, pior, esconderia um deny.
	let permissions: UserPermission[]
	try {
		const accessControl = createServiceRoleClient({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SERVICE_ROLE_KEY, schema: "access_control" })
		permissions = await resolveUserPermissions(user.id, accessControl)
	} catch (cause) {
		console.error("[alpha] falha ao resolver permissões", cause)
		return c.json({ error: "Service Unavailable", code: "PERMISSIONS_UNAVAILABLE" }, 503)
	}

	if (isAlphaDenied(permissions)) {
		return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
	}

	c.set("user", user)
	c.set("access", resolveAlphaAccess(permissions))
	await next()
}

export function requireAlphaLevel(minLevel: AlphaLevel) {
	return async (c: Context, next: Next) => {
		const access = c.get("access") as AlphaAccess | undefined
		if (!access || access.level < minLevel) {
			return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403)
		}
		await next()
	}
}
