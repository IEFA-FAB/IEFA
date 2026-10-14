/**
 * Arranchamento do comensal: ele declara que vai comer (`will_eat`) numa data, refeição e
 * refeitório (`kitchen.arranchamento`). Camada Drizzle.
 *
 * Auth posture preserved from the original server functions, with no
 * module-level PBAC guard. Mutations are authenticated and act on the caller's
 * own identity (ctx.userId); reads are unauthenticated (matching the original)
 * and take an explicit userId.
 */

import { arranchamentoInKitchen, messHallsInKitchen, type SisubDb, userDataInCore } from "@iefa/database/drizzle/sisub"
import { and, asc, eq, gte, lte } from "drizzle-orm"
import type { DeleteArranchamento, GetUserDefaultMessHall, ListArranchamentos, PersistDefaultMessHall, UpsertArranchamento } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import type { DomainError } from "../types/errors.ts"
import { driverFailure, retryOnceOnTransientConnectionError, runQuery, unwrapPgError } from "../utils/index.ts"
import { assertAccountCanEat, toSaramDomainError } from "./saram-link.ts"

type ArranchamentoListItem = { date: string; meal: string; will_eat: boolean; mess_halls: { code: string | null } | null }

// Join explícito com o refeitório (não relational query): o contrato da tela é `mess_halls(code)`.
export async function listArranchamentos(db: SisubDb, input: ListArranchamentos): Promise<ArranchamentoListItem[]> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				date: arranchamentoInKitchen.date,
				meal: arranchamentoInKitchen.meal,
				will_eat: arranchamentoInKitchen.willEat,
				mess_hall_id: messHallsInKitchen.id,
				code: messHallsInKitchen.code,
			})
			.from(arranchamentoInKitchen)
			.leftJoin(messHallsInKitchen, eq(messHallsInKitchen.id, arranchamentoInKitchen.messHallId))
			.where(
				and(eq(arranchamentoInKitchen.userId, input.userId), gte(arranchamentoInKitchen.date, input.startDate), lte(arranchamentoInKitchen.date, input.endDate))
			)
			.orderBy(asc(arranchamentoInKitchen.date))
	)
	return rows.map((r) => ({ date: r.date, meal: r.meal, will_eat: r.will_eat, mess_halls: r.mess_hall_id === null ? null : { code: r.code } }))
}

export async function getUserDefaultMessHall(db: SisubDb, input: GetUserDefaultMessHall) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.select({ default_mess_hall_id: userDataInCore.defaultMessHallId }).from(userDataInCore).where(eq(userDataInCore.id, input.userId)).limit(1)
	)
	return rows[0] ?? null
}

export async function persistDefaultMessHall(db: SisubDb, ctx: UserContext, input: PersistDefaultMessHall) {
	await runQuery("UPSERT_FAILED", () =>
		db
			.insert(userDataInCore)
			.values({ id: ctx.userId, defaultMessHallId: input.messHallId, email: input.email })
			.onConflictDoUpdate({ target: userDataInCore.id, set: { defaultMessHallId: input.messHallId, email: input.email } })
	)
}

export async function upsertArranchamento(db: SisubDb, ctx: UserContext, input: UpsertArranchamento) {
	// Conta institucional (conta de seção) não se arrancha; desmarcar continua livre. O trigger
	// `refuse_institutional_account_meal` (20261003100000) é a garantia; aqui a recusa sai com
	// a mensagem certa.
	if (input.willEat) await assertAccountCanEat(db, ctx.userId)
	const row = { date: input.date, userId: ctx.userId, meal: input.meal, willEat: input.willEat, messHallId: input.messHallId }

	// O único (user_id, date, meal) é a única unicidade de negócio da tabela; a PK `id` não entra no
	// insert. Por isso o upsert é idempotente e aguenta repetir uma vez numa queda de conexão; erro
	// de dado (FK, check) ou a recusa do trigger propaga na primeira.
	await runQuery(
		"UPSERT_FAILED",
		() =>
			retryOnceOnTransientConnectionError(() =>
				db
					.insert(arranchamentoInKitchen)
					.values(row)
					.onConflictDoUpdate({
						target: [arranchamentoInKitchen.userId, arranchamentoInKitchen.date, arranchamentoInKitchen.meal],
						set: { willEat: input.willEat, messHallId: input.messHallId },
					})
			),
		{ mapError: toUpsertError }
	)
}

const SAVE_FAILED_MESSAGE = "Não foi possível salvar o arranchamento. Tente novamente."

/**
 * A recusa do trigger `refuse_institutional_account_meal` (corrida: a conta virou institucional
 * depois do `assertAccountCanEat`) sai com a mensagem dela; o resto, com a de salvar.
 */
function toUpsertError(error: unknown): DomainError {
	if (unwrapPgError(error).message === "ACCOUNT_INSTITUTIONAL_NO_MEALS") return toSaramDomainError(error)
	return driverFailure("UPSERT_FAILED", error, "upsert de kitchen.arranchamento", SAVE_FAILED_MESSAGE)
}

export async function deleteArranchamento(db: SisubDb, ctx: UserContext, input: DeleteArranchamento) {
	await runQuery("DELETE_FAILED", () =>
		db
			.delete(arranchamentoInKitchen)
			.where(and(eq(arranchamentoInKitchen.userId, ctx.userId), eq(arranchamentoInKitchen.date, input.date), eq(arranchamentoInKitchen.meal, input.meal)))
	)
}
