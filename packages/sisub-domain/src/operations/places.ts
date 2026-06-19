/**
 * Org-hierarchy + mess-hall operations. Drizzle query layer.
 *
 * Auth posture preserved: authenticated entrypoints (caller runs requireAuth())
 * with no module-level PBAC guard. `ctx` accepted for signature uniformity.
 *
 * `units`/`mess_halls` têm PK bigserial → o id volta BigInt no Drizzle; `toWire`
 * coage para number (contrato), e updates por id usam `BigInt(input.id)`.
 */

import {
	kitchenInSisub,
	mealForecastsInSisub,
	messHallsInSisub,
	otherPresencesInSisub,
	type SisubDb,
	unitsInSisub,
	vUserIdentityInSisub,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, count, eq } from "drizzle-orm"
import type {
	AddOtherPresence,
	ApplyPlacesDiff,
	FetchMessHallByCode,
	FetchOtherPresencesCount,
	FetchUserMealForecast,
	ResolveDisplayName,
	UpdateEntityInput,
} from "../schemas/places.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery, toColumns, toWire } from "../utils/index.ts"

type Unit = Tables<"units">
type Kitchen = Tables<"kitchen">
type MessHall = Tables<"mess_halls">

// ─── Reference reads ────────────────────────────────────────────────────────

export async function listUnits(db: SisubDb, _ctx: UserContext): Promise<Array<{ id: number; code: string | null; display_name: string | null; type: null }>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.unitsInSisub.findMany({ columns: { id: true, code: true, displayName: true }, orderBy: (u, { asc }) => [asc(u.displayName)] })
	)
	return rows.map((r) => {
		const w = toWire<{ id: number; code: string | null; display_name: string | null }>(r)
		return { id: w.id, code: w.code, display_name: w.display_name, type: null }
	})
}

export async function listAllMessHalls(
	db: SisubDb,
	_ctx: UserContext
): Promise<Array<Pick<MessHall, "id" | "unit_id" | "code" | "display_name" | "kitchen_id">>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInSisub.findMany({
			columns: { id: true, unitId: true, code: true, displayName: true, kitchenId: true },
			orderBy: (m, { asc }) => [asc(m.displayName)],
		})
	)
	return rows.map((r) => toWire(r))
}

export async function fetchPlacesGraph(db: SisubDb, _ctx: UserContext): Promise<{ units: Unit[]; kitchens: Kitchen[]; messHalls: MessHall[] }> {
	const [units, kitchens, messHalls] = await runQuery("FETCH_FAILED", () =>
		Promise.all([
			db.select().from(unitsInSisub).orderBy(asc(unitsInSisub.displayName)),
			db.select().from(kitchenInSisub).orderBy(asc(kitchenInSisub.displayName)),
			db.select().from(messHallsInSisub).orderBy(asc(messHallsInSisub.displayName)),
		])
	)
	return {
		units: units.map((r) => toWire<Unit>(r)),
		kitchens: kitchens.map((r) => toWire<Kitchen>(r)),
		messHalls: messHalls.map((r) => toWire<MessHall>(r)),
	}
}

// ─── Org-graph mutations ────────────────────────────────────────────────────

export async function updatePlacesEntity(db: SisubDb, _ctx: UserContext, input: UpdateEntityInput) {
	await runQuery("UPDATE_FAILED", () => {
		if (input.entityType === "unit") {
			return db
				.update(unitsInSisub)
				.set({ displayName: input.display_name, code: input.code, type: input.type })
				.where(eq(unitsInSisub.id, BigInt(input.id)))
		}
		if (input.entityType === "kitchen") {
			return db.update(kitchenInSisub).set({ displayName: input.display_name, type: input.type }).where(eq(kitchenInSisub.id, input.id))
		}
		return db
			.update(messHallsInSisub)
			.set({ displayName: input.display_name, code: input.code })
			.where(eq(messHallsInSisub.id, BigInt(input.id)))
	})
	return { ok: true as const }
}

export async function applyPlacesDiff(db: SisubDb, _ctx: UserContext, input: ApplyPlacesDiff) {
	await Promise.all(
		input.diffs.map(async (diff) => {
			const set = toColumns<Record<string, number>>({ [diff.column]: diff.newValue })
			try {
				if (diff.table === "kitchen") {
					await db.update(kitchenInSisub).set(set).where(eq(kitchenInSisub.id, diff.recordId))
				} else {
					await db
						.update(messHallsInSisub)
						.set(set)
						.where(eq(messHallsInSisub.id, BigInt(diff.recordId)))
				}
			} catch (e) {
				throw new DomainError("UPDATE_FAILED", `Falha ao atualizar ${diff.table} (id ${diff.recordId}): ${e instanceof Error ? e.message : String(e)}`)
			}
		})
	)
	return { ok: true as const, count: input.diffs.length }
}

// ─── Mess-hall lookups + diner presence ─────────────────────────────────────

export async function fetchMessHallByCode(
	db: SisubDb,
	_ctx: UserContext,
	input: FetchMessHallByCode
): Promise<Pick<MessHall, "id" | "unit_id" | "code" | "display_name"> | null> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInSisub.findFirst({ columns: { id: true, unitId: true, code: true, displayName: true }, where: eq(messHallsInSisub.code, input.code) })
	)
	return row ? toWire(row) : null
}

export async function fetchMessHallIdByCode(db: SisubDb, _ctx: UserContext, input: FetchMessHallByCode): Promise<number | null> {
	if (!input.code) return null
	const row = await runQuery("FETCH_FAILED", () => db.query.messHallsInSisub.findFirst({ columns: { id: true }, where: eq(messHallsInSisub.code, input.code) }))
	return row ? Number(row.id) : null
}

export async function fetchUserMealForecast(db: SisubDb, _ctx: UserContext, input: FetchUserMealForecast): Promise<{ will_eat: boolean | null } | null> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ will_eat: mealForecastsInSisub.willEat })
			.from(mealForecastsInSisub)
			.where(
				and(
					eq(mealForecastsInSisub.userId, input.userId),
					eq(mealForecastsInSisub.date, input.date),
					eq(mealForecastsInSisub.meal, input.meal),
					eq(mealForecastsInSisub.messHallId, input.messHallId)
				)
			)
			.limit(1)
	)
	return rows[0] ?? null
}

export async function fetchOtherPresencesCount(db: SisubDb, _ctx: UserContext, input: FetchOtherPresencesCount): Promise<number> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ value: count() })
			.from(otherPresencesInSisub)
			.where(
				and(eq(otherPresencesInSisub.date, input.date), eq(otherPresencesInSisub.meal, input.meal), eq(otherPresencesInSisub.messHallId, input.messHallId))
			)
	)
	return rows[0]?.value ?? 0
}

export async function addOtherPresence(db: SisubDb, _ctx: UserContext, input: AddOtherPresence) {
	await runQuery("INSERT_FAILED", () =>
		db.insert(otherPresencesInSisub).values({ adminId: input.adminId, date: input.date, meal: input.meal, messHallId: input.messHallId })
	)
}

export async function resolveDisplayName(db: SisubDb, _ctx: UserContext, input: ResolveDisplayName): Promise<string | null> {
	try {
		const rows = await db
			.select({ display_name: vUserIdentityInSisub.displayName })
			.from(vUserIdentityInSisub)
			.where(eq(vUserIdentityInSisub.id, input.userId))
			.limit(1)
		return rows[0]?.display_name ?? null
	} catch {
		return null
	}
}
