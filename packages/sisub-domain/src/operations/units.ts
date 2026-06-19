/**
 * Unit settings operations — UASG code + address fields. Drizzle query layer.
 *
 * Auth posture preserved from the original server functions: authenticated
 * entrypoints with no module-level PBAC guard. `ctx` accepted for uniformity.
 */

import { type SisubDb, unitsInSisub } from "@iefa/database/drizzle/sisub"
import type { Tables } from "@iefa/database/sisub"
import { eq } from "drizzle-orm"
import type { FetchUnitSettings, UpdateUnitSettings } from "../schemas/units.ts"
import type { UserContext } from "../types/context.ts"
import { DomainError } from "../types/errors.ts"
import { runQuery, toWire } from "../utils/index.ts"

type UnitSettings = Pick<
	Tables<"units">,
	| "id"
	| "code"
	| "display_name"
	| "type"
	| "uasg"
	| "address_logradouro"
	| "address_numero"
	| "address_complemento"
	| "address_bairro"
	| "address_municipio"
	| "address_uf"
	| "address_cep"
>

export async function fetchUnitSettings(db: SisubDb, _ctx: UserContext, input: FetchUnitSettings): Promise<UnitSettings> {
	const row = await runQuery("FETCH_FAILED", () =>
		db.query.unitsInSisub.findFirst({
			columns: {
				id: true,
				code: true,
				displayName: true,
				type: true,
				uasg: true,
				addressLogradouro: true,
				addressNumero: true,
				addressComplemento: true,
				addressBairro: true,
				addressMunicipio: true,
				addressUf: true,
				addressCep: true,
			},
			where: eq(unitsInSisub.id, BigInt(input.unitId)),
		})
	)
	if (!row) throw new DomainError("FETCH_FAILED", `unit ${input.unitId} not found`)
	return toWire<UnitSettings>(row)
}

export async function updateUnitSettings(db: SisubDb, _ctx: UserContext, input: UpdateUnitSettings) {
	const updated = await runQuery("UPDATE_FAILED", () =>
		db
			.update(unitsInSisub)
			.set({
				uasg: input.settings.uasg,
				addressLogradouro: input.settings.address_logradouro,
				addressNumero: input.settings.address_numero,
				addressComplemento: input.settings.address_complemento,
				addressBairro: input.settings.address_bairro,
				addressMunicipio: input.settings.address_municipio,
				addressUf: input.settings.address_uf,
				addressCep: input.settings.address_cep,
			})
			.where(eq(unitsInSisub.id, BigInt(input.unitId)))
			.returning({ id: unitsInSisub.id })
	)
	// Distingue "atualizado" de "id inexistente" num path mutável (WHERE sem match = 0 linhas).
	if (updated.length === 0) throw new DomainError("UPDATE_FAILED", `unit ${input.unitId} not found`)
	return { ok: true as const }
}
