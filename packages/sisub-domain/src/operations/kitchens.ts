/**
 * Kitchen operations — listagem, vínculo a unidades e address settings. Drizzle query layer.
 *
 * Auth: `listKitchens`/`listUnitKitchens` exigem kitchen nível 1. Os *settings* preservam a
 * postura original (entrypoint autenticado sem guard PBAC de módulo; `ctx` por uniformidade).
 */

import { kitchenInSisub, type SisubDb } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { asc, eq } from "drizzle-orm"
import { requirePermission } from "../guards/require-permission.ts"
import type { FetchKitchenSettings, ListUnitKitchens, UpdateKitchenSettings } from "../schemas/kitchens.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery, toWire } from "../utils/index.ts"

// kitchen tem DUAS relations p/ units (unit_id e purchase_unit_id) — a do contrato é unit_id.
const KITCHEN_RELATIONS: Record<string, string> = { unitsInSisub_unitId: "unit" }

type UnitRef = { id: number; display_name: string | null; code: string }
type KitchenWithUnit = Tables<"kitchen"> & { unit: UnitRef | null }
type KitchenSettings = Pick<
	Tables<"kitchen">,
	| "id"
	| "display_name"
	| "type"
	| "address_logradouro"
	| "address_numero"
	| "address_complemento"
	| "address_bairro"
	| "address_municipio"
	| "address_uf"
	| "address_cep"
> & { unit: { id: number; code: string; display_name: string | null } | null }

export async function listKitchens(db: SisubDb, ctx: UserContext): Promise<KitchenWithUnit[]> {
	requirePermission(ctx, "kitchen", 1)

	const rows = await runQuery("FETCH_FAILED", () =>
		db.query.kitchenInSisub.findMany({
			with: { unitsInSisub_unitId: { columns: { id: true, displayName: true, code: true } } },
			orderBy: (kitchen, { asc }) => [asc(kitchen.id)],
		})
	)
	return rows.map((r) => toWire<KitchenWithUnit>(r, KITCHEN_RELATIONS))
}

export async function listUnitKitchens(db: SisubDb, ctx: UserContext, input: ListUnitKitchens): Promise<{ id: number; display_name: string | null }[]> {
	requirePermission(ctx, "kitchen", 1)

	const rows = await runQuery("FETCH_FAILED", () =>
		db
			.select({ id: kitchenInSisub.id, display_name: kitchenInSisub.displayName })
			.from(kitchenInSisub)
			.where(eq(kitchenInSisub.unitId, input.unitId))
			.orderBy(asc(kitchenInSisub.displayName))
	)
	return rows
}

// ─── Kitchen address settings ───────────────────────────────────────────────

export async function fetchKitchenSettings(db: SisubDb, _ctx: UserContext, input: FetchKitchenSettings): Promise<KitchenSettings> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.kitchenInSisub.findFirst({
			columns: {
				id: true,
				displayName: true,
				type: true,
				addressLogradouro: true,
				addressNumero: true,
				addressComplemento: true,
				addressBairro: true,
				addressMunicipio: true,
				addressUf: true,
				addressCep: true,
			},
			with: { unitsInSisub_unitId: { columns: { id: true, code: true, displayName: true } } },
			where: eq(kitchenInSisub.id, input.kitchenId),
		})
	)
	if (!row) throw new DomainError("FETCH_FAILED", `kitchen ${input.kitchenId} not found`)
	return toWire<KitchenSettings>(row, KITCHEN_RELATIONS)
}

export async function updateKitchenSettings(db: SisubDb, _ctx: UserContext, input: UpdateKitchenSettings) {
	await runQuery("UPDATE_FAILED", () =>
		db
			.update(kitchenInSisub)
			.set({
				addressLogradouro: input.settings.address_logradouro,
				addressNumero: input.settings.address_numero,
				addressComplemento: input.settings.address_complemento,
				addressBairro: input.settings.address_bairro,
				addressMunicipio: input.settings.address_municipio,
				addressUf: input.settings.address_uf,
				addressCep: input.settings.address_cep,
			})
			.where(eq(kitchenInSisub.id, input.kitchenId))
	)
	return { ok: true as const }
}
