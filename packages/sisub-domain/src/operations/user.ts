/**
 * User profile + military data sync operations (schema sisub on user_data). Drizzle query layer.
 *
 * Auth posture preserved from the original server functions: these are
 * UNAUTHENTICATED entrypoints — they run during the login/profile-bootstrap
 * flow, so they take no UserContext and add no guard.
 *
 * NOTA: `user_data`/`user_military_data` têm colunas camelCase no DB (`nrOrdem`,
 * `nrCpf`, `dataAtualizacao`, …). O contrato é camelCase, então usamos `db.select`
 * com aliases explícitos — o mapper `toWire` (camel→snake) corromperia essas chaves.
 */

import { type SisubDb, userDataInSisub, userMilitaryDataInSisub } from "@iefa/database/drizzle/sisub"
import { and, eq, ne, sql } from "drizzle-orm"
import type { FetchMilitaryData, FetchUserData, FetchUserNrOrdem, SyncUserEmail, SyncUserNrOrdem } from "../schemas/user.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"

/**
 * `sisub.user_data` tem UNIQUE(email) (constraint `user_email_email_key`) além da
 * PK em `id` (FK → auth.users). Um upsert por `id` só reconcilia a PK; se o email
 * já pertence a OUTRA linha (id diferente), estoura 23505 no email — origem do
 * `duplicate key value violates unique constraint "user_email_email_key"`.
 *
 * postgres.js lança um erro com `.code`/`.constraint_name` (≠ do `{ error }` do supabase-js).
 */
function isEmailUniqueViolation(error: unknown): boolean {
	const e = error as { code?: string; constraint_name?: string; message?: string }
	return e?.code === "23505" && ((e.constraint_name?.includes("email") ?? false) || (e.message?.includes("email") ?? false))
}

function errMsg(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
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
async function upsertUserDataReclaimingEmail(db: SisubDb, row: { id: string; email: string; nrOrdem?: string }) {
	const values = { id: row.id, email: row.email, ...(row.nrOrdem !== undefined ? { nrOrdem: row.nrOrdem } : {}) }
	const set = { email: row.email, ...(row.nrOrdem !== undefined ? { nrOrdem: row.nrOrdem } : {}) }
	// Cru (sem runQuery): precisamos inspecionar o 23505 antes de embrulhar em DomainError.
	const upsert = () => db.insert(userDataInSisub).values(values).onConflictDoUpdate({ target: userDataInSisub.id, set })

	try {
		await upsert()
		return
	} catch (e) {
		if (!isEmailUniqueViolation(e)) throw new DomainError("UPSERT_FAILED", errMsg(e))
	}

	// Email em branco não é reivindicável: o "" é compartilhável entre contas sem
	// email e apagar a linha de outro usuário seria destrutivo. Sync best-effort: no-op.
	if (row.email.trim().length === 0) return

	// Remove a linha órfã que detém o email e reivindica para o usuário atual.
	await runQuery("UPSERT_FAILED", () => db.delete(userDataInSisub).where(and(eq(userDataInSisub.email, row.email), ne(userDataInSisub.id, row.id))))

	try {
		await upsert()
	} catch (e) {
		// Corrida rara: o email foi recriado por outra requisição entre o delete e o retry.
		if (isEmailUniqueViolation(e)) throw new DomainError("EMAIL_CONFLICT", "Este email já está vinculado a outra conta. Contate o suporte.")
		throw new DomainError("UPSERT_FAILED", errMsg(e))
	}
}

export async function fetchSisubUserData(db: SisubDb, input: FetchUserData) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: userDataInSisub.id,
				email: userDataInSisub.email,
				nrOrdem: userDataInSisub.nrOrdem,
				created_at: userDataInSisub.createdAt,
				default_mess_hall_id: userDataInSisub.defaultMessHallId,
			})
			.from(userDataInSisub)
			.where(eq(userDataInSisub.id, input.userId))
			.limit(1)
	)
	return rows[0] ?? null
}

export async function fetchMilitaryData(db: SisubDb, input: FetchMilitaryData) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				nrOrdem: userMilitaryDataInSisub.nrOrdem,
				nrCpf: userMilitaryDataInSisub.nrCpf,
				nmGuerra: userMilitaryDataInSisub.nmGuerra,
				nmPessoa: userMilitaryDataInSisub.nmPessoa,
				sgPosto: userMilitaryDataInSisub.sgPosto,
				sgOrg: userMilitaryDataInSisub.sgOrg,
				dataAtualizacao: userMilitaryDataInSisub.dataAtualizacao,
			})
			.from(userMilitaryDataInSisub)
			.where(eq(userMilitaryDataInSisub.nrOrdem, input.nrOrdem))
			.orderBy(sql`${userMilitaryDataInSisub.dataAtualizacao} desc nulls last`)
			.limit(1)
	)
	return rows[0] ?? null
}

export async function fetchUserNrOrdem(db: SisubDb, input: FetchUserNrOrdem): Promise<string | null> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ nrOrdem: userDataInSisub.nrOrdem }).from(userDataInSisub).where(eq(userDataInSisub.id, input.userId)).limit(1)
	)
	const value = rows[0]?.nrOrdem
	const asString = value != null ? String(value) : null
	return asString && asString.trim().length > 0 ? asString : null
}

export async function syncUserNrOrdem(db: SisubDb, input: SyncUserNrOrdem) {
	await upsertUserDataReclaimingEmail(db, { id: input.userId, email: input.email, nrOrdem: input.nrOrdem })
}

export async function syncUserEmail(db: SisubDb, input: SyncUserEmail) {
	await upsertUserDataReclaimingEmail(db, { id: input.userId, email: input.email ?? "" })
}
