// Casos de teste de `.opengrep/rules/blind-count-reads.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/blind-count-reads.yaml .opengrep/rules/__fixtures__/blind-count-reads.ts

declare const createServerFn: any
declare const z: any
declare const ctx: any
declare function inventory(): any
declare function hiddenByBlindCount(kitchenId: number, ctx: unknown): Promise<Set<string>>
declare function assertNoBlindCountHides(kitchenId: number, ctx: unknown, what: string): Promise<void>
declare function lotBalancesForIngredients(kitchenId: number, ids: string[]): Promise<unknown>

// ruleid: stock-balance-read-without-blind-count
export const leaksExpiry = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async ({ data }: { data: { kitchenId: number } }) => {
		return inventory().from("v_lot_expiry").select("balance").eq("kitchen_id", data.kitchenId)
	})

// ruleid: stock-balance-read-without-blind-count
export const leaksHelper = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async ({ data }: { data: { kitchenId: number } }) => {
		return lotBalancesForIngredients(data.kitchenId, [])
	})

// ok: stock-balance-read-without-blind-count
export const masksBalance = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async ({ data }: { data: { kitchenId: number } }) => {
		const hidden = await hiddenByBlindCount(data.kitchenId, ctx)
		const rows = await inventory().from("v_stock_balance").select("*").eq("kitchen_id", data.kitchenId)
		return rows.filter((row: { ingredient_id: string }) => !hidden.has(row.ingredient_id))
	})

// ok: stock-balance-read-without-blind-count
export const refusesWholeReport = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async ({ data }: { data: { kitchenId: number } }) => {
		await assertNoBlindCountHides(data.kitchenId, ctx, "O relatório")
		return inventory().from("v_stock_balance").select("*").eq("kitchen_id", data.kitchenId)
	})

// ok: stock-balance-read-without-blind-count
export const aggregateBadge = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async ({ data }: { data: { kitchenId: number } }) => {
		// blind-count-exempt: contagem de lotes por faixa para o badge do menu, sem item
		return inventory().from("v_lot_expiry").select("band").eq("kitchen_id", data.kitchenId)
	})

// ok: stock-balance-read-without-blind-count
export const writes = createServerFn({ method: "POST" })
	.validator(z.object({}))
	.handler(async ({ data }: { data: { kitchenId: number } }) => {
		return inventory().from("v_stock_balance").select("*").eq("kitchen_id", data.kitchenId)
	})
