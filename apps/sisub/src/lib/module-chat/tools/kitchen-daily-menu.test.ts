/**
 * `create_daily_menu` do chat passa pela operation do domínio, não pelo PostgREST.
 *
 * A versão anterior fazia `upsert(onConflict: "service_date,meal_type_id,kitchen_id")`, e a
 * unicidade do trio é o índice PARCIAL `daily_menu_active_unique` (`where deleted_at is null`):
 * sem o predicado o Postgres responde 42P10 em toda chamada. A idempotência real (devolver o
 * menu ativo que já existe) é coberta contra o banco em `planning.operations.test.ts`; aqui se
 * garante que a tool delega a ela e não volta a montar a escrita à mão.
 */

import { beforeEach, describe, expect, test, vi } from "vitest"
import type { UserPermission } from "@/types/domain/permissions"
import type { ToolContext } from "./shared"

const upsertDailyMenu = vi.fn()

vi.mock("@iefa/sisub-domain", async (importOriginal) => ({
	...(await importOriginal<typeof import("@iefa/sisub-domain")>()),
	upsertDailyMenu: (...args: unknown[]) => upsertDailyMenu(...args),
}))

const { kitchenTools } = await import("./kitchen")

const KITCHEN_ID = 5
const MEAL_TYPE_ID = "11111111-1111-4111-8111-111111111111"

function tool(name: string) {
	const def = kitchenTools.find((t) => t.name === name)
	if (!def) throw new Error(`tool ${name} não existe`)
	return def
}

function ctx(): ToolContext {
	const permissions = [{ module: "kitchen", level: 2, kitchen_id: KITCHEN_ID, mess_hall_id: null, unit_id: null }] as unknown as UserPermission[]
	return {
		userId: "user-1",
		permissions,
		module: "kitchen",
		// Qualquer acesso ao PostgREST aqui é regressão: a escrita é da operation.
		supabase: new Proxy({}, { get: () => () => expect.unreachable("create_daily_menu não usa o PostgREST") }) as never,
		db: { tag: "db" } as never,
	}
}

describe("create_daily_menu", () => {
	beforeEach(() => upsertDailyMenu.mockReset())

	test("delega a upsertDailyMenu com a entrada traduzida e devolve o que ela devolve", async () => {
		const menu = [{ id: "menu-1", kitchen_id: KITCHEN_ID, service_date: "2099-03-01", meal_type_id: MEAL_TYPE_ID, status: "PLANNED" }]
		upsertDailyMenu.mockResolvedValue(menu)
		const context = ctx()

		const result = await tool("create_daily_menu").handler(
			{ kitchenId: KITCHEN_ID, date: "2099-03-01", mealTypeId: ` ${MEAL_TYPE_ID} `, forecastedHeadcount: 40 },
			context
		)

		expect(result).toEqual({ success: true, data: menu })
		expect(upsertDailyMenu).toHaveBeenCalledTimes(1)
		const [db, userCtx, input] = upsertDailyMenu.mock.calls[0]
		expect(db).toBe(context.db)
		expect(userCtx).toMatchObject({ userId: "user-1", aal: 1 })
		expect(input).toEqual({ kitchenId: KITCHEN_ID, serviceDate: "2099-03-01", mealTypeId: MEAL_TYPE_ID, forecastedHeadcount: 40 })
	})

	test("sem previsão de comensais, o campo não vai para a operation", async () => {
		upsertDailyMenu.mockResolvedValue([])

		await tool("create_daily_menu").handler({ kitchenId: KITCHEN_ID, date: "2099-03-01", mealTypeId: MEAL_TYPE_ID }, ctx())

		expect(upsertDailyMenu.mock.calls[0][2]).toEqual({ kitchenId: KITCHEN_ID, serviceDate: "2099-03-01", mealTypeId: MEAL_TYPE_ID })
	})

	test("mealTypeId que não é UUID é recusado antes de chegar ao banco", async () => {
		await expect(tool("create_daily_menu").handler({ kitchenId: KITCHEN_ID, date: "2099-03-01", mealTypeId: "almoco" }, ctx())).rejects.toThrow()
		expect(upsertDailyMenu).not.toHaveBeenCalled()
	})
})
