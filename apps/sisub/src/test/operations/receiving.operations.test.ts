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
							(receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost)
						values (${receipt.id}, ${ingredient.id}, 60, 60, 5)
						returning id`
					// Lote é linha filha desde 20260901120200 — uma entrega traz caixas
					// de validades diferentes, e é a validade que dirige o FEFO.
					await tx`
						insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
						values (${item.id}, 'L-RECV-1', '2027-06-30', 60, 5)`

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

	test("recebido a MENOR que o faturado sai efetivado JÁ com a pendência fiscal — na mesma transação", async () => {
		// Antes de 20260918210000 a pendência era gravada pelo servidor DEPOIS da
		// RPC: entre os dois comandos o recebimento estava efetivado e liquidável.
		// Aqui a função sozinha tem de deixá-lo pendente.
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-FISC', 'unit teste fiscal') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha fiscal') returning id`
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ TESTE FISC', 'KG') returning id`

					const finalize = async (lines: Array<{ invoiced: number | null; received: number; cost: number | null }>) => {
						const [receipt] = await tx`insert into inventory.goods_receipt (kitchen_id) values (${kitchenRow.id}) returning id`
						for (const line of lines) {
							await tx`
								insert into inventory.goods_receipt_item
									(receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost, divergence_reason)
								values (${receipt.id}, ${ingredient.id}, ${line.invoiced}, ${line.received}, ${line.cost},
									-- linha que difere da nota precisa de motivo para efetivar (20260920250000)
									${line.invoiced != null && line.invoiced !== line.received ? "Divergência de teste" : null})`
						}
						await tx`update inventory.goods_receipt set status = 'provisional', provisional_at = now() where id = ${receipt.id}`
						await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
						const [row] = await tx`select fiscal_pending, fiscal_pending_value, definitive_at from inventory.goods_receipt where id = ${receipt.id}`
						return row
					}

					// falta de 2 × 2,50 = 5,00; a SOBRA da segunda linha não compensa;
					// linha sem quantidade faturada não entra
					const short = await finalize([
						{ invoiced: 10, received: 8, cost: 2.5 },
						{ invoiced: 5, received: 6, cost: 3 },
						{ invoiced: null, received: 4, cost: 1 },
					])
					expect(short.definitive_at).not.toBeNull()
					expect(short.fiscal_pending).toBe(true)
					expect(Number(short.fiscal_pending_value)).toBe(5)

					// entregue inteiro: nenhuma pendência
					const whole = await finalize([{ invoiced: 10, received: 10, cost: 2.5 }])
					expect(whole.fiscal_pending).toBe(false)

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 30_000)

	test("conferência por leitura: total e lotes saem dos eventos (20260920240000)", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-CONF', 'unit teste conferência') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha conferência') returning id`
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('LEITE TESTE CONF', 'L') returning id`
					const [receipt] = await tx`insert into inventory.goods_receipt (kitchen_id) values (${kitchenRow.id}) returning id`
					// como a importação da nota deixa a linha: faturado 10, recebido 10, lote da nota com 10
					const [item] = await tx`
						insert into inventory.goods_receipt_item (receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost)
						values (${receipt.id}, ${ingredient.id}, 10, 10, 4) returning id`
					await tx`insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, quantity_base, unit_cost)
						values (${item.id}, 'NF-L9', 10, 4)`

					let n = 0
					const event = async (method: string, quantity: number, lotCode: string | null = null) => {
						n += 1
						const [row] = await tx`
							insert into inventory.receipt_scan_event (receipt_id, receipt_item_id, client_event_id, method, quantity_base, lot_code, expiry_date)
							values (${receipt.id}, ${item.id}, ${`ev-conf-${n}`}, ${method}, ${quantity}, ${lotCode}, ${lotCode ? "2027-01-31" : null})
							returning id`
						return row.id as string
					}
					const reverse = async (eventId: string) => {
						n += 1
						await tx`
							insert into inventory.receipt_scan_event (receipt_id, receipt_item_id, client_event_id, method, quantity_base, reversed_event_id)
							values (${receipt.id}, ${item.id}, ${`ev-conf-${n}`}, 'reversal', 0, ${eventId})`
					}
					const state = async () => {
						const [{ sync_receipt_line: total }] = await tx`select inventory.sync_receipt_line(${item.id})`
						const lots = await tx`select lot_code, quantity_base from inventory.goods_receipt_item_lot where receipt_item_id = ${item.id} order by lot_code`
						const [line] = await tx`select received_qty_base, divergence_reason from inventory.goods_receipt_item where id = ${item.id}`
						return {
							total: Number(total),
							received: Number(line.received_qty_base),
							reason: line.divergence_reason as string | null,
							lots: Object.fromEntries(lots.map((lot) => [lot.lot_code as string, Number(lot.quantity_base)])) as Record<string, number>,
						}
					}

					// leitura simples de 4: o lote da nota acompanha (antes ficava 10 e a efetivação travava)
					await event("scanner", 4)
					expect(await state()).toMatchObject({ total: 4, received: 4, lots: { "NF-L9": 4 } })

					// etiqueta GS1 com lote: o lote lido nasce na tabela de lotes
					await event("scanner", 3, "GS1-L1")
					expect(await state()).toMatchObject({ total: 7, lots: { "GS1-L1": 3, "NF-L9": 4 } })

					// total informado: supera as leituras de antes — inclusive o lote lido
					const typed = await event("typed", 6)
					expect(await state()).toMatchObject({ total: 6, lots: { "NF-L9": 6 } })

					// leitura DEPOIS do total soma a ele (a regra antiga deixava o total vencer)
					await event("scanner", 2)
					expect(await state()).toMatchObject({ total: 8, lots: { "NF-L9": 8 } })

					// recusa: total zero, lotes zerados (ficam como registro — 20260920250000),
					// motivo fica enquanto a recusa estiver viva
					await tx`update inventory.goods_receipt_item set divergence_reason = 'Recusado: Avaria' where id = ${item.id}`
					const refusal = await event("refusal", 0)
					const refused = await state()
					expect(refused).toMatchObject({ total: 0, reason: "Recusado: Avaria" })
					expect(refused.lots).toEqual({ "GS1-L1": 0, "NF-L9": 0 })

					// desfeita a recusa, volta o total de antes e o motivo "Recusado:" sai
					await reverse(refusal)
					const restored = await state()
					expect(restored.total).toBe(8)
					expect(restored.reason).toBeNull()
					expect(Object.values(restored.lots).reduce((a, b) => a + b, 0)).toBe(8)

					// desfeito o total informado, valem as leituras de antes dele de novo
					await reverse(typed)
					expect((await state()).total).toBe(4 + 3 + 2)

					// e a efetivação fecha: a soma dos lotes bate com o conferido. A falta de
					// 1 precisa de motivo — a efetivação recusa sem ele (20260920250000)
					await tx`update inventory.goods_receipt set status = 'provisional', provisional_at = now() where id = ${receipt.id}`
					await expect(tx.savepoint((sp) => sp`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`)).rejects.toThrow(/LEITE TESTE CONF/)
					await tx`update inventory.goods_receipt_item set divergence_reason = 'Falta de 1 L' where id = ${item.id}`
					const [finalized] = await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
					expect(Number(finalized.movements)).toBe(2)

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 30_000)

	test("conferência atômica: lote da nota preservado, arredondamento, aceitação em massa e motivo sob a trava (20260920250000)", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-ATOM', 'unit teste atômica') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha atômica') returning id`
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('QUEIJO TESTE ATOM', 'KG') returning id`
					const [nfe] = await tx`insert into inventory.nfe_document (access_key) values (${`ZZTESTATOM${"0".repeat(34)}`}) returning id`
					const [nfeItem] = await tx`
						insert into inventory.nfe_item (nfe_document_id, n_item, lot_code, expiry_date)
						values (${nfe.id}, 1, 'NF-LOTE-A', '2027-03-31') returning id`
					const [receipt] = await tx`insert into inventory.goods_receipt (kitchen_id) values (${kitchenRow.id}) returning id`
					const line = async (invoiced: number, nfeItemId: string | null = null) => {
						const [row] = await tx`
							insert into inventory.goods_receipt_item (receipt_id, ingredient_id, nfe_item_id, invoiced_qty_base, received_qty_base, unit_cost)
							values (${receipt.id}, ${ingredient.id}, ${nfeItemId}, ${invoiced}, ${invoiced}, 2) returning id`
						return row.id as string
					}
					// A: da nota, com o lote dela; B: caixas fracionadas; C: ninguém toca
					const a = await line(12, nfeItem.id)
					await tx`insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
						values (${a}, 'NF-LOTE-A', '2027-03-31', 12, 2)`
					const b = await line(10)
					const c = await line(5)

					const record = async (
						itemId: string,
						clientEventId: string,
						method: string,
						quantity: number,
						lotCode: string | null = null,
						reversedEventId: string | null = null,
						reason: string | null = null,
						expectedTotal: number | null = null
					) => {
						const [row] = await tx`
							select * from inventory.record_receipt_event(
								${receipt.id}::uuid, ${itemId}::uuid, ${clientEventId}::text, ${method}::text, ${quantity}::numeric, null::uuid,
								null::text, null::text, ${lotCode}::text, ${lotCode ? "2027-05-31" : null}::date, null::numeric, ${reversedEventId}::uuid, ${reason}::text, ${expectedTotal}::numeric)`
						return { duplicate: row.duplicate as boolean, eventId: row.event_id as string | null, total: Number(row.total) }
					}
					const lotsOf = async (itemId: string) => {
						const rows = await tx`select lot_code, expiry_date, quantity_base from inventory.goods_receipt_item_lot where receipt_item_id = ${itemId}`
						return Object.fromEntries(rows.map((lot) => [lot.lot_code as string, Number(lot.quantity_base)])) as Record<string, number>
					}
					const lineOf = async (itemId: string) => {
						const [row] = await tx`select received_qty_base, divergence_reason from inventory.goods_receipt_item where id = ${itemId}`
						return { received: Number(row.received_qty_base), reason: row.divergence_reason as string | null }
					}

					// ── A: a leitura GS1 da quantidade inteira em OUTRO lote não apaga o da nota ──
					const scanned = await record(a, "atom-a-1", "scanner", 12, "OUTRO-L")
					expect(scanned).toMatchObject({ duplicate: false, total: 12 })
					expect(await lotsOf(a)).toEqual({ "NF-LOTE-A": 0, "OUTRO-L": 12 })

					// reenvio da mesma leitura: reconhecido, sem somar, e a linha é recalculada
					expect(await record(a, "atom-a-1", "scanner", 12, "OUTRO-L")).toMatchObject({ duplicate: true, total: 12 })

					// recusa: tudo a zero, mas os dois lotes continuam lá — o da nota com a validade
					// (motivo e evento na mesma transação — 20260921170000)
					const refusal = await record(a, "atom-a-2", "refusal", 0, null, null, "Recusado: Avaria")
					expect(refusal.total).toBe(0)
					expect(await lineOf(a)).toEqual({ received: 0, reason: "Recusado: Avaria" })
					expect(await lotsOf(a)).toEqual({ "NF-LOTE-A": 0, "OUTRO-L": 0 })
					const [invoiceLot] = await tx`select expiry_date from inventory.goods_receipt_item_lot where receipt_item_id = ${a} and lot_code = 'NF-LOTE-A'`
					expect(invoiceLot.expiry_date).not.toBeNull()

					// recusa desfeita: volta a leitura, e o motivo "Recusado:" sai
					expect((await record(a, "atom-a-3", "reversal", 0, null, refusal.eventId)).total).toBe(12)
					expect(await lineOf(a)).toEqual({ received: 12, reason: null })

					// desfazer duas vezes a mesma leitura: a segunda é duplicada, não erro
					expect((await record(a, "atom-a-4", "reversal", 0, null, scanned.eventId)).duplicate).toBe(false)
					expect((await record(a, "atom-a-5", "reversal", 0, null, scanned.eventId)).duplicate).toBe(true)
					// sem evento vivo, a linha volta ao faturado — e o resíduo volta ao lote DA NOTA
					expect(await lotsOf(a)).toEqual({ "NF-LOTE-A": 12, "OUTRO-L": 0 })

					// ── B: 3 caixas de 3,3333 somam 9,9999 — é o faturado, e o motivo antigo sai ──
					await record(b, "atom-b-1", "scanner", 3.3333)
					await tx`update inventory.goods_receipt_item set divergence_reason = 'Falta de caixas' where id = ${b}`
					await record(b, "atom-b-2", "scanner", 3.3333)
					expect((await record(b, "atom-b-3", "scanner", 3.3333)).total).toBe(10)
					expect(await lineOf(b)).toEqual({ received: 10, reason: null })
					expect(Object.values(await lotsOf(b))).toEqual([10])

					// ── aceitar conforme faturado: só as linhas sem evento vivo (A e C, não B) ──
					const [{ bulk_confirm_receipt: bulk }] = await tx`select inventory.bulk_confirm_receipt(${receipt.id}, 'atom-bulk', null)`
					expect(bulk).toBe(2)
					const [{ bulk_confirm_receipt: again }] = await tx`select inventory.bulk_confirm_receipt(${receipt.id}, 'atom-bulk', null)`
					expect(again).toBe(0)
					expect((await lineOf(c)).received).toBe(5)

					// ── D: a divisão de lotes do operador sobrevive ao recálculo (20260921170000) ──
					const [nfeItemD] = await tx`
						insert into inventory.nfe_item (nfe_document_id, n_item, lot_code, expiry_date)
						values (${nfe.id}, 2, 'NF-D', '2027-04-30') returning id`
					const d = await line(100, nfeItemD.id)
					await tx`insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
						values (${d}, 'NF-D', '2027-04-30', 60, 2), (${d}, 'L2', '2027-06-30', 40, 2)`
					expect((await record(d, "atom-d-1", "typed", 100)).total).toBe(100)
					expect(await lotsOf(d)).toEqual({ "NF-D": 60, L2: 40 })

					// ── E: o arredondamento fecha no lote LIDO, sem resto em lote sem validade ──
					const e = await line(10)
					for (const k of [1, 2, 3]) await record(e, `atom-e-${k}`, "scanner", 3.3333, "CX-1")
					expect(await lineOf(e)).toEqual({ received: 10, reason: null })
					expect(await lotsOf(e)).toEqual({ "CX-1": 10 })

					// ── F: o SEM-LOTE do sistema não conta como divisão do operador (20260921180000) ──
					const [nfeItemF] = await tx`
						insert into inventory.nfe_item (nfe_document_id, n_item, lot_code, expiry_date)
						values (${nfe.id}, 3, 'NF-F', '2027-02-28') returning id`
					const f = await line(100, nfeItemF.id)
					await tx`insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
						values (${f}, 'NF-F', '2027-02-28', 100, 2)`
					await record(f, "atom-f-1", "scanner", 50, "NF-F")
					const loose = await record(f, "atom-f-2", "scanner", 50)
					expect(Object.values(await lotsOf(f)).reduce((sum, qty) => sum + qty, 0)).toBe(100)
					await record(f, "atom-f-3", "reversal", 0, null, loose.eventId)
					// total informado com a quantidade que a tela mostrava: a linha está em 50
					await expect(
						tx.savepoint(
							(sp) => sp`
						select * from inventory.record_receipt_event(
							${receipt.id}::uuid, ${f}::uuid, 'atom-f-x', 'typed', 100::numeric, null::uuid,
							null, null, null, null, null, null, null, 100::numeric)`
						)
					).rejects.toThrow(/mudou enquanto você editava/)
					expect((await record(f, "atom-f-4", "typed", 100, null, null, null, 50)).total).toBe(100)
					const lotsF = await lotsOf(f)
					expect(lotsF["NF-F"]).toBe(100)
					expect(Object.values(lotsF).reduce((sum, qty) => sum + qty, 0)).toBe(100)

					// ── efetivação: falta sem motivo é recusada DENTRO da função ──
					await record(c, "atom-c-1", "typed", 4)
					await tx`update inventory.goods_receipt set status = 'provisional', provisional_at = now() where id = ${receipt.id}`
					await expect(tx.savepoint((sp) => sp`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`)).rejects.toThrow(
						/QUEIJO TESTE ATOM.*motivo/
					)
					await tx`update inventory.goods_receipt_item set divergence_reason = 'Falta de 1 KG' where id = ${c}`
					const [finalized] = await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
					// A (lote da nota), B, C, D (dois lotes), E e F; os lotes zerados não viram estoque
					expect(Number(finalized.movements)).toBe(7)
					const zeroStock = await tx`select 1 from inventory.stock_lot where goods_receipt_item_id = ${a} and lot_code = 'OUTRO-L'`
					expect(zeroStock).toHaveLength(0)
					const [status] = await tx`select status from inventory.goods_receipt where id = ${receipt.id}`
					expect(status.status).toBe("divergent")

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 30_000)
})
