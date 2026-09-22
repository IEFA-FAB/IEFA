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

import {
	equipmentModelInKitchen,
	mealTypeInKitchen,
	menuGroupSetInKitchen,
	menuTemplateInKitchen,
	recipesInKitchen,
	type SisubDb,
	stepTemplateInKitchen,
	utensilInKitchen,
} from "@iefa/database/drizzle/sisub"
import { hasAnyPermission, hasPermission } from "@iefa/pbac"
import { eq } from "drizzle-orm"
import type { UserContext } from "../types/context.ts"
import { NotFoundError } from "../types/errors.ts"
import { runQuery } from "../utils/index.ts"
import { requireAnyPermission, requireKitchen, requirePermission } from "./require-permission.ts"

/** Tables holding both global and local rows. Keys double as the entity name in errors. */
export type AssetKind = "recipe" | "menu_template" | "meal_type" | "menu_group_set" | "step_template" | "utensil" | "equipment_model"

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
	// Sem relations declaradas (tabela nova, `schema.ts` é gerado): `db.select`
	// resolve o dono igual, e o builder relacional não acrescenta nada aqui.
	menu_group_set: async (db, id) =>
		(await db.select({ kitchenId: menuGroupSetInKitchen.kitchenId }).from(menuGroupSetInKitchen).where(eq(menuGroupSetInKitchen.id, id)).limit(1))[0],
	step_template: (db, id) => db.query.stepTemplateInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(stepTemplateInKitchen.id, id) }),
	utensil: (db, id) => db.query.utensilInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(utensilInKitchen.id, id) }),
	equipment_model: (db, id) => db.query.equipmentModelInKitchen.findFirst({ columns: { kitchenId: true }, where: eq(equipmentModelInKitchen.id, id) }),
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

/**
 * Pode LER um ativo global/local, dado o dono já resolvido da linha?
 *
 *   - global (`kitchen_id IS NULL`): quem tem cozinha OU catálogo global — mesmo critério
 *     de `getTemplate`/`listRecipeSummaries` (a SDAB chega aqui sem cozinha nenhuma);
 *   - local (`kitchen_id = N`): só quem tem `kitchen:1` escopado àquela cozinha. `global`
 *     não abre ativo de cozinha — é a mesma regra da leitura de template local.
 *
 * Versão booleana para FILTRAR listas (versões de uma linhagem incluem forks de várias
 * cozinhas); para autorizar uma leitura por id, use {@link requireAssetRead}.
 */
export function canReadAsset(ctx: UserContext, ownerKitchenId: number | null): boolean {
	if (ownerKitchenId == null) return hasAnyPermission(ctx.permissions, ["kitchen", "global"], 1)
	return hasPermission(ctx.permissions, "kitchen", 1, { type: "kitchen", id: ownerKitchenId })
}

/**
 * Autoriza a LEITURA por id de um ativo global/local, com o dono lido da linha persistida —
 * nunca do input. Sem isto, qualquer `kitchen:1` de uma cozinha lia a ficha de outra só
 * sabendo o UUID (IDOR entre cozinhas).
 *
 * @throws {PermissionDeniedError} quando o chamador não alcança o dono.
 */
export function requireAssetRead(ctx: UserContext, ownerKitchenId: number | null): void {
	if (ownerKitchenId == null) requireAnyPermission(ctx, ["kitchen", "global"], 1)
	else requireKitchen(ctx, 1, ownerKitchenId)
}
