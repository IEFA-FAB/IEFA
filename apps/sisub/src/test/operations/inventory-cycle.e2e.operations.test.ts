/**
 * E2E do ciclo completo de estoque contra o banco REAL migrado — uma única
 * história atravessando todas as fases novas, na ordem do fluxo de negócio:
 *
 *   NF-e (XML real → parser do apps/api) → matching GTIN (pipeline puro +
 *   candidatos do banco) → empenho/OF → recebimento provisório (sem movimento)
 *   → definitivo com divergência (lote + ledger + custo + OF parcial) → baixa
 *   FEFO por produção (fn SQL com lock) → sobra congelada → transferência
 *   entre cozinhas → contagem física (ajuste) → fechamento MCASP (lock de
 *   período) → conferência balancete = ledger.
 *
 * Tudo numa transação com ROLLBACK — nada persiste no banco.
 */

import { allocateFefo, calculateNetNeed, computeTheoreticalConsumption, matchNfeItem } from "@iefa/sisub-domain"
import { parseGtin } from "@iefa/sisub-domain/gtin"
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { parseNfeXml } from "../../../../api/src/workers/nfe/parse.ts"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

const GTIN13 = "7891000315507"
const GTIN14 = "07891000315507"
// DV válido: o parser passou a conferir o dígito verificador da chave, e a
// chave antiga do fixture não fechava
const ACCESS_KEY = "35260712345678000199550010000098761000098769"

const NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
	<NFe><infNFe Id="NFe${ACCESS_KEY}" versao="4.00">
		<ide><dhEmi>2026-07-25T09:00:00-03:00</dhEmi><mod>55</mod><tpAmb>1</tpAmb><finNFe>1</finNFe></ide>
		<emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor E2E LTDA</xNome></emit>
		<dest><CNPJ>98765432000188</CNPJ></dest>
		<det nItem="1"><prod>
			<cProd>ARZ-E2E</cProd><cEAN>${GTIN13}</cEAN><xProd>ARROZ E2E FD 10x5KG</xProd>
			<NCM>10063021</NCM><CFOP>5102</CFOP>
			<uCom>FD</uCom><qCom>10.0000</qCom><vUnCom>125.0000</vUnCom>
			<cEANTrib>${GTIN13}</cEANTrib>
			<rastro><nLote>L-E2E-1</nLote><qLote>50</qLote><dFab>2026-07-01</dFab><dVal>2027-07-01</dVal></rastro>
		</prod></det>
		<total><ICMSTot><vNF>1250.00</vNF></ICMSTot></total>
	</infNFe>
	<Signature><SignedInfo><Reference><DigestValue>E2E-DIGEST</DigestValue></Reference></SignedInfo></Signature>
	</NFe>
	<protNFe><infProt><chNFe>${ACCESS_KEY}</chNFe><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo><nProt>135260000099999</nProt><digVal>E2E-DIGEST</digVal><tpAmb>1</tpAmb></infProt></protNFe>
</nfeProc>`

describeIf("inventory full cycle E2E (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("NF-e → matching → OF → recebimento → FEFO → sobra → transferência → contagem → fechamento", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					// ════ Fase 0 — catálogo (fixtures efêmeras) ═══════════════════════
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZE2E-CYCLE', 'unit e2e') returning id`
					const [kitchenA] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha E2E A') returning id`
					const [kitchenB] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha E2E B') returning id`
					const [ingredient] =
						await tx`insert into kitchen.ingredient (description, measure_unit, correction_factor) values ('ARROZ E2E', 'KG', 1.1) returning id`
					const [purchaseItem] =
						await tx`insert into procurement.purchase_item (description, purchase_measure_unit, unit_price, conservation_class, storage_temp_max_c) values ('ARROZ E2E FD 5KG', 'FD', 125, 'congelado', -12) returning id`
					await tx`insert into procurement.purchase_item_ingredient (purchase_item_id, ingredient_id, conversion_factor, is_default) values (${purchaseItem.id}, ${ingredient.id}, 5, true)`
					// GTIN + SKU: fardo de 5 KG
					await tx`insert into gs1_integration.gtin (gtin, description, net_content, net_content_unit, source) values (${GTIN14}, 'ARROZ E2E 5KG', 5, 'KG', 'manual')`
					const [sku] = await tx`
						insert into kitchen.ingredient_item (description, ingredient_id, purchase_item_id, gtin, unit_content_quantity)
						values ('ARROZ E2E FD', ${ingredient.id}, ${purchaseItem.id}, ${GTIN14}, 5) returning id`

					// ════ Fase 2c — NF-e: parser REAL + persistência + matching ══════
					const parsed = parseNfeXml(NFE_XML)
					expect(parsed.accessKey).toBe(ACCESS_KEY)
					expect(parsed.items[0]?.gtin).toBe(GTIN14)
					expect(parseGtin(parsed.items[0]?.gtin ?? "")).toBe(GTIN14)

					const [nfeDoc] = await tx`
						insert into inventory.nfe_document (access_key, supplier_cnpj, supplier_name, dest_cnpj, issued_at, total_value, xml, kitchen_id)
						values (${parsed.accessKey}, ${parsed.supplierCnpj}, ${parsed.supplierName}, ${parsed.destCnpj}, ${parsed.issuedAt}, ${parsed.totalValue}, ${NFE_XML}, ${kitchenA.id})
						returning id`
					const item = parsed.items[0]
					if (!item) throw new Error("parser sem itens")
					const [nfeItem] = await tx`
						insert into inventory.nfe_item (nfe_document_id, n_item, supplier_code, description, gtin, ncm, commercial_unit, commercial_qty, unit_price, lot_code, expiry_date)
						values (${nfeDoc.id}, ${item.nItem}, ${item.supplierCode}, ${item.description}, ${item.gtin}, ${item.ncm}, ${item.commercialUnit}, ${item.commercialQty}, ${item.unitPrice}, ${item.lotCode}, ${item.expiryDate})
						returning id`

					// matching: candidatos do banco → decisão pura (mesmo caminho da fn)
					const [link] = await tx`
						select id, purchase_item_id, ingredient_id, unit_content_quantity
						from kitchen.ingredient_item where gtin = ${GTIN14} and deleted_at is null`
					const match = matchNfeItem(
						{ gtin: item.gtin, gtinTrib: item.gtinTrib, supplierCode: item.supplierCode, commercialQty: item.commercialQty },
						{
							gtinLink: {
								ingredientItemId: link.id,
								purchaseItemId: link.purchase_item_id,
								ingredientId: link.ingredient_id,
								unitContentQuantity: Number(link.unit_content_quantity),
							},
							gtinNetContent: 5,
							supplierMapLink: null,
							supplierMapPurchaseItemId: null,
							suggestionPurchaseItemIds: [],
						}
					)
					expect(match.status).toBe("matched")
					expect(match.matchedQtyBase).toBe(50) // 10 FD × 5 KG
					await tx`
						update inventory.nfe_item set match_status = ${match.status}, ingredient_item_id = ${match.ingredientItemId},
							purchase_item_id = ${match.purchaseItemId}, ingredient_id = ${match.ingredientId}, matched_qty_base = ${match.matchedQtyBase}
						where id = ${nfeItem.id}`

					// ════ Fase 1/4 — empenho → OF ════════════════════════════════════
					const [list] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unit.id}, 'lista e2e') returning id`
					const [arp] =
						await tx`insert into procurement.procurement_arp (unit_id, ata_id, numero_ata, uasg_gerenciadora) values (${unit.id}, ${list.id}, 'ATA-E2E', '160099') returning id`
					const [arpItem] =
						await tx`insert into procurement.procurement_arp_item (arp_id, numero_item, quantidade_homologada, ni_fornecedor) values (${arp.id}, 1, 500, '12345678000199') returning id`
					const [empenho] = await tx`
						insert into finance.empenho (unit_id, arp_item_id, numero_empenho, data_empenho, quantidade_empenhada, valor_unitario, valor_total)
						values (${unit.id}, ${arpItem.id}, '2026NE00E2E1', '2026-07-20', 100, 25, 2500) returning id`
					const [supplyOrder] = await tx`
						insert into procurement.supply_order (empenho_id, kitchen_id, number, sent_at, expected_delivery, status)
						values (${empenho.id}, ${kitchenA.id}, 'OF-E2E-1', '2026-07-22', '2026-07-28', 'sent') returning id`
					await tx`insert into procurement.supply_order_item (supply_order_id, arp_item_id, purchase_item_id, ordered_qty, unit_price) values (${supplyOrder.id}, ${arpItem.id}, ${purchaseItem.id}, 50, 25)`

					// ════ Fase 4 — recebimento em 2 estágios (com divergência a menor) ═
					const [receipt] = await tx`
						insert into inventory.goods_receipt (kitchen_id, supply_order_id, nfe_document_id, empenho_id)
						values (${kitchenA.id}, ${supplyOrder.id}, ${nfeDoc.id}, ${empenho.id}) returning id`
					const [receiptItem] = await tx`
						insert into inventory.goods_receipt_item
							(receipt_id, nfe_item_id, ingredient_id, ingredient_item_id, purchase_item_id, invoiced_qty_base, received_qty_base, unit_cost, divergence_reason)
						values (${receipt.id}, ${nfeItem.id}, ${ingredient.id}, ${sku.id}, ${purchaseItem.id}, 50, 48, 2.5, 'Avaria em 2 KG no transporte')
						returning id`

					// A carga veio em DOIS lotes de validades diferentes — o caso que o
					// grão antigo (um lot_code por linha de item) não representava.
					await tx`
						insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base, unit_cost)
						values (${receiptItem.id}, 'L-E2E-1', '2027-07-01', 30, 2.5),
						       (${receiptItem.id}, 'L-E2E-2', '2026-12-01', 18, 2.5)`

					// definitivo direto do draft → bloqueado
					await expect(tx.savepoint((sp) => sp`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`)).rejects.toThrow(/provisório/)
					// provisório NÃO movimenta
					await tx`update inventory.goods_receipt set status = 'provisional', provisional_at = now() where id = ${receipt.id}`
					const [{ n: movesBefore }] = await tx`select count(*)::int as n from inventory.stock_movement where kitchen_id = ${kitchenA.id}`
					expect(movesBefore).toBe(0)

					// Soma dos lotes ≠ quantidade conferida → efetivação RECUSADA.
					// Sem esta guarda o ledger nasceria com saldo diferente do conferido.
					await expect(
						tx.savepoint(async (sp) => {
							await sp`update inventory.goods_receipt_item_lot set quantity_base = 10 where receipt_item_id = ${receiptItem.id} and lot_code = 'L-E2E-2'`
							return sp`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
						})
					).rejects.toThrow(/Soma dos lotes/)

					// definitivo: UM movimento por LOTE + custo + OF parcial + status divergente
					const [fin] = await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
					expect(Number(fin.movements)).toBe(2)
					const [grow] = await tx`select status from inventory.goods_receipt where id = ${receipt.id}`
					expect(grow.status).toBe("divergent") // divergência registrada
					const [ofRow] = await tx`select status from procurement.supply_order where id = ${supplyOrder.id}`
					expect(ofRow.status).toBe("partially_received") // 48 < 50
					const [cost] =
						await tx`select quantity, avg_unit_cost from inventory.stock_cost where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id}`
					expect(Number(cost.quantity)).toBe(48)
					expect(Number(cost.avg_unit_cost)).toBe(2.5)

					// As duas validades sobrevivem até o lote de estoque — é o que o
					// FEFO consome na ordem certa, e o que o grão antigo perdia.
					const stockLots = await tx`
						select lot_code, expiry_date, conservation_class from inventory.stock_lot
						where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id} order by expiry_date`
					expect(stockLots.map((row) => row.lot_code)).toEqual(["L-E2E-2", "L-E2E-1"])
					// Classe de conservação copiada da especificação de compra, congelada no lote.
					expect(stockLots.every((row) => row.conservation_class === "congelado")).toBe(true)

					// ════ Fase 5 — baixa FEFO a partir do SNAPSHOT do cardápio ════════
					const [mealType] = await tx`insert into kitchen.meal_type (name, kitchen_id) values ('Almoço E2E', ${kitchenA.id}) returning id`
					const [dailyMenu] =
						await tx`insert into kitchen.daily_menu (kitchen_id, service_date, meal_type_id) values (${kitchenA.id}, '2026-07-29', ${mealType.id}) returning id`
					const snapshot = {
						name: "Arroz branco E2E",
						portion_yield: 10,
						ingredients: [{ ingredient_id: ingredient.id, net_quantity: 5, ingredient: { description: "ARROZ E2E", measure_unit: "KG" } }],
					}
					const [menuItem] = await tx`
						insert into kitchen.menu_items (daily_menu_id, recipe, planned_portion_quantity) values (${dailyMenu.id}, ${tx.json(snapshot)}, 20) returning id`
					const [task] = await tx`
						insert into kitchen.production_task (kitchen_id, menu_item_id, production_date, status) values (${kitchenA.id}, ${menuItem.id}, '2026-07-29', 'DONE') returning id`

					const theoretical = computeTheoreticalConsumption(snapshot, 20)
					expect(theoretical[0]?.quantity).toBe(10) // 5 × 20/10

					// A alocação que VALE é a do banco (dentro da transação, com os
					// lotes travados). A do domínio é a previsão mostrada ao operador:
					// as duas têm que dar no mesmo lote, senão a tela mente.
					const lots = await tx`
						select lot_id, balance, expiry_date from inventory.v_stock_balance
						where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id} and balance > 0`
					const { allocations, shortfall } = allocateFefo(
						lots.map((l) => ({ lotId: l.lot_id as string, balance: Number(l.balance), expiryDate: l.expiry_date as string | null })),
						theoretical[0]?.quantity ?? 0
					)
					expect(shortfall).toBe(0)
					const linesPayload = [
						{
							kitchen_id: kitchenA.id,
							ingredient_id: ingredient.id,
							quantity: theoretical[0]?.quantity ?? 0,
							override_lot_id: null,
							justification: null,
						},
					]
					const [issued] = await tx`select * from inventory.register_production_issue(${task.id}, ${tx.json(linesPayload)}, null)`
					expect(Number(issued.movements)).toBe(1)
					const [issuedLot] = await tx`select lot_id from inventory.stock_movement where production_task_id = ${task.id} and type = 'production_issue'`
					expect(issuedLot.lot_id).toBe(allocations[0]?.lotId)
					// segunda confirmação da MESMA tarefa → bloqueada (lock + recheck)
					await expect(tx.savepoint((sp) => sp`select * from inventory.register_production_issue(${task.id}, ${tx.json(linesPayload)}, null)`)).rejects.toThrow(
						/já teve baixa/
					)
					// lote VENCIDO não entra na alocação: com saldo só em lote vencido,
					// a baixa cai inteira em "sem lote" em vez de consumir o vencido.
					// O vencimento é medido na data civil de Brasília, igual à função —
					// `current_date` é UTC, e entre 21h e meia-noite em São Paulo ele já
					// está no dia seguinte: `current_date - 1` seria o HOJE de Brasília,
					// e o lote "vencido" entraria na alocação. O teste rodava conforme a
					// hora do dia.
					await tx.savepoint(async (sp) => {
						const [vencido] = await sp`
							insert into kitchen.ingredient (description, measure_unit) values ('ARROZ VENCIDO E2E', 'KG') returning id`
						const [lotVencido] = await sp`
							insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost)
							values (${kitchenA.id}, ${vencido.id}, 'L-VENCIDO', ((now() at time zone 'America/Sao_Paulo')::date - 1), 3) returning id`
						await sp`
							insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
							values (${kitchenA.id}, ${vencido.id}, ${lotVencido.id}, 'receipt', 20, 3)`
						// menu_item próprio: production_task tem UNIQUE(menu_item_id)
						const [menuItemVencido] = await sp`
							insert into kitchen.menu_items (daily_menu_id, recipe, planned_portion_quantity)
							values (${dailyMenu.id}, ${sp.json(snapshot)}, 20) returning id`
						const [taskVencido] = await sp`
							insert into kitchen.production_task (kitchen_id, menu_item_id, production_date, status)
							values (${kitchenA.id}, ${menuItemVencido.id}, '2026-07-30', 'DONE') returning id`
						await sp`select * from inventory.register_production_issue(${taskVencido.id}, ${sp.json([
							{ kitchen_id: kitchenA.id, ingredient_id: vencido.id, quantity: 4, override_lot_id: null, justification: null },
						])}, null)`
						const moves = await sp`
							select lot_id, quantity from inventory.stock_movement
							where production_task_id = ${taskVencido.id} and type = 'production_issue'`
						expect(moves).toHaveLength(1)
						expect(moves[0]?.lot_id).toBeNull()
						expect(Number(moves[0]?.quantity)).toBe(4)
					})
					// saída valorada ao custo médio (2.5)
					const [issueMove] =
						await tx`select unit_cost, total_cost from inventory.stock_movement where production_task_id = ${task.id} and type = 'production_issue'`
					expect(Number(issueMove.unit_cost)).toBe(2.5)
					expect(Number(issueMove.total_cost)).toBe(25)

					// ════ Fase 5 — sobra congelada (atômica) ═════════════════════════
					const [frozen] = await tx`insert into kitchen.frozen_preparation (description, shelf_life_days) values ('ARROZ PRONTO E2E', 30) returning id`
					const [leftover] =
						await tx`select * from inventory.register_leftover(${kitchenA.id}, ${frozen.id}, 'SOBRA-2026-07-29', '2026-08-28', 2, ${task.id}, false, null, null)`
					const [frozenBal] = await tx`
						select balance from inventory.v_stock_balance where kitchen_id = ${kitchenA.id} and frozen_preparation_id = ${frozen.id} and lot_id = ${leftover.lot_id}`
					expect(Number(frozenBal.balance)).toBe(2)

					// ════ Fase 3 — transferência A → B (par atômico) ═════════════════
					// Com dois lotes em saldo, `order by expiry_date` deixa a escolha
					// determinística: sem ela o planner devolve qualquer um e o teste
					// passa ou falha conforme o dia.
					const [lotA] = await tx`
						select lot_id, balance from inventory.v_stock_balance
						where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id} and balance > 0
						order by expiry_date`
					await tx`select * from inventory.transfer_stock(${lotA.lot_id}, ${kitchenB.id}, 5, null)`
					const [balB] = await tx`
						select coalesce(sum(balance), 0) as b from inventory.v_stock_balance where kitchen_id = ${kitchenB.id} and ingredient_id = ${ingredient.id}`
					expect(Number(balB.b)).toBe(5)
					// o que sai de A entra em B pelo MESMO valor: o destino entrava ao
					// unit_cost do lote (informativo) e o valor se perdia no caminho
					const transferPair = await tx`
						select type, unit_cost, total_cost from inventory.stock_movement
						where transfer_pair_id = (select transfer_pair_id from inventory.stock_movement where lot_id = ${lotA.lot_id} and type = 'transfer_out' order by created_at desc limit 1)`
					const out = transferPair.find((row) => row.type === "transfer_out")
					const into = transferPair.find((row) => row.type === "transfer_in")
					expect(Number(into?.unit_cost)).toBe(Number(out?.unit_cost))
					expect(Number(into?.total_cost)).toBe(Number(out?.total_cost))

					// ════ Fase 3 — contagem física: 30 contados vs 33 no ledger ══════
					// A: 48 recebidos (em DOIS lotes) − 10 produção − 5 transferidos = 33.
					// A contagem é do estoque inteiro, não de um lote: contar só um deixaria
					// o outro intacto e o saldo total nunca fecharia no valor contado.
					const saldos = await tx`
						select lot_id, balance from inventory.v_stock_balance
						where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id} and balance > 0
						order by expiry_date`
					expect(saldos).toHaveLength(2)
					expect(saldos.reduce((total, row) => total + Number(row.balance), 0)).toBe(33)

					const [count] = await tx`insert into inventory.inventory_count (kitchen_id) values (${kitchenA.id}) returning id`
					// O lote que vence primeiro não foi achado na prateleira (0); o outro bate.
					await tx`
						insert into inventory.inventory_count_item (count_id, lot_id, counted_qty)
						values (${count.id}, ${saldos[0]?.lot_id}, 0), (${count.id}, ${saldos[1]?.lot_id}, 30)`
					const [counted] = await tx`select * from inventory.confirm_inventory_count(${count.id}, null)`
					// sobra de contagem entra ao CUSTO MÉDIO, não a R$ 0 — entrar a zero
					// diluía o custo médio de todo o estoque do item. O savepoint é
					// desfeito no fim (sentinela) para não mexer no saldo que as
					// asserções seguintes conferem.
					const ROLLBACK_SOBRA = "rollback-sobra"
					await expect(
						tx.savepoint(async (sp) => {
							const [avgBefore] = await sp`
								select avg_unit_cost from inventory.stock_cost where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id}`
							const [sobraCount] = await sp`insert into inventory.inventory_count (kitchen_id) values (${kitchenA.id}) returning id`
							await sp`
								insert into inventory.inventory_count_item (count_id, lot_id, counted_qty)
								values (${sobraCount.id}, ${saldos[1]?.lot_id}, 32)`
							await sp`select * from inventory.confirm_inventory_count(${sobraCount.id}, null)`
							const [ajuste] = await sp`
								select unit_cost from inventory.stock_movement
								where inventory_count_id = ${sobraCount.id} and type = 'adjustment_in'`
							expect(Number(ajuste.unit_cost)).toBe(Number(avgBefore.avg_unit_cost))
							const [avgAfter] = await sp`
								select avg_unit_cost from inventory.stock_cost where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id}`
							expect(Number(avgAfter.avg_unit_cost)).toBe(Number(avgBefore.avg_unit_cost))
							throw new Error(ROLLBACK_SOBRA)
						})
					).rejects.toThrow(ROLLBACK_SOBRA)
					// Um ajuste só: o lote conferido sem divergência não gera movimento.
					expect(Number(counted.adjustments)).toBe(1)
					const [balA] = await tx`
						select coalesce(sum(balance), 0) as b from inventory.v_stock_balance where kitchen_id = ${kitchenA.id} and ingredient_id = ${ingredient.id}`
					expect(Number(balA.b)).toBe(30)

					// ════ Fase 6 — fechamento MCASP + lock de período ════════════════
					const competencia = new Date().toISOString().substring(0, 7)
					const [closing] = await tx`select * from inventory.close_month(${kitchenA.id}, ${`${competencia}-01`}, null)`
					const [closingRow] = await tx`select closing_value, total_in, total_out from inventory.monthly_closing where id = ${closing.closing_id}`
					// balancete = ledger: valor final derivado só dos movimentos
					const [ledgerValue] = await tx`
						select coalesce(sum(case when type in ('receipt','leftover_return','transfer_in','adjustment_in') then total_cost else -total_cost end), 0) as v
						from inventory.stock_movement where kitchen_id = ${kitchenA.id}`
					expect(Number(closingRow.closing_value)).toBe(Number(ledgerValue.v))
					// lançamento retroativo na competência fechada → bloqueado
					await expect(
						tx.savepoint(
							(sp) => sp`
								insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
								values (${kitchenA.id}, ${ingredient.id}, ${lotA.lot_id}, 'receipt', 1, 1)`
						)
					).rejects.toThrow(/fechada/)

					// ════ Fase 7 — necessidade líquida coerente com o estado real ════
					// demanda 100 (já com FC) − estoque A (30) − trânsito restante (0: OF virou parcial mas o recebido saiu) = 70
					expect(calculateNetNeed({ grossDemand: 100, availableStock: Number(balA.b), inTransit: 0 })).toBe(70)

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
