/**
 * Modo "replace" do `applyTemplate`: o soft-delete do planejamento das datas.
 *
 * O stub não executa SQL: o `update` é montado pelo Drizzle real (`drizzle.mock`) e o teste olha
 * o SQL gerado. O cardápio que já estava na lixeira não pode ter o `deleted_at` regravado.
 */

import { describe, expect, test } from "bun:test"
import { dailyMenuInKitchen, menuItemsInKitchen, type SisubDb, sisubSchema } from "@iefa/database/drizzle/sisub"
import { drizzle } from "drizzle-orm/postgres-js"
import { softDeletePlannedMenus } from "./templates.ts"

const mockDb = drizzle.mock({ schema: sisubSchema })

type CapturedUpdate = { table: unknown; sql: string; params: unknown[] }
type Tx = Parameters<typeof softDeletePlannedMenus>[0]

/** `select` devolve os cardápios ativos dados; cada `update` é registrado com o SQL real. */
function createFakeTx(activeMenuIds: string[]) {
	const updates: CapturedUpdate[] = []
	const tx = {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(activeMenuIds.map((id) => ({ id }))),
			}),
		}),
		update: (table: typeof dailyMenuInKitchen | typeof menuItemsInKitchen) => ({
			set: (values: Record<string, unknown>) => ({
				where: (where: never) => {
					const query = (mockDb as unknown as SisubDb).update(table).set(values).where(where).toSQL()
					updates.push({ table, sql: query.sql, params: query.params })
					return Promise.resolve([])
				},
			}),
		}),
	}
	return { tx: tx as unknown as Tx, updates }
}

describe("softDeletePlannedMenus", () => {
	test("o cardápio do dia vai para a lixeira só se estava ativo: o que já estava lá mantém a data", async () => {
		const { tx, updates } = createFakeTx(["menu-1", "menu-2"])
		await softDeletePlannedMenus(tx, ["2099-05-11"], 7)

		const menuUpdate = updates.find((u) => u.table === dailyMenuInKitchen)
		expect(menuUpdate).toBeDefined()
		// Recorta pelos ids ativos lidos antes, e ainda exige `deleted_at is null`. Pelo recorte de
		// data e cozinha (o de antes), regravava o `deleted_at` dos que já estavam na lixeira.
		expect(menuUpdate?.sql).toContain('"daily_menu"."deleted_at" is null')
		expect(menuUpdate?.sql).toContain('"daily_menu"."id" in (')
		expect(menuUpdate?.sql).not.toContain('"service_date"')
		expect(menuUpdate?.params).toEqual(expect.arrayContaining(["menu-1", "menu-2"]))
	})

	test("os itens caem junto, também só os ativos", async () => {
		const { tx, updates } = createFakeTx(["menu-1"])
		await softDeletePlannedMenus(tx, ["2099-05-11"], 7)
		const itemsUpdate = updates.find((u) => u.table === menuItemsInKitchen)
		expect(itemsUpdate?.sql).toContain('"menu_items"."deleted_at" is null')
		expect(itemsUpdate?.params).toContain("menu-1")
	})

	test("sem cardápio ativo nas datas, nada é regravado", async () => {
		const { tx, updates } = createFakeTx([])
		await softDeletePlannedMenus(tx, ["2099-05-11"], 7)
		expect(updates).toEqual([])
	})
})
