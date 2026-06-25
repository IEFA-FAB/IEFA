/**
 * @module auth.server
 * Resolve authenticated UserContext inside server functions.
 * Throws on unauthenticated requests — server fn returns 401.
 */

import { resolveUserPermissions } from "@iefa/pbac"
import type { UserContext } from "@iefa/sisub-domain/types"
import { setResponseStatus } from "@tanstack/react-start/server"
import { getAccessControlClient, getSupabaseAuthClient } from "@/lib/supabase.server"

/** Sinaliza 401 no HTTP antes de lançar — senão o erro sai como 500 (default do framework). */
function unauthorized(): never {
	setResponseStatus(401)
	throw new Error("UNAUTHORIZED")
}

export async function requireUserId(): Promise<string> {
	const {
		data: { user },
	} = await getSupabaseAuthClient().auth.getUser()
	if (!user) unauthorized()
	return user.id
}

/**
 * Validates the request's JWT (via SSR cookies) and resolves PBAC permissions.
 * Call at the start of every server function that touches protected data.
 *
 * @throws {Error} "UNAUTHORIZED" if JWT is missing or invalid.
 */
export async function requireAuth(): Promise<UserContext> {
	const authClient = getSupabaseAuthClient()
	const {
		data: { user },
		error,
	} = await authClient.auth.getUser()

	if (error || !user) {
		unauthorized()
	}

	// user_permissions vive em access_control (split de schemas por domínio).
	const dataClient = getAccessControlClient()
	const permissions = await resolveUserPermissions(user.id, dataClient)
	return { userId: user.id, permissions }
}
