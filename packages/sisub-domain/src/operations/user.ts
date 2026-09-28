/**
 * User profile + military data sync operations (schema sisub on user_data). Drizzle query layer.
 *
 * Auth posture preserved from the original server functions: these take no
 * UserContext — the server fns derive the user id from the session and pass it in
 * (self-only). `syncUserSaram` carries its own invariant (write-once + exclusive):
 * the caller is always the account owner, but what it may write is decided here.
 *
 * NOTA: o contrato devolvido é camelCase (`saram`, `nmGuerra`, `dataAtualizacao`…), então usamos
 * `db.select` com aliases explícitos — o mapper `toWire` (camel→snake) corromperia essas chaves.
 *
 * O cadastro militar é lido por `core.military_identity` (SARAM, posto, nome de guerra, OM e data
 * da carga), nunca pelo espelho cru: o CPF e o nome completo não saem do banco para os apps
 * (change `lgpd-military-roster-key`). O perfil do titular recebe só o CPF mascarado, montado no
 * banco (`core.military_masked_cpf`).
 */

import { militaryIdentityInCore, type SisubDb, userDataInCore } from "@iefa/database/drizzle/sisub"
import { and, eq, ne, sql } from "drizzle-orm"
import type { FetchMilitaryData, FetchUserData, FetchUserSaram, SyncUserEmail, SyncUserSaram } from "../schemas/user.ts"
import { DomainError } from "../types/errors.ts"
import { driverFailure, runQuery, unwrapPgError } from "../utils/index.ts"

/**
 * Prefixo do lock consultivo do vínculo do SARAM na versão anterior ao lote 6 da linguagem ubíqua.
 * Uma instância dessa versão pode estar no ar durante o deploy e travaria só esta chave; o código
 * novo trava as duas, então as duas versões se serializam.
 *
 * TODO(2026-09-27): sai no PR do contract do lote 6 (20260927190000), quando só o código novo roda.
 */
const LEGACY_SARAM_LOCK_PREFIX = "nr-ordem:"

/**
 * `sisub.user_data` tem UNIQUE(email) (constraint `user_data_email_key`) além da
 * PK em `id` (FK → auth.users). Um upsert por `id` só reconcilia a PK; se o email
 * já pertence a OUTRA linha (id diferente), estoura 23505 no email — origem do
 * `duplicate key value violates unique constraint "user_data_email_key"`.
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
 * Caminho normal: upsert por `id` (cobre "mesmo usuário, atualiza email/saram").
 *
 * Colisão de email: `auth.users` garante email único entre contas ativas, então a
 * linha conflitante é órfã (auth user removido/recriado mantendo o mesmo email).
 * O usuário autenticado é o dono legítimo do email → removemos a linha órfã e
 * reivindicamos o email para o `id` atual.
 *
 * `saram` só entra no payload quando informado, para não sobrescrever um valor
 * existente durante um sync que só carrega o email.
 */
async function upsertUserDataReclaimingEmail(db: SisubDb, row: { id: string; email: string; saram?: string | null }) {
	const values = { id: row.id, email: row.email, ...(row.saram !== undefined ? { saram: row.saram } : {}) }
	const set = { email: row.email, ...(row.saram !== undefined ? { saram: row.saram } : {}) }
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
				saram: userDataInCore.saram,
				created_at: userDataInCore.createdAt,
				default_mess_hall_id: userDataInCore.defaultMessHallId,
			})
			.from(userDataInCore)
			.where(eq(userDataInCore.id, input.userId))
			.limit(1)
	)
	return rows[0] ?? null
}

/** Identificação militar do SARAM; o cadastro mais recente vence. Sem CPF e sem nome completo. */
export async function fetchMilitaryData(db: SisubDb, input: FetchMilitaryData) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				saram: militaryIdentityInCore.saram,
				nmGuerra: militaryIdentityInCore.nomeGuerra,
				sgPosto: militaryIdentityInCore.posto,
				sgOrg: militaryIdentityInCore.sgOrg,
				dataAtualizacao: militaryIdentityInCore.dataAtualizacao,
			})
			.from(militaryIdentityInCore)
			.where(eq(militaryIdentityInCore.saram, input.saram))
			.orderBy(sql`${militaryIdentityInCore.dataAtualizacao} desc nulls last`)
			.limit(1)
	)
	return rows[0] ?? null
}

/**
 * CPF do SARAM mascarado no padrão gov.br (`***.456.789-**`), para o perfil do PRÓPRIO titular:
 * quem chama passa o SARAM da sessão, nunca o do payload. A máscara é montada no banco
 * (`core.military_masked_cpf`), e o documento inteiro não chega ao servidor de app. `null` quando o
 * SARAM não está no espelho ou o CPF não tem 11 dígitos.
 */
export async function fetchMaskedCpf(db: SisubDb, input: FetchMilitaryData): Promise<string | null> {
	const rows = (await runQuery("FETCH_FAILED", () => db.execute(sql`select core.military_masked_cpf(${input.saram}) as masked_cpf`))) as unknown as Array<{
		masked_cpf: string | null
	}>
	return rows[0]?.masked_cpf ?? null
}

export async function fetchUserSaram(db: SisubDb, input: FetchUserSaram): Promise<string | null> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ saram: userDataInCore.saram }).from(userDataInCore).where(eq(userDataInCore.id, input.userId)).limit(1)
	)
	const value = rows[0]?.saram
	const asString = value != null ? String(value) : null
	return asString && asString.trim().length > 0 ? asString : null
}

/**
 * Vincula o SARAM à conta — pelo próprio usuário, e uma vez só.
 *
 * O vínculo decide de quem são os dados militares que a conta enxerga (nome, posto, OM).
 * Livre para reescrever, ele virava enumeração: o usuário gravava o saram de outra
 * pessoa, lia os dados dela, trocava de novo — um por um, sem limite (LGPD). Por isso:
 *
 *   - write-once: um saram que JÁ LOCALIZA um cadastro militar não muda por aqui — só o
 *     mesmo valor passa (reenvio do formulário é idempotente). Trocar ou limpar exige o
 *     administrador; limpar e regravar seria a mesma troca em dois passos. O saram que
 *     não localiza cadastro nenhum (erro de digitação) segue corrigível: ele não revelou
 *     nada, e travá-lo deixaria a conta sem saída;
 *   - exclusivo: um saram já vinculado a OUTRA conta é recusado. Sem isso, a segunda
 *     conta leria os dados da primeira pessoa.
 *
 * As duas checagens são leitura-antes-da-escrita; duas contas disputando o mesmo saram no
 * mesmo instante escapariam da segunda — o índice único parcial da migration
 * `20260921160410` (`user_data_saram_uniq` desde o lote 6, onde existe) fecha essa corrida no
 * banco.
 */
export async function syncUserSaram(db: SisubDb, input: SyncUserSaram) {
	const requested = input.saram.trim()

	// Checar e gravar numa transação só, com lock por saram: duas contas reivindicando o
	// MESMO número ao mesmo tempo passavam as duas pela checagem de "já vinculado" antes de
	// qualquer uma gravar. O índice único que fecharia isso no banco não existe enquanto
	// houver duplicata antiga em `core.user_data` (migration 20260921160410), então a
	// serialização fica aqui — e vale com ou sem o índice.
	await db.transaction(async (tx) => {
		if (requested.length > 0) {
			// A chave antiga primeiro, sempre nesta ordem: serializa com a versão anterior ao lote 6
			// enquanto ela puder estar no ar (deploy), sem ciclo de espera.
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${LEGACY_SARAM_LOCK_PREFIX}${requested}`}))`)
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`saram:${requested}`}))`)
		}

		const current = await fetchUserSaram(tx as unknown as SisubDb, { userId: input.userId })
		const changes = (current ?? "") !== requested

		if (changes && current != null && (await fetchMilitaryData(tx as unknown as SisubDb, { saram: current })) != null) {
			throw new DomainError(
				"SARAM_LOCKED",
				"O SARAM já está vinculado à sua conta e não pode ser alterado por aqui. Para corrigi-lo, procure o administrador do sistema."
			)
		}

		if (changes && requested.length > 0) {
			const taken = await runQuery("FETCH_FAILED", () =>
				tx
					.select({ id: userDataInCore.id })
					.from(userDataInCore)
					.where(and(eq(userDataInCore.saram, requested), ne(userDataInCore.id, input.userId)))
					.limit(1)
			)
			if (taken.length > 0) {
				throw new DomainError("SARAM_TAKEN", "Este SARAM já está vinculado a outra conta. Se ele é seu, procure o administrador do sistema.")
			}
		}

		// Sem mudança, só o email é sincronizado — o saram nem entra no payload. Vazio grava
		// `null`: string em branco não é um vínculo.
		await upsertUserDataReclaimingEmail(tx as unknown as SisubDb, {
			id: input.userId,
			email: input.email,
			...(changes ? { saram: requested.length > 0 ? requested : null } : {}),
		})
	})
}

export async function syncUserEmail(db: SisubDb, input: SyncUserEmail) {
	await upsertUserDataReclaimingEmail(db, { id: input.userId, email: input.email ?? "" })
}
