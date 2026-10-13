/**
 * User profile + military data sync operations (schema sisub on user_data). Drizzle query layer.
 *
 * Auth posture preserved from the original server functions: these take no
 * UserContext — the server fns derive the user id from the session and pass it in
 * (self-only). O vínculo do SARAM é decidido no banco (`saram-link.ts`, 20261003100000): o
 * chamador é sempre o dono da conta, e o número só vale verificado.
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
import { claimSaram, type SaramLinkOutcome } from "./saram-link.ts"

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
 * O formulário de SARAM digitado (perfil e primeiro acesso do sisub).
 *
 * Até 20261003100000 o número digitado era gravado (write-once e exclusivo, mas "quem pede
 * primeiro leva"): nada conferia que o SARAM era da pessoa da conta. Agora a gravação passa por
 * `core.claim_saram` (`saram-link.ts`), a MESMA regra do sucont:
 *
 *   - o número é o candidato único da chave do e-mail institucional → vincula por `email`;
 *   - qualquer outro → vira pedido de vínculo (ou contestação) para o administrador, e a conta
 *     não vê dado militar até a decisão;
 *   - conta com vínculo não troca por aqui (`SARAM_LOCKED`), e conta institucional não tem SARAM.
 *
 * O e-mail da sessão é sincronizado antes (a linha de `core.user_data` nasce aqui no primeiro
 * acesso). Vazio não limpa nada: desvincular é do administrador.
 */
export async function syncUserSaram(db: SisubDb, input: SyncUserSaram & { emailConfirmed: boolean }): Promise<SaramLinkOutcome | null> {
	const requested = input.saram.trim()
	await upsertUserDataReclaimingEmail(db, { id: input.userId, email: input.email })
	if (requested.length === 0) return null
	return claimSaram(db, { userId: input.userId, email: input.email.trim() || null, emailConfirmed: input.emailConfirmed }, requested)
}

export async function syncUserEmail(db: SisubDb, input: SyncUserEmail) {
	await upsertUserDataReclaimingEmail(db, { id: input.userId, email: input.email ?? "" })
}
