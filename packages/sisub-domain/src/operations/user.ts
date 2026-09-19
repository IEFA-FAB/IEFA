/**
 * User profile + military data sync operations (schema sisub on user_data). Drizzle query layer.
 *
 * Auth posture preserved from the original server functions: these take no
 * UserContext — the server fns derive the user id from the session and pass it in
 * (self-only). `syncUserNrOrdem` carries its own invariant (write-once + exclusive):
 * the caller is always the account owner, but what it may write is decided here.
 *
 * NOTA: `user_data`/`user_military_data` têm colunas camelCase no DB (`nrOrdem`,
 * `nrCpf`, `dataAtualizacao`, …). O contrato é camelCase, então usamos `db.select`
 * com aliases explícitos — o mapper `toWire` (camel→snake) corromperia essas chaves.
 */

import { type SisubDb, userDataInCore, userMilitaryDataInCore } from "@iefa/database/drizzle/sisub"
import { and, eq, ne, sql } from "drizzle-orm"
import type { FetchMilitaryData, FetchUserData, FetchUserNrOrdem, SyncUserEmail, SyncUserNrOrdem } from "../schemas/user.ts"
import { DomainError } from "../types/errors.ts"
import { driverFailure, runQuery, unwrapPgError } from "../utils/index.ts"

/**
 * `sisub.user_data` tem UNIQUE(email) (constraint `user_email_email_key`) além da
 * PK em `id` (FK → auth.users). Um upsert por `id` só reconcilia a PK; se o email
 * já pertence a OUTRA linha (id diferente), estoura 23505 no email — origem do
 * `duplicate key value violates unique constraint "user_email_email_key"`.
 *
 * postgres.js lança um erro com `.code`/`.constraint_name` (≠ do `{ error }` do supabase-js).
 */
function isEmailUniqueViolation(error: unknown): boolean {
	// O código real fica em .cause (DrizzleQueryError) — unwrapPgError o resgata.
	const e = unwrapPgError(error)
	return e?.code === "23505" && ((e.constraint_name?.includes("email") ?? false) || (e.message?.includes("email") ?? false))
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
async function upsertUserDataReclaimingEmail(db: SisubDb, row: { id: string; email: string; nrOrdem?: string | null }) {
	const values = { id: row.id, email: row.email, ...(row.nrOrdem !== undefined ? { nrOrdem: row.nrOrdem } : {}) }
	const set = { email: row.email, ...(row.nrOrdem !== undefined ? { nrOrdem: row.nrOrdem } : {}) }
	// Cru (sem runQuery): precisamos inspecionar o 23505 antes de embrulhar em DomainError.
	const upsert = () => db.insert(userDataInCore).values(values).onConflictDoUpdate({ target: userDataInCore.id, set })

	try {
		await upsert()
		return
	} catch (e) {
		// `describeDriverError` e não `e.message`: este sync é best-effort e roda 1x por
		// sessão, então a mensagem é o ÚNICO sinal quando falha. Crua, ela seria o SQL do
		// upsert, com a causa escondida em `.cause`.
		if (!isEmailUniqueViolation(e)) throw driverFailure("UPSERT_FAILED", e)
	}

	// Email em branco não é reivindicável: o "" é compartilhável entre contas sem
	// email e apagar a linha de outro usuário seria destrutivo. Sync best-effort: no-op.
	if (row.email.trim().length === 0) return

	// Remove a linha órfã que detém o email e reivindica para o usuário atual.
	await runQuery("UPSERT_FAILED", () => db.delete(userDataInCore).where(and(eq(userDataInCore.email, row.email), ne(userDataInCore.id, row.id))))

	try {
		await upsert()
	} catch (e) {
		// Corrida rara: o email foi recriado por outra requisição entre o delete e o retry.
		if (isEmailUniqueViolation(e)) throw new DomainError("EMAIL_CONFLICT", "Este email já está vinculado a outra conta. Contate o suporte.")
		throw driverFailure("UPSERT_FAILED", e)
	}
}

export async function fetchSisubUserData(db: SisubDb, input: FetchUserData) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: userDataInCore.id,
				email: userDataInCore.email,
				nrOrdem: userDataInCore.nrOrdem,
				created_at: userDataInCore.createdAt,
				default_mess_hall_id: userDataInCore.defaultMessHallId,
			})
			.from(userDataInCore)
			.where(eq(userDataInCore.id, input.userId))
			.limit(1)
	)
	return rows[0] ?? null
}

export async function fetchMilitaryData(db: SisubDb, input: FetchMilitaryData) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				nrOrdem: userMilitaryDataInCore.nrOrdem,
				nrCpf: userMilitaryDataInCore.nrCpf,
				nmGuerra: userMilitaryDataInCore.nmGuerra,
				nmPessoa: userMilitaryDataInCore.nmPessoa,
				sgPosto: userMilitaryDataInCore.sgPosto,
				sgOrg: userMilitaryDataInCore.sgOrg,
				dataAtualizacao: userMilitaryDataInCore.dataAtualizacao,
			})
			.from(userMilitaryDataInCore)
			.where(eq(userMilitaryDataInCore.nrOrdem, input.nrOrdem))
			.orderBy(sql`${userMilitaryDataInCore.dataAtualizacao} desc nulls last`)
			.limit(1)
	)
	return rows[0] ?? null
}

export async function fetchUserNrOrdem(db: SisubDb, input: FetchUserNrOrdem): Promise<string | null> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ nrOrdem: userDataInCore.nrOrdem }).from(userDataInCore).where(eq(userDataInCore.id, input.userId)).limit(1)
	)
	const value = rows[0]?.nrOrdem
	const asString = value != null ? String(value) : null
	return asString && asString.trim().length > 0 ? asString : null
}

/**
 * Vincula o Nr. de Ordem à conta — pelo próprio usuário, e uma vez só.
 *
 * O vínculo decide de quem são os dados militares que a conta enxerga (nome, posto, OM).
 * Livre para reescrever, ele virava enumeração: o usuário gravava o nrOrdem de outra
 * pessoa, lia os dados dela, trocava de novo — um por um, sem limite (LGPD). Por isso:
 *
 *   - write-once: um nrOrdem que JÁ LOCALIZA um cadastro militar não muda por aqui — só o
 *     mesmo valor passa (reenvio do formulário é idempotente). Trocar ou limpar exige o
 *     administrador; limpar e regravar seria a mesma troca em dois passos. O nrOrdem que
 *     não localiza cadastro nenhum (erro de digitação) segue corrigível: ele não revelou
 *     nada, e travá-lo deixaria a conta sem saída;
 *   - exclusivo: um nrOrdem já vinculado a OUTRA conta é recusado. Sem isso, a segunda
 *     conta leria os dados da primeira pessoa.
 *
 * As duas checagens são leitura-antes-da-escrita; duas contas disputando o mesmo nrOrdem no
 * mesmo instante escapariam da segunda — o índice único parcial da migration
 * `20260921160410` fecha essa corrida no banco.
 */
export async function syncUserNrOrdem(db: SisubDb, input: SyncUserNrOrdem) {
	const requested = input.nrOrdem.trim()

	// Checar e gravar numa transação só, com lock por nrOrdem: duas contas reivindicando o
	// MESMO número ao mesmo tempo passavam as duas pela checagem de "já vinculado" antes de
	// qualquer uma gravar. O índice único que fecharia isso no banco não existe enquanto
	// houver duplicata antiga em `core.user_data` (migration 20260921160410), então a
	// serialização fica aqui — e vale com ou sem o índice.
	await db.transaction(async (tx) => {
		if (requested.length > 0) {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`nr-ordem:${requested}`}))`)
		}

		const current = await fetchUserNrOrdem(tx as unknown as SisubDb, { userId: input.userId })
		const changes = (current ?? "") !== requested

		if (changes && current != null && (await fetchMilitaryData(tx as unknown as SisubDb, { nrOrdem: current })) != null) {
			throw new DomainError(
				"NR_ORDEM_LOCKED",
				"O Nr. de Ordem já está vinculado à sua conta e não pode ser alterado por aqui. Para corrigi-lo, procure o administrador do sistema."
			)
		}

		if (changes && requested.length > 0) {
			const taken = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: userDataInCore.id })
					.from(userDataInCore)
					.where(and(eq(userDataInCore.nrOrdem, requested), ne(userDataInCore.id, input.userId)))
					.limit(1)
			)
			if (taken.length > 0) {
				throw new DomainError("NR_ORDEM_TAKEN", "Este Nr. de Ordem já está vinculado a outra conta. Se ele é seu, procure o administrador do sistema.")
			}
		}

		// Sem mudança, só o email é sincronizado — o nrOrdem nem entra no payload. Vazio grava
		// `null`: string em branco não é um vínculo.
		await upsertUserDataReclaimingEmail(tx as unknown as SisubDb, {
			id: input.userId,
			email: input.email,
			...(changes ? { nrOrdem: requested.length > 0 ? requested : null } : {}),
		})
	})
}

export async function syncUserEmail(db: SisubDb, input: SyncUserEmail) {
	await upsertUserDataReclaimingEmail(db, { id: input.userId, email: input.email ?? "" })
}
