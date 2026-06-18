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

/**
 * `sisub.user_data` tem UNIQUE(email) (constraint `user_email_email_key`) além da
 * PK em `id` (FK → auth.users). Um upsert `onConflict: "id"` só reconcilia a PK;
 * se o email já pertence a OUTRA linha (id diferente), o upsert vira INSERT/UPDATE
 * e estoura 23505 no email — foi a origem do
 * `duplicate key value violates unique constraint "user_email_email_key"`.
 */
function isEmailUniqueViolation(error: unknown): boolean {
	const e = error as { code?: string; message?: string }
	return e?.code === "23505" && (e.message?.includes("email") ?? false)
}

/**
 * Upsert idempotente de uma linha de `user_data`, resiliente à colisão de email.
 *
 * Caminho normal: upsert por `id` (cobre "mesmo usuário, atualiza email/nrOrdem").
 *
 * Colisão de email: `auth.users` garante email único entre contas ativas, então a
 * linha conflitante é órfã (auth user removido/recriado mantendo o mesmo email).
 * O usuário autenticado é o dono legítimo do email → removemos a linha órfã e
 * reivindicamos o email para o `id` atual.
 *
 * `nrOrdem` só entra no payload quando informado, para não sobrescrever um valor
 * existente durante um sync que só carrega o email.
 */
async function upsertUserDataReclaimingEmail(client: AnyClient, row: { id: string; email: string; nrOrdem?: string }) {
	const payload = { id: row.id, email: row.email, ...(row.nrOrdem !== undefined ? { nrOrdem: row.nrOrdem } : {}) }

	const first = await client.schema("sisub").from("user_data").upsert(payload, { onConflict: "id" })
	if (!first.error) return
	if (!isEmailUniqueViolation(first.error)) throw new DomainError("UPSERT_FAILED", first.error.message)

	// Email em branco não é reivindicável: o "" é compartilhável entre contas sem
	// email e apagar a linha de outro usuário seria destrutivo. Sync best-effort:
	// não há nada significativo a registrar, então é um no-op.
	if (row.email.trim().length === 0) return

	// Remove a linha órfã que detém o email e reivindica para o usuário atual.
	const orphan = await client.schema("sisub").from("user_data").delete().eq("email", row.email).neq("id", row.id)
	if (orphan.error) throw new DomainError("UPSERT_FAILED", orphan.error.message)

	const retry = await client.schema("sisub").from("user_data").upsert(payload, { onConflict: "id" })
	if (retry.error) {
		// Corrida rara: o email foi recriado por outra requisição entre o delete e o retry.
		if (isEmailUniqueViolation(retry.error)) {
			throw new DomainError("EMAIL_CONFLICT", "Este email já está vinculado a outra conta. Contate o suporte.")
		}
		throw new DomainError("UPSERT_FAILED", retry.error.message)
	}
}

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
	await upsertUserDataReclaimingEmail(client, { id: input.userId, email: input.email, nrOrdem: input.nrOrdem })
}

export async function syncUserEmail(client: AnyClient, input: SyncUserEmail) {
	await upsertUserDataReclaimingEmail(client, { id: input.userId, email: input.email ?? "" })
}
