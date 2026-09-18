import { fetchUnitSupportGraph, resolveUserPermissions, type UnitSupportEdge, type UserPermission } from "@iefa/pbac"
import type { Context, Next } from "hono"
import { WWW_AUTHENTICATE } from "../api/agent-discovery.ts"
import { accessControl, core, supabase } from "../db/supabase.ts"
import { needsUnitGraph, resolveAlphaAccess } from "../lib/alpha-access.ts"

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
		permissions = await resolveUserPermissions(user.id, accessControl)
	} catch (cause) {
		console.error("[alpha] falha ao resolver permissões", cause)
		return c.json({ error: "Service Unavailable", code: "PERMISSIONS_UNAVAILABLE" }, 503)
	}

	// O grafo de apoio só é lido quando algum papel do α tem escopo de OM (allow ou deny) —
	// quem tem só grant global, ou nenhum, não paga a leitura. Mesma postura da leitura de
	// permissões: falhar aqui fecha a porta, porque cobertura vazia por falha de infra seria
	// um deny silencioso, e cobertura sem o recorte do deny seria pior.
	let graph: UnitSupportEdge[] | null = null
	if (needsUnitGraph(permissions)) {
		try {
			graph = await fetchUnitSupportGraph(core)
		} catch (cause) {
			console.error("[alpha] falha ao ler a hierarquia de apoio", cause)
			return c.json({ error: "Service Unavailable", code: "PERMISSIONS_UNAVAILABLE" }, 503)
		}
	}

	c.set("user", user)
	c.set("access", resolveAlphaAccess(permissions, graph))
	await next()
}
