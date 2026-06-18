/**
 * User profile + military data sync operations (schema sisub on user_data).
 *
 * Auth posture preserved from the original server functions: these are
 * UNAUTHENTICATED entrypoints — they run during the login/profile-bootstrap
 * flow, so they take no UserContext and add no guard.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { FetchMilitaryData, FetchUserData, FetchUserNrOrdem, SyncUserEmail, SyncUserNrOrdem } from "../schemas/user.ts"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function fetchSisubUserData(client: AnyClient, input: FetchUserData) {
	const { data, error } = await client
		.schema("sisub")
		.from("user_data")
		.select("id,email,nrOrdem,created_at,default_mess_hall_id")
		.eq("id", input.userId)
		.maybeSingle()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data
}

export async function fetchMilitaryData(client: AnyClient, input: FetchMilitaryData) {
	const { data, error } = await client
		.from("user_military_data")
		.select("nrOrdem, nrCpf, nmGuerra, nmPessoa, sgPosto, sgOrg, dataAtualizacao")
		.eq("nrOrdem", input.nrOrdem)
		.order("dataAtualizacao", { ascending: false, nullsFirst: false })
		.limit(1)
		.maybeSingle()
	if (error) throw new DomainError("FETCH_FAILED", error.message)
	return data ?? null
}

export async function fetchUserNrOrdem(client: AnyClient, input: FetchUserNrOrdem): Promise<string | null> {
	const { data, error } = await client.schema("sisub").from("user_data").select("nrOrdem").eq("id", input.userId).maybeSingle()
	if (error) throw new DomainError("FETCH_FAILED", error.message)

	const value = data?.nrOrdem as string | number | null | undefined
	const asString = value != null ? String(value) : null
	return asString && asString.trim().length > 0 ? asString : null
}

export async function syncUserNrOrdem(client: AnyClient, input: SyncUserNrOrdem) {
	const { error } = await client
		.schema("sisub")
		.from("user_data")
		.upsert({ id: input.userId, email: input.email, nrOrdem: input.nrOrdem }, { onConflict: "id" })
	if (error) throw new DomainError("UPSERT_FAILED", error.message)
}

export async function syncUserEmail(client: AnyClient, input: SyncUserEmail) {
	const { error } = await client
		.schema("sisub")
		.from("user_data")
		.upsert({ id: input.userId, email: input.email ?? "" }, { onConflict: "id" })
	if (error) throw new DomainError("UPSERT_FAILED", error.message)
}
