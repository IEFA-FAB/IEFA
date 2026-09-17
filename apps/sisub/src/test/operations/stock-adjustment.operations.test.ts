/**
 * Integração — ajuste como documento, quarentena e fracionamento de lote
 * (migration 20260917160000).
 *
 * O que só o banco real prova:
 *  - motivo tipado com direção fixa (CHECK): `theft` não entra, `found_stock` não sai;
 *  - alçada calculada no SQL, somando ajustes do mesmo autor em 24 h — cinco
 *    documentos de R$ 180 não escapam de um teto de R$ 500;
 *  - lançamento atômico: lote travado, saldo conferido na saída, movimento e
 *    documento na mesma transação;
 *  - quarentena tira o lote da alocação ANTES da aprovação;
 *  - fracionamento (RDC 216) gera lote derivado com validade própria sem mexer
 *    no saldo do item nem no custo médio;
 *  - devolução de saída (`issue_return`) entra como ENTRADA no saldo e no
 *    fechamento — se cair no `else` da soma, a devolução tira estoque de novo.
 *
 * Tudo dentro de uma transação com ROLLBACK. Asserção de erro usa savepoint
 * para não abortar a transação externa.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("inventory stock adjustment (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("documento, alçada, quarentena, fracionamento e devolução", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-ADJ', 'unit teste ajuste') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha ajuste') returning id`
					const [ingredient] =
						await tx`insert into kitchen.ingredient (description, measure_unit, shelf_life_after_thaw_days) values ('FRANGO TESTE AJUSTE', 'KG', 2) returning id`
					const [author] = await tx`select id from auth.users limit 1`
					const [lot] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost)
						values (${kitchenRow.id}, ${ingredient.id}, 'L-ADJ-1', (current_date + 60), 10) returning id, short_code`
					// etiqueta interna: toda leitura de lote depende dela existir
					expect(lot.short_code).toMatch(/^LOT[0-9A-HJKMNP-TV-Z]{8}$/)

					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
						values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'receipt', 100, 10)`

					// ── motivo tipado tem direção fixa ───────────────────────────────
					await expect(
						tx.savepoint(
							(sp) => sp`
								insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost, reason_code)
								values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'adjustment_in', 1, 10, 'theft')`
						)
					).rejects.toThrow(/reason_direction|violates check/i)

					// ── ajuste sem motivo tipado não existe ──────────────────────────
					await expect(
						tx.savepoint(
							(sp) => sp`
								insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost, justification)
								values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'adjustment_out', 1, 10, 'sem motivo tipado')`
						)
					).rejects.toThrow(/reason_required|violates check/i)

					// ── documento pequeno: dentro da alçada default (R$ 500) ─────────
					const [small] = await tx`
						insert into inventory.stock_adjustment (kitchen_id, created_by, submitted_at)
						values (${kitchenRow.id}, ${author.id}, now()) returning id`
					await tx`
						insert into inventory.stock_adjustment_item (adjustment_id, lot_id, direction, quantity, reason_code, note)
						values (${small.id}, ${lot.id}, 'out', 2, 'expired', 'pão vencido')`
					const [needsApproval] = await tx`select inventory.adjustment_requires_approval(${small.id}) as required`
					expect(needsApproval.required).toBe(false)

					const [postedSmall] = await tx`select * from inventory.post_stock_adjustment(${small.id}, ${author.id}, null)`
					expect(Number(postedSmall.movements)).toBe(1)
					expect(Number(postedSmall.value)).toBe(20)
					const [afterSmall] = await tx`
						select coalesce(sum(balance), 0) as b from inventory.v_stock_balance
						where kitchen_id = ${kitchenRow.id} and ingredient_id = ${ingredient.id}`
					expect(Number(afterSmall.b)).toBe(98)

					// ── alçada não se burla fatiando o documento ─────────────────────
					// 20 KG × R$ 10 = R$ 200 por documento. O terceiro, somado aos dois
					// lançados nas últimas 24 h, passa de R$ 500.
					for (const attempt of [1, 2]) {
						const [doc] = await tx`
							insert into inventory.stock_adjustment (kitchen_id, created_by, submitted_at)
							values (${kitchenRow.id}, ${author.id}, now()) returning id`
						await tx`
							insert into inventory.stock_adjustment_item (adjustment_id, lot_id, direction, quantity, reason_code, note)
							values (${doc.id}, ${lot.id}, 'out', 20, 'spoiled', ${`fatia ${attempt}`})`
						await tx`select * from inventory.post_stock_adjustment(${doc.id}, ${author.id}, null)`
					}
					const [third] = await tx`
						insert into inventory.stock_adjustment (kitchen_id, created_by, submitted_at)
						values (${kitchenRow.id}, ${author.id}, now()) returning id`
					await tx`
						insert into inventory.stock_adjustment_item (adjustment_id, lot_id, direction, quantity, reason_code, note)
						values (${third.id}, ${lot.id}, 'out', 20, 'spoiled', 'fatia 3')`
					const [thirdNeeds] = await tx`select inventory.adjustment_requires_approval(${third.id}) as required`
					expect(thirdNeeds.required).toBe(true)
					// e o autor não pode aprovar o próprio documento sem exceção registrada
					await expect(tx.savepoint((sp) => sp`select * from inventory.post_stock_adjustment(${third.id}, ${author.id}, null)`)).rejects.toThrow(
						/aprovador diferente do autor/
					)
					// com a exceção (cozinha sem outro nível 3) segue, e fica registrada
					const [postedThird] = await tx`
						select * from inventory.post_stock_adjustment(${third.id}, ${author.id}, 'Único nível 3 da cozinha')`
					expect(Number(postedThird.movements)).toBe(1)
					const [thirdRow] = await tx`select status, approval_exception_reason from inventory.stock_adjustment where id = ${third.id}`
					expect(thirdRow.status).toBe("posted")
					expect(thirdRow.approval_exception_reason).toBe("Único nível 3 da cozinha")

					// ── saída maior que o saldo do lote é recusada ───────────────────
					const [tooBig] = await tx`
						insert into inventory.stock_adjustment (kitchen_id, created_by, submitted_at)
						values (${kitchenRow.id}, ${author.id}, now()) returning id`
					await tx`
						insert into inventory.stock_adjustment_item (adjustment_id, lot_id, direction, quantity, reason_code)
						values (${tooBig.id}, ${lot.id}, 'out', 9999, 'lost')`
					await expect(tx.savepoint((sp) => sp`select * from inventory.post_stock_adjustment(${tooBig.id}, ${author.id}, 'exceção')`)).rejects.toThrow(
						/Saldo insuficiente/
					)

					// ── quarentena tira o lote da alocação, antes de qualquer ajuste ──
					const [menuItemSetup] = await tx`
						insert into kitchen.meal_type (name, kitchen_id) values ('Almoço ajuste', ${kitchenRow.id}) returning id`
					const [dailyMenu] = await tx`
						insert into kitchen.daily_menu (kitchen_id, service_date, meal_type_id)
						values (${kitchenRow.id}, current_date, ${menuItemSetup.id}) returning id`
					const snapshot = {
						name: "Frango teste",
						portion_yield: 10,
						ingredients: [{ ingredient_id: ingredient.id, net_quantity: 5 }],
					}
					const [menuItem] = await tx`
						insert into kitchen.menu_items (daily_menu_id, recipe, planned_portion_quantity)
						values (${dailyMenu.id}, ${tx.json(snapshot)}, 20) returning id`
					const [task] = await tx`
						insert into kitchen.production_task (kitchen_id, menu_item_id, production_date, status)
						values (${kitchenRow.id}, ${menuItem.id}, current_date, 'DONE') returning id`

					await tx`update inventory.stock_lot set quarantined_at = now(), quarantine_reason = 'câmara falhou' where id = ${lot.id}`
					await tx`select * from inventory.register_production_issue(${task.id}, ${tx.json([
						{ kitchen_id: Number(kitchenRow.id), ingredient_id: ingredient.id, quantity: 5, override_lot_id: null, justification: null },
					])}, ${author.id})`
					const [quarantinedIssue] = await tx`
						select lot_id from inventory.stock_movement where production_task_id = ${task.id} and type = 'production_issue'`
					// não havia outro lote: a baixa saiu SEM lote em vez de consumir o
					// lote comprometido
					expect(quarantinedIssue.lot_id).toBeNull()

					// lote em quarentena também não é transferível nem fracionável
					const [kitchenB] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha destino ajuste') returning id`
					await expect(tx.savepoint((sp) => sp`select * from inventory.transfer_stock(${lot.id}, ${kitchenB.id}, 1, ${author.id})`)).rejects.toThrow(
						/quarentena/
					)
					await tx`update inventory.stock_lot set quarantined_at = null, quarantine_reason = null where id = ${lot.id}`

					// ── fracionamento: lote derivado com validade própria ────────────
					const [derived] = await tx`select * from inventory.split_lot(${lot.id}, 10, 'thawed', ${author.id}, null, 'Câmara 2')`
					expect(derived.new_short_code).toMatch(/^LOT/)
					// validade = hoje + 2 dias (prazo após descongelar do ingrediente).
					// A comparação é feita no BANCO: o driver devolve `date` como Date do
					// JS no fuso local, e comparar string de Date vira armadilha de fuso.
					const [expiryCheck] = await tx`
						select (${derived.new_expiry_date}::date = (now() at time zone 'America/Sao_Paulo')::date + 2) as ok`
					expect(expiryCheck.ok).toBe(true)

					const [afterSplit] = await tx`
						select coalesce(sum(balance), 0) as b from inventory.v_stock_balance
						where kitchen_id = ${kitchenRow.id} and ingredient_id = ${ingredient.id}`
					const [costAfterSplit] = await tx`
						select avg_unit_cost from inventory.stock_cost where kitchen_id = ${kitchenRow.id} and ingredient_id = ${ingredient.id}`
					// o par lot_split_out/in não muda o saldo do ITEM nem o custo médio
					expect(Number(afterSplit.b)).toBe(33)
					expect(Number(costAfterSplit.avg_unit_cost)).toBe(10)
					const [derivedBalance] = await tx`
						select balance from inventory.v_stock_balance where lot_id = ${derived.new_lot_id}`
					expect(Number(derivedBalance.balance)).toBe(10)

					// ── devolução de saída entra como ENTRADA ────────────────────────
					const [beforeReturn] = await tx`
						select coalesce(sum(balance), 0) as b from inventory.v_stock_balance
						where kitchen_id = ${kitchenRow.id} and ingredient_id = ${ingredient.id}`
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
						values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'issue_return', 3, 10)`
					const [afterReturn] = await tx`
						select coalesce(sum(balance), 0) as b from inventory.v_stock_balance
						where kitchen_id = ${kitchenRow.id} and ingredient_id = ${ingredient.id}`
					expect(Number(afterReturn.b)).toBe(Number(beforeReturn.b) + 3)

					// e o fechamento conta a devolução do mesmo lado que a view
					const [closing] = await tx`
						select * from inventory.close_month(${kitchenRow.id}, date_trunc('month', current_date)::date, ${author.id})`
					const [closingRow] = await tx`select closing_value from inventory.monthly_closing where id = ${closing.closing_id}`
					const [ledgerValue] = await tx`
						select coalesce(sum(case when type in ('receipt','issue_return','leftover_return','transfer_in','lot_split_in','adjustment_in')
						                        then total_cost else -total_cost end), 0) as v
						from inventory.stock_movement where kitchen_id = ${kitchenRow.id}`
					expect(Number(closingRow.closing_value)).toBe(Number(ledgerValue.v))

					throw new Rollback()
				})
				.catch((err: unknown) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
