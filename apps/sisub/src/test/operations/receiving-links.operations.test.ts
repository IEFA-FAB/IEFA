/**
 * Integração — recebimento sem NF-e, vínculo posterior e designação (change
 * `sisub-flexible-expense-execution`, D5/D6/D8/D9; migration 20260926215000).
 *
 * Cada caso roda numa transação com ROLLBACK final; a leitura das pendências usa o Drizzle
 * ligado à MESMA transação, para enxergar o que ela gravou. O único dado que sobrevive à
 * transação é o usuário de auth do seeder (fiscal/gestor designado), apagado no `afterAll`.
 *
 * Depende de 20260926214000 (acquisition, empenho_item) e 20260926215000 aplicadas: é o que
 * `inventory.designations_covering` lê. Edge cases: EST-REC-06..10, GU-DES-01, GU-EXE-04.
 */

import { sisubSchema } from "@iefa/database/drizzle/sisub"
import {
	DEFINITIVE_RECEIPT_ROLES,
	designationMissingMessage,
	endDesignation,
	fetchReceivingPendingStatus,
	matchReceiptLinesToInvoice,
	PROVISIONAL_RECEIPT_ROLES,
	type ReceiptPendingKind,
} from "@iefa/sisub-domain"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { liquidacaoLinkProblems } from "@/lib/invoice-gate"
import { decideReceiptInvoice } from "@/lib/receipt-invoice-gate"
import { type AnyClient, fullAccessCtx, makeSeeder, type Seeder, setupIntegration, uid } from "@/test/operations-fixtures"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "@/test/supabase"

class Rollback extends Error {}

type Tx = postgres.TransactionSql

describeSupabaseIntegration("recebimento sem NF-e, vínculo posterior e designação (DB)", () => {
	let sql: postgres.Sql | null = null
	let seeder: Seeder | null = null
	let personId = ""

	beforeAll(async () => {
		// sonda padrão (`recipes`): `goods_receipt` não está no mapa de schemas do seeder, e a
		// sonda no schema errado desligaria a suíte em silêncio
		const setup = await setupIntegration()
		const url = getSisubDatabaseUrl()
		if (!setup.reachable || !setup.client || !url) return
		seeder = makeSeeder(setup.client as AnyClient)
		personId = await seeder.seedAuthUser()
		sql = postgres(url, { max: 1, prepare: false })
	}, 30_000)

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
		await seeder?.cleanup()
	}, 60_000)

	/** Roda o caso numa transação que sempre desfaz. */
	async function inRollback(body: (tx: Tx) => Promise<void>) {
		if (!sql) return
		await expect(
			sql
				.begin(async (tx) => {
					await body(tx)
					throw new Rollback()
				})
				.catch((error) => {
					if (error instanceof Rollback) return "rolled-back"
					throw error
				})
		).resolves.toBe("rolled-back")
	}

	/**
	 * O Drizzle das operações de domínio, na mesma transação. O `TransactionSql` do postgres.js
	 * não carrega o `options` do cliente, que o driver do Drizzle lê (`options.parsers`) ao montar
	 * a sessão — sem ele, todo caso quebrava na montagem, antes de chegar ao código testado.
	 */
	const dbOf = (tx: Tx) => drizzle(Object.assign(tx, { options: (sql as postgres.Sql).options }) as unknown as postgres.Sql, { schema: sisubSchema })

	async function seedKitchen(tx: Tx, tag: string) {
		const [unit] = await tx`insert into core.units (code, display_name) values (${uid(`ZZ-${tag}-`)}, ${`unit ${tag}`}) returning id`
		const [kitchen] = await tx`insert into kitchen.kitchen (unit_id, display_name) values (${unit.id}, ${`cozinha ${tag}`}) returning id`
		const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values (${uid("PAO FRANCES TESTE ")}, 'KG') returning id`
		return { unitId: Number(unit.id), kitchenId: Number(kitchen.id), ingredientId: String(ingredient.id) }
	}

	/** Entrega registrada sem nota, com uma linha e o lote, e efetivada (provisório → definitivo). */
	async function deliveredWithoutInvoice(
		tx: Tx,
		input: { kitchenId: number; ingredientId: string; source: "delivery_note" | "ad_hoc"; number?: string; qty: number; finalize: boolean; expected?: boolean }
	) {
		const [receipt] = await tx`
			insert into inventory.goods_receipt (kitchen_id, source, delivery_note_number, invoice_expected, supplier_document)
			values (${input.kitchenId}, ${input.source}, ${input.number ?? null}, ${input.expected ?? true}, '12345678000190') returning id`
		const [item] = await tx`
			insert into inventory.goods_receipt_item (receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost)
			values (${receipt.id}, ${input.ingredientId}, null, ${input.qty}, null) returning id`
		await tx`
			insert into inventory.goods_receipt_item_lot (receipt_item_id, lot_code, expiry_date, quantity_base)
			values (${item.id}, ${uid("L-")}, current_date + 2, ${input.qty})`
		if (input.finalize) {
			await tx`update inventory.goods_receipt set status = 'provisional', provisional_at = now() where id = ${receipt.id}`
			await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
		}
		return { receiptId: String(receipt.id), itemId: String(item.id) }
	}

	async function pendingOf(tx: Tx, kitchenId: number): Promise<Map<string, ReceiptPendingKind[]>> {
		const status = await fetchReceivingPendingStatus(dbOf(tx), fullAccessCtx(), { kitchenId })
		return new Map(status.receipts.map((row) => [row.receiptId, row.pending]))
	}

	test("pão: guia de remessa todo dia, NF-e semanal vinculada depois às entregas da semana", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "PAO")
			const monday = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "delivery_note", number: "G-SEG", qty: 7, finalize: true })
			const tuesday = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "delivery_note", number: "G-TER", qty: 7, finalize: true })
			const [moves] =
				await tx`select count(*)::int as n, coalesce(sum(quantity), 0)::numeric as q from inventory.stock_movement where goods_receipt_item_id in (${monday.itemId}, ${tuesday.itemId})`
			expect(moves.n).toBe(2)

			// Efetivadas no dia, sem nota: a pendência aparece, e a entrega não esperou nada.
			let pending = await pendingOf(tx, kitchenId)
			expect(pending.get(monday.receiptId)).toContain("without_invoice")
			expect(pending.get(monday.receiptId)).toContain("lines_without_cost")

			// A NF-e da semana chega: 14 kg a R$ 14/kg.
			const [note] = await tx`
				insert into inventory.nfe_document (access_key, supplier_cnpj, kitchen_id, unit_id, status, situation_result, situation_checked_at)
				values (${`${"3".repeat(25)}${String(Date.now()).slice(-9)}${"1".repeat(10)}`}, '12345678000190', ${kitchenId}, ${unitId}, 'imported', 'authorized', now())
				returning id`
			const [noteItem] = await tx`
				insert into inventory.nfe_item (nfe_document_id, n_item, description, ingredient_id, matched_qty_base, unit_price, commercial_qty, match_status)
				values (${note.id}, 1, 'PAO FRANCES', ${ingredientId}, 14, 14, 14, 'matched') returning id`

			for (const delivery of [monday, tuesday]) {
				const match = matchReceiptLinesToInvoice(
					[{ id: delivery.itemId, ingredientId, purchaseItemId: null, nfeItemId: null, unitCost: null }],
					[
						{
							id: String(noteItem.id),
							nItem: 1,
							description: "PAO FRANCES",
							ingredientId,
							purchaseItemId: null,
							matchedQtyBase: 14,
							unitPrice: 14,
							commercialQty: 14,
						},
					]
				)
				expect(match.links).toHaveLength(1)
				// custo da LINHA DA NOTA: 196 / 14 = 14, não 196 / 7
				expect(match.costs[0]?.unitCost).toBe(14)
				const links = match.links.map((l) => ({ receipt_item_id: l.receiptItemId, nfe_item_id: l.nfeItemId }))
				const [linked] = await tx`
					select * from inventory.link_receipt_documents(${delivery.receiptId}, ${personId}, ${note.id}, null, null, ${JSON.stringify(links)}::jsonb, ${JSON.stringify([])}::jsonb)`
				expect(linked.linked_items).toBe(1)
			}

			// O vínculo não mexe no estoque nem reabre a efetivação.
			const [movesAfter] =
				await tx`select count(*)::int as n, coalesce(sum(quantity), 0)::numeric as q from inventory.stock_movement where goods_receipt_item_id in (${monday.itemId}, ${tuesday.itemId})`
			expect(movesAfter).toEqual(moves)
			const lines = await tx`select nfe_item_id from inventory.goods_receipt_item where id in (${monday.itemId}, ${tuesday.itemId})`
			expect(lines.every((line) => line.nfe_item_id === noteItem.id)).toBe(true)
			await expect(tx.savepoint((sp) => sp`update inventory.goods_receipt_item set received_qty_base = 8 where id = ${monday.itemId}`)).rejects.toThrow(
				/já efetivado/
			)

			pending = await pendingOf(tx, kitchenId)
			expect(pending.get(monday.receiptId) ?? []).not.toContain("without_invoice")

			// A mesma nota não gera recebimento próprio: o pão seria contado duas vezes.
			await expect(
				tx.savepoint((sp) => sp`insert into inventory.goods_receipt (kitchen_id, source, nfe_document_id) values (${kitchenId}, 'nfe', ${note.id})`)
			).rejects.toThrow(/contado duas vezes/)
		})
	}, 60_000)

	test("entrega sem NF-e: a de compra fica pendente de nota; a remessa do depósito, não", async () => {
		await inRollback(async (tx) => {
			const { kitchenId, ingredientId } = await seedKitchen(tx, "SEMNF")
			const purchase = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "ad_hoc", qty: 3, finalize: true })
			const depot = await deliveredWithoutInvoice(tx, {
				kitchenId,
				ingredientId,
				source: "delivery_note",
				number: "REM-9",
				qty: 3,
				finalize: true,
				expected: false,
			})

			// guia sem número não é guia
			await expect(tx.savepoint((sp) => sp`insert into inventory.goods_receipt (kitchen_id, source) values (${kitchenId}, 'delivery_note')`)).rejects.toThrow(
				/goods_receipt_delivery_note_number/
			)

			const pending = await pendingOf(tx, kitchenId)
			expect(pending.get(purchase.receiptId)).toEqual(expect.arrayContaining(["without_invoice", "without_empenho", "without_supply_order"]))
			expect(pending.get(depot.receiptId) ?? []).not.toContain("without_invoice")
		})
	}, 60_000)

	test("designar agora: a conferência registrada sem fiscal ganha quem confirme, sem redigitar", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "DESIG")
			const draft = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "ad_hoc", qty: 5, finalize: false })

			let pending = await pendingOf(tx, kitchenId)
			expect(pending.get(draft.receiptId)).toContain("conference_without_inspector")
			const [before] = await tx`select inventory.find_designation(${personId}, ${unitId}, null, ${tx.array([...PROVISIONAL_RECEIPT_ROLES])}) as id`
			expect(before.id).toBeNull()

			// ato sem o número do boletim não passa; a NE não designa
			await expect(
				tx.savepoint(
					(sp) =>
						sp`insert into procurement.contract_designation (unit_id, person_id, role, source) values (${unitId}, ${personId}, 'technical_inspector', 'ato')`
				)
			).rejects.toThrow(/contract_designation_ato_reference/)
			await expect(
				tx.savepoint(
					(sp) =>
						sp`insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference) values (${unitId}, ${personId}, 'manager', 'empenho', '2026NE1')`
				)
			).rejects.toThrow(/contract_designation_source_check/)

			const [designation] = await tx`
				insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference)
				values (${unitId}, ${personId}, 'technical_inspector', 'ato', 'BI nº 180/2026') returning id`
			const [after] = await tx`select inventory.find_designation(${personId}, ${unitId}, null, ${tx.array([...PROVISIONAL_RECEIPT_ROLES])}) as id`
			expect(after.id).toBe(designation.id)

			pending = await pendingOf(tx, kitchenId)
			expect(pending.get(draft.receiptId) ?? []).not.toContain("conference_without_inspector")
			// a conferência continua a mesma: nada foi redigitado
			const [line] = await tx`select received_qty_base from inventory.goods_receipt_item where id = ${draft.itemId}`
			expect(Number(line.received_qty_base)).toBe(5)
		})
	}, 60_000)

	test("definitivo sem gestor ou comissão designada é recusado com quem designa e onde", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "DEFIN")
			const receipt = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "ad_hoc", qty: 2, finalize: false })
			await tx`update inventory.goods_receipt set status = 'provisional', provisional_at = now() where id = ${receipt.receiptId}`
			// só fiscal: provisório sim, definitivo não (Lei 14.133/2021, art. 140, II, b)
			await tx`
				insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference)
				values (${unitId}, ${personId}, 'technical_inspector', 'permanente', 'Portaria 12/2026')`
			const [definitive] = await tx`select inventory.find_designation(${personId}, ${unitId}, null, ${tx.array([...DEFINITIVE_RECEIPT_ROLES])}) as id`
			expect(definitive.id).toBeNull()
			expect(designationMissingMessage("definitive", false)).toMatch(/Gestão Unidade → Designações/)

			const pending = await pendingOf(tx, kitchenId)
			expect(pending.get(receipt.receiptId)).toContain("provisional_without_manager")
		})
	}, 60_000)

	test("SEFAZ fora do ar: o estoque entra com a consulta pendente; a liquidação continua exigindo", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "SEFAZ")
			const [note] = await tx`
				insert into inventory.nfe_document (access_key, supplier_cnpj, kitchen_id, unit_id, status)
				values (${`${"4".repeat(25)}${String(Date.now()).slice(-9)}${"2".repeat(10)}`}, '12345678000190', ${kitchenId}, ${unitId}, 'imported')
				returning id`
			const [receipt] =
				await tx`insert into inventory.goods_receipt (kitchen_id, source, nfe_document_id) values (${kitchenId}, 'nfe', ${note.id}) returning id`
			const [item] = await tx`
				insert into inventory.goods_receipt_item (receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost)
				values (${receipt.id}, ${ingredientId}, 10, 10, 30) returning id`

			// A regra que o servidor aplica: sem consulta e com o motivo, efetiva com pendência.
			const invoice = { status: "imported", situationResult: null, situationCheckedAt: null }
			expect(decideReceiptInvoice(invoice, { reason: "Portal da SEFAZ fora do ar" }).kind).toBe("defer")

			// sem motivo, o banco recusa o registro do adiamento
			await expect(
				tx.savepoint(
					(sp) => sp`update inventory.goods_receipt set invoice_check_deferred_at = now(), invoice_check_deferred_by = ${personId} where id = ${receipt.id}`
				)
			).rejects.toThrow(/goods_receipt_invoice_check_deferral/)
			await tx`
				update inventory.goods_receipt
				   set invoice_check_deferred_at = now(), invoice_check_deferred_by = ${personId}, invoice_check_deferred_reason = 'Portal da SEFAZ fora do ar',
				       status = 'provisional', provisional_at = now()
				 where id = ${receipt.id}`
			await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`
			const [moved] = await tx`select count(*)::int as n from inventory.stock_movement where goods_receipt_item_id = ${item.id}`
			expect(moved.n).toBe(1)

			let pending = await pendingOf(tx, kitchenId)
			expect(pending.get(String(receipt.id))).toContain("invoice_check_pending")

			// a liquidação continua recusando sem a consulta recente
			const [row] = await tx`select definitive_at from inventory.goods_receipt where id = ${receipt.id}`
			const problems = liquidacaoLinkProblems({
				unitId,
				empenhoId: "sem-empenho",
				receipt: {
					unitId,
					status: "definitive",
					definitiveAt: String(row.definitive_at),
					nfeDocumentId: String(note.id),
					empenhoId: null,
					fiscalPending: false,
				},
				requestedNfeId: null,
				invoice: { ...invoice, unitId },
			})
			expect(problems.some((p) => /Consulte a situação da NF-e/.test(p))).toBe(true)

			// consulta autorizada DEPOIS da efetivação: a pendência some
			await tx`update inventory.nfe_document set situation_result = 'authorized', situation_checked_at = now() + interval '1 minute' where id = ${note.id}`
			pending = await pendingOf(tx, kitchenId)
			expect(pending.get(String(receipt.id)) ?? []).not.toContain("invoice_check_pending")
		})
	}, 60_000)

	test("físico × contábil liga pela liquidação que aponta o recebimento, somando as parcelas", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "CONC")
			const [list] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unitId}, 'lista conc') returning id`
			const [arp] = await tx`
				insert into procurement.procurement_arp (unit_id, procurement_list_id, numero_ata, uasg_gerenciadora) values (${unitId}, ${list.id}, ${uid("ATA-")}, '160001') returning id`
			const [arpItem] =
				await tx`insert into procurement.procurement_arp_item (arp_id, numero_item, quantidade_homologada) values (${arp.id}, 1, 1000) returning id`
			const [empenho] = await tx`
				insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total)
				values (${unitId}, ${uid("2026NE")}, current_date, 1000) returning id`
			await tx`
				insert into finance.empenho_item (empenho_id, arp_item_id, quantity, unit_price, value)
				values (${empenho.id}, ${arpItem.id}, 100, 10, 1000)`
			const [receipt] =
				await tx`insert into inventory.goods_receipt (kitchen_id, empenho_id, status) values (${kitchenId}, ${empenho.id}, 'provisional') returning id`
			await tx`
				insert into inventory.goods_receipt_item (receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost)
				values (${receipt.id}, ${ingredientId}, 10, 10, 10)`
			await tx`select * from inventory.finalize_goods_receipt(${receipt.id}, null)`

			const [before] = await tx`select situacao from finance.v_physical_accounting_reconciliation where goods_receipt_id = ${receipt.id}`
			expect(before.situacao).toBe("sem_liquidacao")

			// duas NS parciais apontando o recebimento, sem `goods_receipt.liquidacao_id` (que não é mais gravado)
			await tx`
				insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor, goods_receipt_id)
				values (${unitId}, ${empenho.id}, ${uid("2026NS")}, current_date, 60, ${receipt.id}),
				       (${unitId}, ${empenho.id}, ${uid("2026NS")}, current_date, 40, ${receipt.id})`
			const [after] = await tx`select situacao, valor_liquidado from finance.v_physical_accounting_reconciliation where goods_receipt_id = ${receipt.id}`
			expect(after.situacao).toBe("conciliado")
			expect(Number(after.valor_liquidado)).toBe(100)
		})
	}, 60_000)

	/** NE da unidade sem ARP (a 214000 permite): basta número, data e valor. */
	async function seedEmpenho(tx: Tx, unitId: number, value = 1000) {
		const [row] = await tx`
			insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total)
			values (${unitId}, ${uid("2026NE")}, current_date, ${value}) returning id`
		return String(row.id)
	}

	test("recebimento liquidado: o empenho só pode ser a NE que a NS debitou, mesmo estando sem empenho", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "LIQNE")
			const e1 = await seedEmpenho(tx, unitId)
			const e2 = await seedEmpenho(tx, unitId)
			const delivery = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "ad_hoc", qty: 4, finalize: true })
			// entrega sem NE, liquidada sob E1
			await tx`
				insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor, goods_receipt_id)
				values (${unitId}, ${e1}, ${uid("2026NS")}, current_date, 40, ${delivery.receiptId})`

			await expect(
				tx.savepoint((sp) => sp`select * from inventory.link_receipt_documents(${delivery.receiptId}, ${personId}, null, null, ${e2})`)
			).rejects.toThrow(/já liquidado: a NS debitou a NE/)
			await tx`select * from inventory.link_receipt_documents(${delivery.receiptId}, ${personId}, null, null, ${e1})`
			const [row] = await tx`select empenho_id from inventory.goods_receipt where id = ${delivery.receiptId}`
			expect(row.empenho_id).toBe(e1)
		})
	}, 60_000)

	test("OF de E1 não convive com o empenho E2, mesmo vinculando só a NE", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "OFNE")
			const e1 = await seedEmpenho(tx, unitId)
			const e2 = await seedEmpenho(tx, unitId)
			const [order] = await tx`
				insert into procurement.supply_order (empenho_id, kitchen_id, sent_at, status) values (${e1}, ${kitchenId}, current_date, 'sent') returning id`
			const delivery = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "ad_hoc", qty: 2, finalize: false })
			await tx`select * from inventory.link_receipt_documents(${delivery.receiptId}, ${personId}, null, ${order.id}, null)`
			const [linked] = await tx`select empenho_id from inventory.goods_receipt where id = ${delivery.receiptId}`
			// a OF trouxe o empenho dela
			expect(linked.empenho_id).toBe(e1)
			await expect(
				tx.savepoint((sp) => sp`select * from inventory.link_receipt_documents(${delivery.receiptId}, ${personId}, null, null, ${e2})`)
			).rejects.toThrow(/OF desta entrega é de outro empenho/)

			// OF aguardando empenho: a NE entra na OF (SICAF), não só no recebimento
			const [waiting] = await tx`
				insert into procurement.supply_order (empenho_id, kitchen_id, sent_at, status) values (null, ${kitchenId}, current_date, 'sent') returning id`
			const other = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "ad_hoc", qty: 1, finalize: false })
			await tx`select * from inventory.link_receipt_documents(${other.receiptId}, ${personId}, null, ${waiting.id}, null)`
			await expect(
				tx.savepoint((sp) => sp`select * from inventory.link_receipt_documents(${other.receiptId}, ${personId}, null, null, ${e2})`)
			).rejects.toThrow(/aguardando empenho: vincule a NE na própria OF/)
		})
	}, 60_000)

	test("trocar de NF-e desliga a linha que não casa com a nova e tira o custo que veio da antiga", async () => {
		await inRollback(async (tx) => {
			const { unitId, kitchenId, ingredientId } = await seedKitchen(tx, "TROCA")
			const delivery = await deliveredWithoutInvoice(tx, { kitchenId, ingredientId, source: "ad_hoc", qty: 7, finalize: false })
			const key = (digit: string) => `${digit.repeat(25)}${String(Date.now()).slice(-9)}${digit.repeat(10)}`
			const [noteA] =
				await tx`insert into inventory.nfe_document (access_key, kitchen_id, unit_id, status) values (${key("5")}, ${kitchenId}, ${unitId}, 'imported') returning id`
			const [itemA] = await tx`
				insert into inventory.nfe_item (nfe_document_id, n_item, description, ingredient_id, matched_qty_base, unit_price, commercial_qty, match_status)
				values (${noteA.id}, 1, 'PAO', ${ingredientId}, 7, 14, 7, 'matched') returning id`
			await tx`
				select * from inventory.link_receipt_documents(${delivery.receiptId}, ${personId}, ${noteA.id}, null, null,
					${JSON.stringify([{ receipt_item_id: delivery.itemId, nfe_item_id: String(itemA.id) }])}::jsonb,
					${JSON.stringify([{ receipt_item_id: delivery.itemId, unit_cost: 14 }])}::jsonb)`
			const [withA] = await tx`select nfe_item_id, unit_cost, unit_cost_source from inventory.goods_receipt_item where id = ${delivery.itemId}`
			expect(withA).toMatchObject({ nfe_item_id: itemA.id, unit_cost_source: "invoice_link" })
			expect(Number(withA.unit_cost)).toBe(14)

			// a nota B não tem o pão: a linha fica sem item e sem o custo de A
			const [noteB] =
				await tx`insert into inventory.nfe_document (access_key, kitchen_id, unit_id, status) values (${key("6")}, ${kitchenId}, ${unitId}, 'imported') returning id`
			await tx`select * from inventory.link_receipt_documents(${delivery.receiptId}, ${personId}, ${noteB.id}, null, null, ${JSON.stringify([])}::jsonb, ${JSON.stringify([])}::jsonb)`
			const [withB] = await tx`select nfe_item_id, unit_cost, unit_cost_source from inventory.goods_receipt_item where id = ${delivery.itemId}`
			expect(withB).toEqual({ nfe_item_id: null, unit_cost: null, unit_cost_source: null })
			const [lot] = await tx`select unit_cost from inventory.goods_receipt_item_lot where receipt_item_id = ${delivery.itemId}`
			expect(lot.unit_cost).toBeNull()
			const pending = await pendingOf(tx, kitchenId)
			expect(pending.get(delivery.receiptId)).toContain("lines_without_invoice_item")
		})
	}, 60_000)

	test("designação encerrada hoje deixa de valer hoje: o destituído não assina", async () => {
		await inRollback(async (tx) => {
			const { unitId } = await seedKitchen(tx, "ENCER")
			const [designation] = await tx`
				insert into procurement.contract_designation (unit_id, person_id, role, source, source_reference, valid_from)
				values (${unitId}, ${personId}, 'manager', 'ato', 'BI nº 10/2026', current_date - 30) returning id`
			const [before] = await tx`select inventory.find_designation(${personId}, ${unitId}, null, ${tx.array([...DEFINITIVE_RECEIPT_ROLES])}) as id`
			expect(before.id).toBe(designation.id)

			const result = await endDesignation(dbOf(tx), fullAccessCtx(), { designationId: String(designation.id) })
			expect(result.ended).toBe("ended")
			const [after] = await tx`select inventory.find_designation(${personId}, ${unitId}, null, ${tx.array([...DEFINITIVE_RECEIPT_ROLES])}) as id`
			expect(after.id).toBeNull()
		})
	}, 60_000)
})
