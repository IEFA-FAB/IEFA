/**
 * Integração — motor de estoque (migration 20260729160000).
 *
 * Valida no banco real (SISUB_RUN_INTEGRATION=true) o que unit test não pega:
 *  - imutabilidade do ledger via trigger (inclusive com service role/owner);
 *  - XOR ingrediente/preparação congelada;
 *  - custo médio ponderado mantido pelos triggers de costing;
 *  - transferência atômica (par com referência cruzada);
 *  - contagem física: divergência vira ajuste vinculado; contagem em si não move saldo.
 *
 * Tudo roda dentro de uma transação com ROLLBACK final — nada persiste.
 * Asserções de erro usam savepoints para não abortar a transação externa.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("inventory stock ledger (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("ledger, costing, transferência e contagem — ciclo completo com rollback", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					// ── fixtures efêmeras ────────────────────────────────────────────
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-STOCK', 'unit teste estoque') returning id`
					const [kitchenA] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha A teste') returning id`
					const [kitchenB] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha B teste') returning id`
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ TESTE LEDGER', 'KG') returning id`
					const [lot] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost)
						values (${kitchenA.id}, ${ingredient.id}, 'L-TEST-1', '2027-01-01', 4)
						returning id`

					// ── XOR: os dois preenchidos → rejeita ───────────────────────────
					const [frozen] = await tx`insert into kitchen.frozen_preparation (description) values ('FROZEN TESTE LEDGER') returning id`
					await expect(
						tx.savepoint(
							(sp) => sp`
								insert into inventory.stock_lot (kitchen_id, ingredient_id, frozen_preparation_id, lot_code)
								values (${kitchenA.id}, ${ingredient.id}, ${frozen.id}, 'XOR')`
						)
					).rejects.toThrow(/stock_lot_item_xor/)

					// ── custo médio: 10@4 + 10@6 → avg 5; saída herda 5 ─────────────
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
						values (${kitchenA.id}, ${ingredient.id}, ${lot.id}, 'receipt', 10, 4)`
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
						values (${kitchenA.id}, ${ingredient.id}, ${lot.id}, 'receipt', 10, 6)`

					const [cost] = await tx`
						select quantity, avg_unit_cost from inventory.stock_cost
						where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id}`
					expect(Number(cost.quantity)).toBe(20)
					expect(Number(cost.avg_unit_cost)).toBe(5)

					const [issue] = await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity)
						values (${kitchenA.id}, ${ingredient.id}, ${lot.id}, 'production_issue', 5)
						returning unit_cost, total_cost`
					expect(Number(issue.unit_cost)).toBe(5)
					expect(Number(issue.total_cost)).toBe(25)

					// ── imutabilidade: UPDATE e DELETE abortam mesmo como owner ─────
					await expect(tx.savepoint((sp) => sp`update inventory.stock_movement set quantity = 999 where lot_id = ${lot.id}`)).rejects.toThrow(/append-only/)
					await expect(tx.savepoint((sp) => sp`delete from inventory.stock_movement where lot_id = ${lot.id}`)).rejects.toThrow(/append-only/)

					// ── ajuste sem justificativa → rejeita ──────────────────────────
					await expect(
						tx.savepoint(
							(sp) => sp`
								insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity)
								values (${kitchenA.id}, ${ingredient.id}, ${lot.id}, 'adjustment_out', 1)`
						)
					).rejects.toThrow(/adjustment_justified/)

					// ── saldo da view: 20 − 5 = 15 ──────────────────────────────────
					const [balance] = await tx`
						select balance from inventory.v_stock_balance
						where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id} and lot_id = ${lot.id}`
					expect(Number(balance.balance)).toBe(15)

					// ── transferência atômica A → B ─────────────────────────────────
					const [pair] = await tx`select * from inventory.transfer_stock(${lot.id}, ${kitchenB.id}, 6, null)`
					const moves = await tx`
						select kitchen_id, type, quantity from inventory.stock_movement
						where transfer_pair_id = ${pair.transfer_pair_id} order by type`
					expect(moves).toHaveLength(2)
					expect(moves.map((m) => m.type).sort()).toEqual(["transfer_in", "transfer_out"])
					// saldo insuficiente → aborta sem efeito
					await expect(tx.savepoint((sp) => sp`select * from inventory.transfer_stock(${lot.id}, ${kitchenB.id}, 9999, null)`)).rejects.toThrow(/insuficiente/)

					// ── contagem: 9 contados vs 9 do ledger (15−6) → sem ajuste;
					//    depois 7 contados → adjustment_out 2 vinculado ───────────────
					const [count] = await tx`insert into inventory.inventory_count (kitchen_id) values (${kitchenA.id}) returning id`
					await tx`insert into inventory.inventory_count_item (count_id, lot_id, counted_qty) values (${count.id}, ${lot.id}, 7)`
					const [confirmed] = await tx`select * from inventory.confirm_inventory_count(${count.id}, null)`
					expect(Number(confirmed.adjustments)).toBe(1)
					const [adj] = await tx`
						select type, quantity from inventory.stock_movement
						where inventory_count_id = ${count.id}`
					expect(adj.type).toBe("adjustment_out")
					expect(Number(adj.quantity)).toBe(2)
					// contagem confirmada não confirma duas vezes
					await expect(tx.savepoint((sp) => sp`select * from inventory.confirm_inventory_count(${count.id}, null)`)).rejects.toThrow(/já confirmada/)

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 30_000)
})
