/**
 * Regressão happy-path — operation de CONFIGURAÇÕES DE UNIDADE (@iefa/sisub-domain).
 * Congela o contrato (shape do select + round-trip de update) ANTES da migração p/ Drizzle.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { fetchUnitSettings, updateUnitSettings } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

const ctx = fullAccessCtx()

describeSupabaseIntegration("units operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	// Ops migradas recebem `db` (Drizzle); o seeder/cleanup seguem no client Supabase.
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("units")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	afterAll(async () => {
		await closeDb?.()
	})

	test("fetchUnitSettings retorna o shape esperado da unidade", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()

		const settings = await fetchUnitSettings(db, ctx, { unitId })

		expect(settings).toMatchObject({ id: unitId })
		// chaves do contrato preservadas (mesmo que nulas)
		for (const key of ["code", "display_name", "type", "uasg", "address_logradouro", "address_municipio", "address_uf", "address_cep"]) {
			expect(settings).toHaveProperty(key)
		}
	})

	test("updateUnitSettings persiste uasg + endereço (round-trip) e retorna { ok: true }", async () => {
		if (!reachable || !seeder || !db) return
		const unitId = await seeder.seedUnit()

		const res = await updateUnitSettings(db, ctx, {
			unitId,
			settings: {
				uasg: "120999",
				address_logradouro: "Rua Teste",
				address_numero: "42",
				address_complemento: null,
				address_bairro: "Centro",
				address_municipio: "Brasília",
				address_uf: "DF",
				address_cep: "70000-000",
			},
		})
		expect(res).toEqual({ ok: true })

		const after = await fetchUnitSettings(db, ctx, { unitId })
		expect(after?.uasg).toBe("120999")
		expect(after?.address_logradouro).toBe("Rua Teste")
		expect(after?.address_municipio).toBe("Brasília")
		expect(after?.address_uf).toBe("DF")
		expect(after?.address_cep).toBe("70000-000")
	})
})
