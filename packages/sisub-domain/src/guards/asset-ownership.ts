/**
 * Ownership guards for assets that live in both GLOBAL and LOCAL form in the same
 * table, discriminated by `kitchen_id`:
 *   - `kitchen_id IS NULL`  → global asset, owned by the SDAB. Mutation requires `global:2`.
 *   - `kitchen_id = N`      → local asset, owned by kitchen N. Mutation requires `kitchen:2` SCOPED to N.
 *
 * Replaces the fallback anti-pattern that used to guard these tables:
 *
 *     if (input.kitchenId != null) requireKitchen(ctx, 2, input.kitchenId)
 *     else requirePermission(ctx, "kitchen", 2)   // ← authorized GLOBAL mutation with kitchen:2
 *
 * Two independent defects in that shape:
 *   1. the `else` branch let any `kitchen:2` holder mutate a global asset — and because
 *      `listRecipes` keeps the highest version per family, an edit propagated to the
 *      whole FAB;
 *   2. the scope came from the REQUEST, so operations that mutate by id alone never
 *      resolved the real owner (IDOR between kitchens).
 *
 * Hence: the owner is always read from the persisted row, never taken from the input.
 */

import { mealTypeInKitchen, menuTemplateInKitchen, recipesInKitchen, type SisubDb, stepTemplateInKitchen, utensilInKitchen } from "@iefa/database/drizzle/sisub"
import { eq } from "drizzle-orm"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import { requireKitchen, requirePermission } from "./require-permission.ts"

/** Tables holding both global and local rows. Keys double as the entity name in errors. */
export type AssetKind = "recipe" | "menu_template" | "meal_type" | "step_template" | "utensil"

type OwnerRow = { kitchenId: number | null }

/**
 * One resolver per asset kind. Deliberately a switch-free explicit map rather than a
 * generic table abstraction: Drizzle's column types make the generic version opaque,
 * and adding a new asset kind SHOULD be an explicit edit here.
 */
const OWNER_RESOLVERS: Record<AssetKind, (db: SisubDb, id: string) => Promise<OwnerRow | undefined>> = {
	recipe: (db, id) => db.query.recipesInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(recipesInKitchen.id, id) }),
	menu_template: (db, id) => db.query.menuTemplateInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(menuTemplateInKitchen.id, id) }),
	meal_type: (db, id) => db.query.mealTypeInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(mealTypeInKitchen.id, id) }),
	step_template: (db, id) => db.query.stepTemplateInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(stepTemplateInKitchen.id, id) }),
	utensil: (db, id) => db.query.utensilInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(utensilInKitchen.id, id) }),
}

/**
 * Reads the owning kitchen of an asset from the DB.
 *
 * @throws {NotFoundError} when the row does not exist — deliberately the same error
 *   whether the id is unknown or belongs to another kitchen, so probing cannot
 *   distinguish "does not exist" from "not yours".
 */
export async function resolveAssetOwner(db: SisubDb, kind: AssetKind, id: string): Promise<number | null> {
	const row = await runQuery("FETCH_FAILED", () => OWNER_RESOLVERS[kind](db, id))
	if (!row) throw new NotFoundError(kind, id)
	return row.kitchenId
}

/**
 * Authorizes a write whose target scope is known up front (CREATE), where the scope
 * comes from the caller's intent rather than from an existing row.
 *
 * @param targetKitchenId - `null` means "create a global asset" and demands `global:2`.
 */
export function requireAssetWriteForScope(ctx: UserContext, targetKitchenId: number | null): void {
	if (targetKitchenId == null) requirePermission(ctx, "global", 2)
	else requireKitchen(ctx, 2, targetKitchenId)
}

/**
 * Authorizes a mutation of an EXISTING asset, resolving the owner from the DB first.
 *
 * @returns the owning kitchen id (`null` for a global asset), so callers that need to
 *   branch on ownership do not have to query twice.
 * @throws {NotFoundError} when the asset does not exist.
 * @throws {PermissionDeniedError} when the caller lacks the required level.
 */
export async function authorizeAssetMutation(db: SisubDb, ctx: UserContext, kind: AssetKind, id: string): Promise<number | null> {
	const ownerKitchenId = await resolveAssetOwner(db, kind, id)
	requireAssetWriteForScope(ctx, ownerKitchenId)
	return ownerKitchenId
}
