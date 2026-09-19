/**
 * Regressão happy-path — operations de USER DATA / sync (@iefa/sisub-domain).
 * Congela: fetch de user_data + military, nrOrdem (null em vazio), e o upsert
 * resiliente à colisão de email (delete da órfã + retry) ANTES da migração Drizzle.
 */

import type { SisubDb } from "@iefa/database/drizzle/sisub"
import { fetchMilitaryData, fetchSisubUserData, fetchUserNrOrdem, syncUserEmail, syncUserNrOrdem } from "@iefa/sisub-domain"
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

	test("fetchSisubUserData devolve o shape do contrato", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		const email = `${uid("u-")}@example.invalid`.toLowerCase()
		await seeder.seedUserData({ id: userId, email, nrOrdem: uid("NO") })

		const data = await fetchSisubUserData(db, { userId })
		expect(data).toMatchObject({ id: userId, email })
		for (const key of ["id", "email", "nrOrdem", "created_at", "default_mess_hall_id"]) {
			expect(data).toHaveProperty(key)
		}
	})

	test("fetchUserNrOrdem retorna string ou null (vazio → null)", async () => {
		if (!reachable || !seeder || !db) return
		const withNr = await seeder.seedAuthUser()
		const nrOrdem = uid("NO")
		await seeder.seedUserData({ id: withNr, email: `${uid("u-")}@example.invalid`.toLowerCase(), nrOrdem })
		expect(await fetchUserNrOrdem(db, { userId: withNr })).toBe(nrOrdem)

		const without = await seeder.seedAuthUser()
		await seeder.seedUserData({ id: without, email: `${uid("u-")}@example.invalid`.toLowerCase() })
		expect(await fetchUserNrOrdem(db, { userId: without })).toBeNull()
	})

	test("fetchMilitaryData busca por nrOrdem", async () => {
		if (!reachable || !seeder || !db) return
		const nrOrdem = await seeder.seedUserMilitaryData({ sgPosto: "SO", nmGuerra: uid("Guerra") })

		const mil = await fetchMilitaryData(db, { nrOrdem })
		expect(mil).not.toBeNull()
		expect(mil?.nrOrdem).toBe(nrOrdem)
		expect(mil?.sgPosto).toBe("SO")
	})

	test("syncUserNrOrdem faz upsert idempotente e corrige nrOrdem que não localiza cadastro", async () => {
		if (!reachable || !seeder || !db) return
		const userId = await seeder.seedAuthUser()
		seeder.track("user_data", userId)
		const email = `${uid("sync-")}@example.invalid`.toLowerCase()
		// valores únicos: o vínculo agora é exclusivo, e "111" fixo colidiria com conta real
		const first = uid("NO")
		const second = uid("NO")

		await syncUserNrOrdem(db, { userId, email, nrOrdem: first })
		expect((await fetchSisubUserData(db, { userId }))?.nrOrdem).toBe(first)

		// reenvio do mesmo valor é idempotente
		await syncUserNrOrdem(db, { userId, email, nrOrdem: first })
		expect((await fetchSisubUserData(db, { userId }))?.nrOrdem).toBe(first)

		// `first` não localiza cadastro militar (erro de digitação) → segue corrigível
		await syncUserNrOrdem(db, { userId, email, nrOrdem: second })
		expect((await fetchSisubUserData(db, { userId }))?.nrOrdem).toBe(second)
	})

	test("syncUserNrOrdem trava o nrOrdem que já localiza cadastro militar (LGPD)", async () => {
		if (!reachable || !seeder || !db) return
		const nrOrdem = await seeder.seedUserMilitaryData({ sgPosto: "SO" })
		const userId = await seeder.seedAuthUser()
		seeder.track("user_data", userId)
		const email = `${uid("lock-")}@example.invalid`.toLowerCase()

		await syncUserNrOrdem(db, { userId, email, nrOrdem })
		// trocar por outro — ou limpar — é leitura de dado de terceiro em dois passos
		await expect(syncUserNrOrdem(db, { userId, email, nrOrdem: uid("NO") })).rejects.toMatchObject({ code: "NR_ORDEM_LOCKED" })
		await expect(syncUserNrOrdem(db, { userId, email, nrOrdem: "" })).rejects.toMatchObject({ code: "NR_ORDEM_LOCKED" })
		expect((await fetchSisubUserData(db, { userId }))?.nrOrdem).toBe(nrOrdem)
	})

	test("syncUserNrOrdem recusa nrOrdem já vinculado a outra conta", async () => {
		if (!reachable || !seeder || !db) return
		const nrOrdem = uid("NO")
		const owner = await seeder.seedAuthUser()
		await seeder.seedUserData({ id: owner, nrOrdem })

		const intruder = await seeder.seedAuthUser()
		seeder.track("user_data", intruder)
		const email = `${uid("taken-")}@example.invalid`.toLowerCase()
		await expect(syncUserNrOrdem(db, { userId: intruder, email, nrOrdem })).rejects.toMatchObject({ code: "NR_ORDEM_TAKEN" })
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
