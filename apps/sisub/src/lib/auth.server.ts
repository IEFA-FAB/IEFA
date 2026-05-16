/**
 * @module auth.server
 * Resolve authenticated UserContext inside server functions.
 * Throws on unauthenticated requests — server fn returns 401.
 */

import { resolveUserPermissions } from "@iefa/pbac"
import type { UserContext } from "@iefa/sisub-domain/types"
import { getSupabaseAuthClient, getSupabaseServerClient } from "@/lib/supabase.server"

export async function requireUserId(): Promise<string> {
	const {
		data: { user },
	} = await getSupabaseAuthClient().auth.getUser()
	if (!user) throw new Error("UNAUTHORIZED")
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
		throw new Error("UNAUTHORIZED")
	}

	const dataClient = getSupabaseServerClient()
	const permissions = await resolveUserPermissions(user.id, dataClient)
	return { userId: user.id, permissions }
}
