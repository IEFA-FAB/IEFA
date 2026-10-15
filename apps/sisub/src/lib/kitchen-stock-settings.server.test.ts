import { beforeEach, describe, expect, it, vi } from "vitest"

const rpc = vi.fn()

vi.mock("@/lib/supabase.server", () => ({
	getServerClient: (schema: string) => {
		expect(schema).toBe("inventory")
		return { rpc }
	},
}))

const { readKitchenStockSettings } = await import("./kitchen-stock-settings.server")

const SETTINGS = {
	kitchen_id: 7,
	segregation: "dual",
	adjustment_approval_value: 500,
	issue_tolerance_pct: 10,
	issue_tolerance_floor_value: 20,
	count_tolerance_pct: 5,
	count_tolerance_value: 50,
	updated_by: null,
	updated_at: "2026-10-15T00:00:00Z",
}

describe("readKitchenStockSettings", () => {
	beforeEach(() => rpc.mockReset())

	it("lê os valores de inventory.kitchen_settings(), que já resolve os defaults no banco", async () => {
		rpc.mockResolvedValue({ data: SETTINGS, error: null })

		expect(await readKitchenStockSettings(7)).toEqual(SETTINGS)
		expect(rpc).toHaveBeenCalledWith("kitchen_settings", { p_kitchen_id: 7 })
	})

	it("leitura que falha lança, em vez de cair num default de fábrica", async () => {
		rpc.mockResolvedValue({ data: null, error: { message: "permission denied", code: "42501" } })

		await expect(readKitchenStockSettings(7)).rejects.toThrow(/configuração de estoque/)
	})

	it("resposta vazia lança", async () => {
		rpc.mockResolvedValue({ data: null, error: null })

		await expect(readKitchenStockSettings(7)).rejects.toThrow(/resposta vazia/)
	})
})
