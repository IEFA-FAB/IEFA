/**
 * Regressão happy-path — operations de USER DATA / sync (@iefa/sisub-domain).
 * Congela: fetch de user_data + military, saram (null em vazio), e o upsert
 * resiliente à colisão de email (delete da órfã + retry) ANTES da migração Drizzle.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { fetchMaskedCpf, fetchMilitaryData, fetchSisubUserData, fetchUserSaram, fetchVisibleSaram, syncUserEmail, syncUserSaram } from "@iefa/sisub-domain"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { createSisubTestDb, describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

describeSupabaseIntegration("user operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null
	let db: SisubDb | null = null
	let closeDb: (() => Promise<void>) | null = null

	beforeAll(async () => {
		const s = await setupIntegration("user_data")
		reachable = s.reachable
		if (s.client) client = s.client
		const url = getSisubDatabaseUrl()
		if (reachable && url) {
			const t = createSisubTestDb(url)
			db = t.db
			closeDb = t.close
		}
	})

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	})

	afterAll(async () => {
		await closeDb?.()
	})

	test("fetchSisubUserData devolve o shape do contrato", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const email = `${uid("u-")}@example.invalid`.toLowerCase()
		await seeder.seedUserData({ id: userId, email, saram: uid("NO") })

		const data = await fetchSisubUserData(db, { userId })
		expect(data).toMatchObject({ id: userId, email })
		for (const key of ["id", "email", "saram", "created_at", "default_mess_hall_id"]) {
			expect(data).toHaveProperty(key)
		}
	})

	test("fetchUserSaram retorna string ou null (vazio → null)", async () => {
		if (!reachable || !seeder || !db) return
		const withNr = await seeder.seedAuthUser()
		const saram = uid("NO")
		await seeder.seedUserData({ id: withNr, email: `${uid("u-")}@example.invalid`.toLowerCase(), saram })
		expect(await fetchUserSaram(db, { userId: withNr })).toBe(saram)

		const without = await seeder.seedAuthUser()
		await seeder.seedUserData({ id: without, email: `${uid("u-")}@example.invalid`.toLowerCase() })
		expect(await fetchUserSaram(db, { userId: without })).toBeNull()
	})

	test("fetchMilitaryData busca por saram", async () => {
		if (!reachable || !seeder || !db) return
		const saram = await seeder.seedUserMilitaryData({ sgPosto: "SO", nmGuerra: uid("Guerra") })

		const mil = await fetchMilitaryData(db, { saram })
		expect(mil).not.toBeNull()
		expect(mil?.saram).toBe(saram)
		expect(mil?.sgPosto).toBe("SO")
		// A identificação vem de `core.military_identity`: nem CPF nem nome completo.
		expect(Object.keys(mil ?? {}).sort()).toEqual(["dataAtualizacao", "nmGuerra", "saram", "sgOrg", "sgPosto"])
	})

	test("fetchMaskedCpf devolve só a máscara do gov.br, montada no banco", async () => {
		if (!reachable || !seeder || !db) return
		// 11 dígitos únicos e que não são CPF válido (dígitos verificadores ignorados): a semeadura
		// não pode colidir com a carga real, que tem o CPF como UNIQUE.
		const digits = `9${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`
		const saram = await seeder.seedUserMilitaryData({ cpf: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` })
		expect(await fetchMaskedCpf(db, { saram })).toBe(`***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`)

		// CPF fora do formato (12 e 10 dígitos) e SARAM ausente: nada a mostrar.
		const longer = await seeder.seedUserMilitaryData({ cpf: `${digits}0` })
		expect(await fetchMaskedCpf(db, { saram: longer })).toBeNull()
		const shorter = await seeder.seedUserMilitaryData({ cpf: digits.slice(1) })
		expect(await fetchMaskedCpf(db, { saram: shorter })).toBeNull()
		expect(await fetchMaskedCpf(db, { saram: uid("NO") })).toBeNull()
	})

	// Desde 20261003100000 o SARAM digitado só vincula se for o candidato da chave do e-mail
	// institucional (`core.claim_saram`); os fluxos completos estão em `saram-link.operations.test.ts`.
	test("syncUserSaram: número fora da chave do e-mail vira pedido, e nada é gravado na conta", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.track("user_data", userId)
		const email = `${uid("sync-")}@example.invalid`.toLowerCase()
		const saram = String(100000 + Math.floor(Math.random() * 899999))

		const outcome = await syncUserSaram(db, { userId, email, saram, emailConfirmed: true })
		expect(outcome?.outcome).toBe("requested")
		expect(outcome?.status.status).toMatch(/^(pending_request|contested)$/)
		expect((await fetchSisubUserData(db, { userId }))?.saram).toBeNull()
		expect(await fetchVisibleSaram(db, { userId })).toBeNull()

		// reenvio do mesmo número é idempotente; outro número esbarra no pedido pendente
		expect((await syncUserSaram(db, { userId, email, saram, emailConfirmed: true }))?.outcome).toBe("pending")
		await expect(syncUserSaram(db, { userId, email, saram: "1234567", emailConfirmed: true })).rejects.toMatchObject({ code: "REQUEST_PENDING" })
	})

	test("SARAM gravado fora do fluxo verificado não abre o cadastro militar", async () => {
		if (!reachable || !seeder || !db) return
		const saram = await seeder.seedUserMilitaryData({ sgPosto: "SO" })
		const userId = await seeder.seedAuthUser()
		await seeder.seedUserData({ id: userId, saram })

		expect(await fetchUserSaram(db, { userId })).toBe(saram)
		expect(await fetchVisibleSaram(db, { userId })).toBeNull()
	})

	test("syncUserEmail reivindica o email de uma linha órfã (delete + retry)", async () => {
		if (!reachable || !seeder || !db) return
		const sharedEmail = `${uid("claim-")}@example.invalid`.toLowerCase()

		// Linha órfã: usuário A detém o email
		const userA = await seeder.seedAuthUser()
		await seeder.seedUserData({ id: userA, email: sharedEmail })

		// Usuário B reivindica o mesmo email
		const userB = await seeder.seedAuthUser()
		seeder.track("user_data", userB)

		await syncUserEmail(db, { userId: userB, email: sharedEmail })

		// B agora detém o email; a linha de A foi removida
		expect((await fetchSisubUserData(db, { userId: userB }))?.email).toBe(sharedEmail)
		expect(await fetchSisubUserData(db, { userId: userA })).toBeNull()
	})
})
