/**
 * Fiscal presence operations: read presences + arranchamentos, insert/delete presence. Drizzle query layer.
 *
 * Auth: as leituras (listPresences, listArranchamentoMap) seguem sem guard, como antes. Nas escritas,
 * marcar a PRÓPRIA presença basta estar autenticado; mexer na de outro exige `messhall:2` no
 * refeitório — em `deletePresence` o refeitório vem da linha, que é o único dado confiável.
 *
 * insertPresence intentionally throws a code-bearing Error (not a DomainError)
 * so callers can detect PG unique violations (code "23505"). The sisub server fn
 * turns that code into a `{ status: "duplicate" }` result: the server fn transport
 * only carries an error's message, so the code never reaches the browser.
 */

import { arranchamentoInKitchen, mealPresencesInKitchen, messHallsInKitchen, type SisubDb, vMealPresencesWithUserInKitchen } from "@iefa/database/drizzle/sisub"
import { and, desc, eq, inArray } from "drizzle-orm"
import { requireMessHall } from "../guards/require-permission.ts"
import type { InsertPresence, ListArranchamentoMap, ListPresences } from "../schemas/meal-ops.ts"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import { runQuery, unwrapPgError } from "../utils/index.ts"
import { toSaramDomainError } from "./saram-link.ts"

export async function listPresences(db: SisubDb, input: ListPresences) {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({
				id: vMealPresencesWithUserInKitchen.id,
				user_id: vMealPresencesWithUserInKitchen.userId,
				date: vMealPresencesWithUserInKitchen.date,
				meal: vMealPresencesWithUserInKitchen.meal,
				created_at: vMealPresencesWithUserInKitchen.createdAt,
				mess_hall_id: vMealPresencesWithUserInKitchen.messHallId,
				display_name: vMealPresencesWithUserInKitchen.displayName,
			})
			.from(vMealPresencesWithUserInKitchen)
			.where(
				and(
					eq(vMealPresencesWithUserInKitchen.date, input.date),
					eq(vMealPresencesWithUserInKitchen.meal, input.meal),
					eq(vMealPresencesWithUserInKitchen.messHallId, input.messHallId)
				)
			)
			.orderBy(desc(vMealPresencesWithUserInKitchen.createdAt))
	)

	// Colunas da view são tipadas nullable pelo Drizzle, mas vêm de meal_presences NOT NULL
	// (id/user_id/date/meal/created_at/mess_hall_id) — coage p/ o shape não-nulo do contrato.
	return rows.map((r) => ({
		id: r.id as string,
		user_id: r.user_id as string,
		date: r.date as string,
		meal: r.meal as string,
		created_at: r.created_at as string,
		mess_hall_id: r.mess_hall_id as number,
		updated_at: null,
		unidade: String(input.messHallId),
		display_name: r.display_name ?? null,
	}))
}

export async function listArranchamentoMap(db: SisubDb, input: ListArranchamentoMap): Promise<Record<string, boolean>> {
	if (input.userIds.length === 0) return {}

	let rows: Array<{ user_id: string; will_eat: boolean | null }>
	try {
		rows = await db
			.select({ user_id: arranchamentoInKitchen.userId, will_eat: arranchamentoInKitchen.willEat })
			.from(arranchamentoInKitchen)
			.where(
				and(
					eq(arranchamentoInKitchen.date, input.date),
					eq(arranchamentoInKitchen.meal, input.meal),
					eq(arranchamentoInKitchen.messHallId, input.messHallId),
					inArray(arranchamentoInKitchen.userId, input.userIds)
				)
			)
	} catch {
		// Non-throwing by design: caller treats a missing arranchamento as unknown.
		return {}
	}

	const map: Record<string, boolean> = {}
	for (const row of rows) {
		map[row.user_id] = Boolean(row.will_eat)
	}
	return map
}

export async function insertPresence(db: SisubDb, ctx: UserContext, input: InsertPresence) {
	// Dois chamadores legítimos: o Fiscal de rancho registrando terceiros no refeitório, e o comensal
	// marcando a si mesmo no self check-in. Só o primeiro precisa de permissão no refeitório —
	// exigir `messhall:2` de todo mundo quebraria o check-in do próprio comensal.
	if (input.user_id !== ctx.userId) requireMessHall(ctx, 2, input.messHallId)

	try {
		await db.insert(mealPresencesInKitchen).values({ userId: input.user_id, date: input.date, meal: input.meal, messHallId: input.messHallId })
	} catch (e) {
		// Preserva o código de erro do PG (ex.: "23505" duplicate) para tratamento no caller.
		// O código real fica em .cause (DrizzleQueryError) — unwrapPgError o resgata.
		const err = unwrapPgError(e)
		// Conta institucional não registra presença própria: o trigger de 20261003100000 recusa, e
		// aqui a recusa vira mensagem (sem SELECT antes: o check-in em fila é caminho quente).
		if (err.message === "ACCOUNT_INSTITUTIONAL_NO_MEALS") throw toSaramDomainError(e)
		throw Object.assign(new Error(err.message ?? "insert presence failed"), { code: err.code })
	}
}

/**
 * Onde está a presença que já existe para a pessoa naquela refeição. A unicidade de
 * `meal_presences` é `(user_id, date, meal)`, sem o refeitório: o 23505 de `insertPresence`
 * pode vir de presença em OUTRO refeitório, e a tela precisa dizer qual.
 *
 * Sem guard próprio: só é chamada depois de um 23505 de `insertPresence`, que já exigiu do
 * chamador ser a própria pessoa ou ter `messhall:2` no refeitório do insert. Expõe só o
 * refeitório da presença daquela pessoa naquela refeição.
 */
export async function findMealPresenceMessHall(
	db: SisubDb,
	input: { userId: string; date: string; meal: string }
): Promise<{ messHallId: number; messHallName: string } | null> {
	const [row] = await runQuery("FETCH_FAILED", () =>
		db
			.select({ messHallId: mealPresencesInKitchen.messHallId, code: messHallsInKitchen.code, displayName: messHallsInKitchen.displayName })
			.from(mealPresencesInKitchen)
			.innerJoin(messHallsInKitchen, eq(messHallsInKitchen.id, mealPresencesInKitchen.messHallId))
			.where(and(eq(mealPresencesInKitchen.userId, input.userId), eq(mealPresencesInKitchen.date, input.date), eq(mealPresencesInKitchen.meal, input.meal)))
			.limit(1)
	)
	if (!row) return null
	return { messHallId: row.messHallId, messHallName: row.displayName?.trim() || row.code }
}

export async function deletePresence(db: SisubDb, ctx: UserContext, input: { id: string }) {
	// A entrada traz só o id, então o refeitório dono vem da LINHA — sem isso qualquer
	// autenticado apagava a presença de qualquer pessoa em qualquer refeitório.
	const [row] = await runQuery("FETCH_FAILED", () =>
		db.select({ messHallId: mealPresencesInKitchen.messHallId }).from(mealPresencesInKitchen).where(eq(mealPresencesInKitchen.id, input.id)).limit(1)
	)
	if (!row?.messHallId) throw new NotFoundError("meal_presence", input.id)
	requireMessHall(ctx, 2, row.messHallId)

	await runQuery("DELETE_FAILED", () => db.delete(mealPresencesInKitchen).where(eq(mealPresencesInKitchen.id, input.id)))
}
