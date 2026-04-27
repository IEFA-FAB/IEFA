import type { SupabaseClient } from "@supabase/supabase-js"
import { DomainError } from "../types/errors.ts"

// biome-ignore lint/suspicious/noExplicitAny: generic Supabase client
type AnyClient = SupabaseClient<any, any, any>

export async function softDelete(client: AnyClient, table: string, id: string): Promise<void> {
	const { error } = await client.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id)
	if (error) throw new DomainError("DELETE_FAILED", error.message)
}

export async function restore(client: AnyClient, table: string, id: string): Promise<void> {
	const { error } = await client.from(table).update({ deleted_at: null }).eq("id", id)
	if (error) throw new DomainError("RESTORE_FAILED", error.message)
}
