/**
 * Org-hierarchy + mess-hall operations. Drizzle query layer.
 *
 * Auth: leituras da hierarquia são apenas autenticadas (catálogo visível a qualquer sessão);
 * `addOtherPresence` escreve presença de terceiro e exige `messhall:2` no refeitório.
 *
 * `units`/`mess_halls` têm PK bigserial → o id volta BigInt no Drizzle; `toWire`
 * coage para number (contrato), e updates por id usam `BigInt(input.id)`.
 */

import {
	kitchenInCore,
	mealForecastsInKitchen,
	messHallsInCore,
	otherPresencesInKitchen,
	type SisubDb,
	unitsInCore,
	vUserIdentityInCore,
} from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { and, asc, count, eq } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { requireMessHall, requirePermission } from "../guards/require-permission.ts"
import type {
	AddOtherPresence,
	ApplyPlacesDiff,
	FetchMessHallByCode,
	FetchOtherPresencesCount,
	FetchUserMealForecast,
	ListPlaces,
	ResolveDisplayName,
	UpdateEntityInput,
} from "../schemas/places.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery, toWire } from "../utils/index.ts"

type Unit = Tables<"units">
type Kitchen = Tables<"kitchen">
type MessHall = Tables<"mess_halls">

// ─── Reference reads ────────────────────────────────────────────────────────

/**
 * Unidades para seleção. Exclui o escopo de treino por padrão — ver `ListPlaces`.
 */
/**
 * Filtro de escopo de treino, ponto ÚNICO por entidade.
 *
 * As sentinelas de treino saem de toda listagem de produção por padrão; incluí-las é opt-in
 * explícito (`includeTraining`), usado só pelo painel da SDAB. Centralizar aqui é o que
 * impede o modo de falha real: um seletor novo esquecer o filtro e vazar a cozinha de treino
 * para todo mundo — ou pior, deixar dado de treino entrar num indicador.
 */
function trainingFilter(column: PgColumn, input?: ListPlaces) {
	return input?.includeTraining ? undefined : eq(column, false)
}

export async function listUnits(
	db: SisubDb,
	_ctx: UserContext,
	input?: ListPlaces
): Promise<Array<{ id: number; code: string | null; display_name: string | null; type: null }>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.unitsInCore.findMany({
			columns: { id: true, code: true, displayName: true },
			where: trainingFilter(unitsInCore.isTraining, input),
			orderBy: (u, { asc }) => [asc(u.displayName)],
		})
	)
	return rows.map((r) => {
		const w = toWire<{ id: number; code: string | null; display_name: string | null }>(r)
		return { id: w.id, code: w.code, display_name: w.display_name, type: null }
	})
}

export async function listAllMessHalls(
	db: SisubDb,
	_ctx: UserContext,
	input?: ListPlaces
): Promise<Array<Pick<MessHall, "id" | "unit_id" | "code" | "display_name" | "kitchen_id">>> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.messHallsInCore.findMany({
			columns: { id: true, unitId: true, code: true, displayName: true, kitchenId: true },
			where: trainingFilter(messHallsInCore.isTraining, input),
			orderBy: (m, { asc }) => [asc(m.displayName)],
		})
	)
	return rows.map((r) => toWire(r))
}

export async function fetchPlacesGraph(
	db: SisubDb,
	_ctx: UserContext,
	input?: ListPlaces
): Promise<{ units: Unit[]; kitchens: Kitchen[]; messHalls: MessHall[] }> {
	const [units, kitchens, messHalls] = await runQuery("FETCH_FAILED", () =>
		Promise.all([
			db.select().from(unitsInCore).where(trainingFilter(unitsInCore.isTraining, input)).orderBy(asc(unitsInCore.displayName)),
			db.select().from(kitchenInCore).where(trainingFilter(kitchenInCore.isTraining, input)).orderBy(asc(kitchenInCore.displayName)),
			db.select().from(messHallsInCore).where(trainingFilter(messHallsInCore.isTraining, input)).orderBy(asc(messHallsInCore.displayName)),
		])
	)
	return {
		units: units.map((r) => toWire<Unit>(r)),
		kitchens: kitchens.map((r) => toWire<Kitchen>(r)),
		messHalls: messHalls.map((r) => toWire<MessHall>(r)),
	}
}

// ─── Org-graph mutations ────────────────────────────────────────────────────

export async function updatePlacesEntity(db: SisubDb, ctx: UserContext, input: UpdateEntityInput) {
	// A estrutura organizacional (OM, cozinha, refeitório) é da SDAB — sem este gate
	// qualquer usuário autenticado renomeava unidades e refeitórios da FAB inteira.
	requirePermission(ctx, "global", 2)

	await runQuery("UPDATE_FAILED", () => {
		if (input.entityType === "unit") {
			return db
				.update(unitsInCore)
				.set({ displayName: input.display_name, code: input.code, type: input.type })
				.where(eq(unitsInCore.id, BigInt(input.id)))
		}
		if (input.entityType === "kitchen") {
			return db.update(kitchenInCore).set({ displayName: input.display_name, type: input.type }).where(eq(kitchenInCore.id, input.id))
		}
		return db
			.update(messHallsInCore)
			.set({ displayName: input.display_name, code: input.code })
			.where(eq(messHallsInCore.id, BigInt(input.id)))
	})
	return { ok: true as const }
}

// Mapeia a coluna (snake, validada pelo Zod) → prop camelCase do Drizzle. `satisfies` garante,
// em compile-time, que cada destino é uma coluna real da tabela (sem o silent-drop do cast genérico).
const KITCHEN_DIFF_KEY = { unit_id: "unitId", purchase_unit_id: "purchaseUnitId", kitchen_id: "kitchenId" } satisfies Record<
	string,
	keyof typeof kitchenInCore.$inferInsert
>
const MESS_HALL_DIFF_KEY = { unit_id: "unitId", kitchen_id: "kitchenId" } satisfies Record<string, keyof typeof messHallsInCore.$inferInsert>

export async function applyPlacesDiff(db: SisubDb, ctx: UserContext, input: ApplyPlacesDiff) {
	// Idem: o diff reparenteia cozinhas e refeitórios. Sem gate, qualquer sessão válida
	// remontava a hierarquia.
	requirePermission(ctx, "global", 2)

	await Promise.all(
		input.diffs.map(async (diff) => {
			try {
				if (diff.table === "kitchen") {
					await db
						.update(kitchenInCore)
						.set({ [KITCHEN_DIFF_KEY[diff.column]]: diff.newValue })
						.where(eq(kitchenInCore.id, diff.recordId))
				} else {
					await db
						.update(messHallsInCore)
						.set({ [MESS_HALL_DIFF_KEY[diff.column]]: diff.newValue })
						.where(eq(messHallsInCore.id, BigInt(diff.recordId)))
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
		db.query.messHallsInCore.findFirst({ columns: { id: true, unitId: true, code: true, displayName: true }, where: eq(messHallsInCore.code, input.code) })
	)
	return row ? toWire(row) : null
}

export async function fetchMessHallIdByCode(db: SisubDb, _ctx: UserContext, input: FetchMessHallByCode): Promise<number | null> {
	if (!input.code) return null
	const row = await runQuery("FETCH_FAILED", () => db.query.messHallsInCore.findFirst({ columns: { id: true }, where: eq(messHallsInCore.code, input.code) }))
	return row ? Number(row.id) : null
}

export async function fetchUserMealForecast(db: SisubDb, _ctx: UserContext, input: FetchUserMealForecast): Promise<{ will_eat: boolean | null } | null> {
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ will_eat: mealForecastsInKitchen.willEat })
			.from(mealForecastsInKitchen)
			.where(
				and(
					eq(mealForecastsInKitchen.userId, input.userId),
					eq(mealForecastsInKitchen.date, input.date),
					eq(mealForecastsInKitchen.meal, input.meal),
					eq(mealForecastsInKitchen.messHallId, input.messHallId)
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
			.from(otherPresencesInKitchen)
			.where(
				and(
					eq(otherPresencesInKitchen.date, input.date),
					eq(otherPresencesInKitchen.meal, input.meal),
					eq(otherPresencesInKitchen.messHallId, input.messHallId)
				)
			)
	)
	return rows[0]?.value ?? 0
}

export async function addOtherPresence(db: SisubDb, ctx: UserContext, input: AddOtherPresence) {
	// Presença de não-cadastrado lançada pelo fiscal do rancho.
	requireMessHall(ctx, 2, input.messHallId)

	await runQuery("INSERT_FAILED", () =>
		db.insert(otherPresencesInKitchen).values({ adminId: input.adminId, date: input.date, meal: input.meal, messHallId: input.messHallId })
	)
}

export async function resolveDisplayName(db: SisubDb, _ctx: UserContext, input: ResolveDisplayName): Promise<string | null> {
	try {
		const rows = await db
			.select({ display_name: vUserIdentityInCore.displayName })
			.from(vUserIdentityInCore)
			.where(eq(vUserIdentityInCore.id, input.userId))
			.limit(1)
		return rows[0]?.display_name ?? null
	} catch {
		return null
	}
}
