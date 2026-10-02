/**
 * Frozen preparation operations: CRUD para kitchen.frozen_preparation (semiacabados
 * congelados segregados de kitchen.ingredient). Drizzle query layer.
 *
 * Contrato de retorno em snake_case (via toWire) — igual ao resto do domínio.
 *
 * Auth:
 *   - leitura do catálogo: quem monta, executa ou cura preparação (`kitchen`, `kitchen-production`
 *     ou `global`, nível 1);
 *   - congelada PROVISÓRIA ainda não revisada (`provisional_since` preenchido e
 *     `provisional_reviewed_at` nulo) é a sobra que uma cozinha registrou sem cadastro: até a SDAB
 *     revisar, ela é da cozinha que a criou (`provisional_kitchen_id`). Só a vê quem tem `global:1`
 *     ou alcança essa cozinha — `kitchen`/`kitchen-production` escopado a ela, ou `unit` de uma OM
 *     que responde por ela (lotação ou compra, `kitchenUnitIds`);
 *   - escrita: catálogo global, `global:2`.
 */

import { frozenPreparationInKitchen, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { FrozenPreparation } from "@iefa/database/sisub"
import { hasAnyPermission, hasPermission } from "@iefa/pbac"
import { and, asc, eq, ilike, isNotNull, isNull, or } from "drizzle-orm"
import { kitchenUnitIds, loadKitchenUnitRef } from "../guards/kitchen-unit.ts"
import { requireAnyPermission, requirePermission } from "../guards/require-permission.ts"
import type {
	CreateFrozenPreparation,
	DeleteFrozenPreparation,
	FetchFrozenPreparation,
	ListFrozenPreparations,
	UpdateFrozenPreparation,
} from "../schemas/frozen-preparation.ts"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import { insertOneOrFail, mutateOrFail, runQuery, toColumns, toWire } from "../utils/index.ts"

type FrozenPreparationInsert = typeof frozenPreparationInKitchen.$inferInsert

const CATALOG_READ_MODULES = ["kitchen", "kitchen-production", "global"] as const

/**
 * Quem pode ver uma congelada provisória pendente da cozinha `ownerKitchenId`. Lê a OM da LINHA
 * da cozinha (nunca da requisição) e só quando os atalhos sem banco não decidem.
 */
async function canSeePendingProvisional(db: SisubDb, ctx: UserContext, ownerKitchenId: number | null): Promise<boolean> {
	if (hasPermission(ctx.permissions, "global", 1)) return true
	if (ownerKitchenId == null) return false
	if (hasAnyPermission(ctx.permissions, ["kitchen", "kitchen-production"], 1, { type: "kitchen", id: ownerKitchenId })) return true
	if (!hasPermission(ctx.permissions, "unit", 1)) return false
	const kitchen = await loadKitchenUnitRef(db, ownerKitchenId)
	return kitchenUnitIds(kitchen).some((unitId) => hasPermission(ctx.permissions, "unit", 1, { type: "unit", id: unitId }))
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function listFrozenPreparations(db: SisubDb, ctx: UserContext, input: ListFrozenPreparations): Promise<FrozenPreparation[]> {
	requireAnyPermission(ctx, CATALOG_READ_MODULES, 1)
	// Congelada provisória (sobra que a cozinha registrou sem cadastro) só entra no catálogo
	// depois da revisão da SDAB; até lá ela é da cozinha que a criou. A SDAB a lê pela fila de
	// revisão (`listPendingProvisionalFrozenPreparations`) e a cozinha, no destino da sobra —
	// nunca por esta listagem, que é a mesma para todo mundo.
	const conditions = [
		isNull(frozenPreparationInKitchen.deletedAt),
		or(isNull(frozenPreparationInKitchen.provisionalSince), isNotNull(frozenPreparationInKitchen.provisionalReviewedAt)),
	]
	const search = input.search?.trim()
	// escapa metacaracteres LIKE (\ % _) p/ busca literal
	if (search) conditions.push(ilike(frozenPreparationInKitchen.description, `%${search.replace(/[\\%_]/g, "\\$&")}%`))
	if (input.category) conditions.push(eq(frozenPreparationInKitchen.category, input.category))

	// Sem limit: catálogo curado e pequeno (subconjunto dos antigos insumos), igual ao fetch
	// de insumos que também retorna a lista completa. Evita truncar silenciosamente.
	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select()
			.from(frozenPreparationInKitchen)
			.where(and(...conditions))
			.orderBy(asc(frozenPreparationInKitchen.description))
	)
	return rows.map((r) => toWire<FrozenPreparation>(r))
}

export async function fetchFrozenPreparation(db: SisubDb, ctx: UserContext, input: FetchFrozenPreparation): Promise<FrozenPreparation> {
	requireAnyPermission(ctx, CATALOG_READ_MODULES, 1)
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.frozenPreparationInKitchen.findFirst({
			where: and(eq(frozenPreparationInKitchen.id, input.id), isNull(frozenPreparationInKitchen.deletedAt)),
		})
	)
	if (!row) throw new NotFoundError("frozen_preparation", input.id)
	// Provisória pendente de outra cozinha responde igual a id inexistente: sondar o UUID não
	// revela que a sobra existe nem de quem é.
	const isPendingProvisional = row.provisionalSince != null && row.provisionalReviewedAt == null
	if (isPendingProvisional && !(await canSeePendingProvisional(db, ctx, row.provisionalKitchenId))) {
		throw new NotFoundError("frozen_preparation", input.id)
	}
	return toWire<FrozenPreparation>(row)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createFrozenPreparation(db: SisubDb, ctx: UserContext, input: CreateFrozenPreparation): Promise<FrozenPreparation> {
	// Catálogo global de preparações congeladas (sem kitchen_id) — escrita é da SDAB.
	requirePermission(ctx, "global", 2)

	const row = await insertOneOrFail(
		"INSERT_FAILED",
		"Falha ao criar preparação congelada: no row returned",
		() => db.insert(frozenPreparationInKitchen).values(toColumns<FrozenPreparationInsert>(input.payload)).returning(),
		{ prefix: "Falha ao criar preparação congelada", includeCode: true }
	)
	return toWire<FrozenPreparation>(row)
}

export async function updateFrozenPreparation(db: SisubDb, ctx: UserContext, input: UpdateFrozenPreparation): Promise<FrozenPreparation> {
	requirePermission(ctx, "global", 2)

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

export async function deleteFrozenPreparation(db: SisubDb, ctx: UserContext, input: DeleteFrozenPreparation): Promise<void> {
	requirePermission(ctx, "global", 2)

	await mutateOrFail("DELETE_FAILED", `frozen_preparation ${input.id} not found`, () =>
		db
			.update(frozenPreparationInKitchen)
			.set({ deletedAt: new Date().toISOString() })
			.where(and(eq(frozenPreparationInKitchen.id, input.id), isNull(frozenPreparationInKitchen.deletedAt)))
			.returning({ id: frozenPreparationInKitchen.id })
	)
}
