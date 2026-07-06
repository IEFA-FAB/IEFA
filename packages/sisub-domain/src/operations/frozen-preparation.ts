/**
 * Frozen preparation operations: CRUD para kitchen.frozen_preparation (semiacabados
 * congelados segregados de kitchen.ingredient). Drizzle query layer.
 *
 * Contrato de retorno em snake_case (via toWire) — igual ao resto do domínio.
 * Auth: reads sem guard; mutações autenticadas (enforced no server fn via requireAuth),
 * espelhando purchase-item.ts (catálogo global).
 */

import { frozenPreparationInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { FrozenPreparation } from "@iefa/database/sisub"
import { and, asc, eq, ilike, isNull } from "drizzle-orm"
import type {
	CreateFrozenPreparation,
	DeleteFrozenPreparation,
	FetchFrozenPreparation,
	ListFrozenPreparations,
	UpdateFrozenPreparation,
} from "../schemas/frozen-preparation.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toColumns, toWire } from "../utils/index.ts"

type FrozenPreparationInsert = typeof frozenPreparationInKitchen.$inferInsert

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function listFrozenPreparations(db: SisubDb, _ctx: UserContext, input: ListFrozenPreparations): Promise<FrozenPreparation[]> {
	const conditions = [isNull(frozenPreparationInKitchen.deletedAt)]
	const search = input.search?.trim()
	// escapa metacaracteres LIKE (\ % _) p/ busca literal
	if (search) conditions.push(ilike(frozenPreparationInKitchen.description, `%${search.replace(/[\\%_]/g, "\\$&")}%`))
	if (input.category) conditions.push(eq(frozenPreparationInKitchen.category, input.category))

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(frozenPreparationInKitchen)
			.where(and(...conditions))
			.orderBy(asc(frozenPreparationInKitchen.description))
			.limit(500)
	)
	return rows.map((r) => toWire<FrozenPreparation>(r))
}

export async function fetchFrozenPreparation(db: SisubDb, _ctx: UserContext, input: FetchFrozenPreparation): Promise<FrozenPreparation> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.frozenPreparationInKitchen.findFirst({
			where: and(eq(frozenPreparationInKitchen.id, input.id), isNull(frozenPreparationInKitchen.deletedAt)),
		})
	)
	if (!row) throw new DomainError("FETCH_FAILED", `frozen_preparation ${input.id} not found`)
	return toWire<FrozenPreparation>(row)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createFrozenPreparation(db: SisubDb, _ctx: UserContext, input: CreateFrozenPreparation): Promise<FrozenPreparation> {
	const row = await insertOneOrFail(
		"INSERT_FAILED",
		"Falha ao criar preparação congelada: no row returned",
		() => db.insert(frozenPreparationInKitchen).values(toColumns<FrozenPreparationInsert>(input.payload)).returning(),
		{ prefix: "Falha ao criar preparação congelada", includeCode: true }
	)
	return toWire<FrozenPreparation>(row)
}

export async function updateFrozenPreparation(db: SisubDb, _ctx: UserContext, input: UpdateFrozenPreparation): Promise<FrozenPreparation> {
	const row = await insertOneOrFail(
		"UPDATE_FAILED",
		`Falha ao atualizar preparação congelada: ${input.id} não encontrado`,
		() =>
			db
				.update(frozenPreparationInKitchen)
				.set(toColumns<Partial<FrozenPreparationInsert>>(input.payload))
				.where(and(eq(frozenPreparationInKitchen.id, input.id), isNull(frozenPreparationInKitchen.deletedAt)))
				.returning(),
		{ prefix: "Falha ao atualizar preparação congelada", includeCode: true }
	)
	return toWire<FrozenPreparation>(row)
}

export async function deleteFrozenPreparation(db: SisubDb, _ctx: UserContext, input: DeleteFrozenPreparation): Promise<void> {
	await mutateOrFail("DELETE_FAILED", `frozen_preparation ${input.id} not found`, () =>
		db
			.update(frozenPreparationInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(eq(frozenPreparationInKitchen.id, input.id), isNull(frozenPreparationInKitchen.deletedAt)))
			.returning({ id: frozenPreparationInKitchen.id })
	)
}
