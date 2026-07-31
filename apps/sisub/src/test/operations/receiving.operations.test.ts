/**
 * Integração — OF + recebimento em dois estágios (migration 20260729170000).
 *
 * Cadeia real: procurement_list → ARP → arp_item → empenho → OF → recebimento
 * provisório (SEM movimento) → definitivo (lote + movimento + status da OF).
 * Também: OF excedendo o empenho aborta; efetivar duas vezes aborta.
 * Transação com ROLLBACK final — nada persiste.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("goods receipt two-stage flow (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("OF → provisório (sem movimento) → definitivo (com movimento) — com rollback", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					// fixtures
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-RECV', 'unit teste recv') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha recv') returning id`
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('FEIJAO TESTE RECV', 'KG') returning id`
					const [list] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unit.id}, 'lista recv') returning id`
					const [arp] = await tx`
						insert into procurement.procurement_arp (unit_id, ata_id, numero_ata, uasg_gerenciadora)
						values (${unit.id}, ${list.id}, 'ATA-1', '160001') returning id`
					const [arpItem] = await tx`
						insert into procurement.procurement_arp_item (arp_id, numero_item, quantidade_homologada)
						values (${arp.id}, 1, 1000) returning id`
					const [empenho] = await tx`
						insert into finance.empenho (unit_id, arp_item_id, numero_empenho, data_empenho, quantidade_empenhada, valor_unitario, valor_total)
						values (${unit.id}, ${arpItem.id}, '2026NE000999', '2026-07-01', 100, 5, 500) returning id`

					// OF dentro do saldo
					const [of] = await tx`
						insert into procurement.supply_order (empenho_id, kitchen_id, sent_at, expected_delivery, status)
						values (${empenho.id}, ${kitchenRow.id}, '2026-07-10', '2026-07-20', 'sent') returning id`
					await tx`insert into procurement.supply_order_item (supply_order_id, arp_item_id, ordered_qty) values (${of.id}, ${arpItem.id}, 60)`

					// OF excedendo o empenho → trigger aborta
					await expect(
						tx.savepoint((sp) => sp`insert into procurement.supply_order_item (supply_order_id, ordered_qty) values (${of.id}, 50)`)
					).rejects.toThrow(/excede/)

					// recebimento draft + item
					const [receipt] = await tx`
						insert into inventory.goods_receipt (kitchen_id, supply_order_id, empenho_id)
						values (${kitchenRow.id}, ${of.id}, ${empenho.id}) returning id`
					const [item] = await tx`
						insert into inventory.goods_receipt_item
							(receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, lot_code, expiry_date, unit_cost)
						values (${receipt.id}, ${ingredient.id}, 60, 60, 'L-RECV-1', '2027-06-30', 5)
						returning id`

					// efetivar direto do draft → rejeita (precisa do provisório)
					await expect(tx.savepoint((sp) => sp`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`)).rejects.toThrow(/provisório/)

					// provisório: NÃO movimenta
					await tx`update inventory.goods_receipt set status = 'provisional', provisional_at = now() where id = ${receipt.id}`
					const movesBefore = await tx`select count(*)::int as n from inventory.stock_movement where goods_receipt_item_id = ${item.id}`
					expect(movesBefore[0]?.n).toBe(0)

					// definitivo: lote + movimento + OF recebida
					const [finalized] = await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
					expect(Number(finalized.movements)).toBe(1)

					const [move] = await tx`
						select type, quantity, unit_cost from inventory.stock_movement where goods_receipt_item_id = ${item.id}`
					expect(move.type).toBe("receipt")
					expect(Number(move.quantity)).toBe(60)
					expect(Number(move.unit_cost)).toBe(5)

					const [lotRow] = await tx`select lot_code, expiry_date from inventory.stock_lot where goods_receipt_item_id = ${item.id}`
					expect(lotRow.lot_code).toBe("L-RECV-1")

					const [ofRow] = await tx`select status from procurement.supply_order where id = ${of.id}`
					expect(ofRow.status).toBe("received")

					// efetivar de novo → rejeita
					await expect(tx.savepoint((sp) => sp`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`)).rejects.toThrow(/já efetivado/)

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 30_000)
})
