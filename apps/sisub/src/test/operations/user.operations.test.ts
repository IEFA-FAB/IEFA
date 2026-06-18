/**
 * Regressão happy-path — operations de USER DATA / sync (@iefa/sisub-domain).
 * Congela: fetch de user_data + military, nrOrdem (null em vazio), e o upsert
 * resiliente à colisão de email (delete da órfã + retry) ANTES da migração Drizzle.
 */

import { fetchMilitaryData, fetchSisubUserData, fetchUserNrOrdem, syncUserEmail, syncUserNrOrdem } from "@iefa/sisub-domain"
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest"
import { type AnyClient, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration } from "@/test/supabase"

describeSupabaseIntegration("user operations (regressão)", () => {
	let reachable = false
	let client: AnyClient
	let seeder: Seeder | null = null

	beforeAll(async () => {
		const s = await setupIntegration("user_data")
		reachable = s.reachable
		if (s.client) client = s.client
	}, 30_000)

	beforeEach(() => {
		seeder = reachable ? makeSeeder(client) : null
	})

	afterEach(async () => {
		await seeder?.cleanup()
	}, 60_000)

	test("fetchSisubUserData devolve o shape do contrato", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		const email = `${uid("u-")}@example.invalid`.toLowerCase()
		await seeder.seedUserData({ id: userId, email, nrOrdem: uid("NO") })

		const data = await fetchSisubUserData(client, { userId })
		expect(data).toMatchObject({ id: userId, email })
		for (const key of ["id", "email", "nrOrdem", "created_at", "default_mess_hall_id"]) {
			expect(data).toHaveProperty(key)
		}
	})

	test("fetchUserNrOrdem retorna string ou null (vazio → null)", async () => {
		if (!reachable || !seeder) return
		const withNr = await seeder.seedAuthUser()
		const nrOrdem = uid("NO")
		await seeder.seedUserData({ id: withNr, email: `${uid("u-")}@example.invalid`.toLowerCase(), nrOrdem })
		expect(await fetchUserNrOrdem(client, { userId: withNr })).toBe(nrOrdem)

		const without = await seeder.seedAuthUser()
		await seeder.seedUserData({ id: without, email: `${uid("u-")}@example.invalid`.toLowerCase() })
		expect(await fetchUserNrOrdem(client, { userId: without })).toBeNull()
	})

	test("fetchMilitaryData busca por nrOrdem", async () => {
		if (!reachable || !seeder) return
		const nrOrdem = await seeder.seedUserMilitaryData({ sgPosto: "SO", nmGuerra: uid("Guerra") })

		const mil = await fetchMilitaryData(client, { nrOrdem })
		expect(mil).not.toBeNull()
		expect(mil?.nrOrdem).toBe(nrOrdem)
		expect(mil?.sgPosto).toBe("SO")
	})

	test("syncUserNrOrdem faz upsert idempotente (cria e depois atualiza por id)", async () => {
		if (!reachable || !seeder) return
		const userId = await seeder.seedAuthUser()
		seeder.track("user_data", userId)
		const email = `${uid("sync-")}@example.invalid`.toLowerCase()

		await syncUserNrOrdem(client, { userId, email, nrOrdem: "111" })
		expect((await fetchSisubUserData(client, { userId }))?.nrOrdem).toBe("111")

		// segundo sync (mesmo id) atualiza nrOrdem
		await syncUserNrOrdem(client, { userId, email, nrOrdem: "222" })
		expect((await fetchSisubUserData(client, { userId }))?.nrOrdem).toBe("222")
	})

	test("syncUserEmail reivindica o email de uma linha órfã (delete + retry)", async () => {
		if (!reachable || !seeder) return
		const sharedEmail = `${uid("claim-")}@example.invalid`.toLowerCase()

		// Linha órfã: usuário A detém o email
		const userA = await seeder.seedAuthUser()
		await seeder.seedUserData({ id: userA, email: sharedEmail })

		// Usuário B reivindica o mesmo email
		const userB = await seeder.seedAuthUser()
		seeder.track("user_data", userB)

		await syncUserEmail(client, { userId: userB, email: sharedEmail })

		// B agora detém o email; a linha de A foi removida
		expect((await fetchSisubUserData(client, { userId: userB }))?.email).toBe(sharedEmail)
		expect(await fetchSisubUserData(client, { userId: userA })).toBeNull()
	})
})
