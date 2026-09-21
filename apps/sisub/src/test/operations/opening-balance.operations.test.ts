/**
 * Integração — carga de abertura do estoque (migration 20260922100000).
 *
 * O que só o banco real prova (os gatilhos de custeio e de competência são os de produção):
 *  - o lançamento cria um lote por linha, com código, validade e local da planilha, e um
 *    `adjustment_in` com motivo `opening_balance` — aceito pelo CHECK de direção do motivo;
 *  - o custo médio nasce do custo informado (entrada sobre saldo zero define a média);
 *  - reimportar o rascunho preserva o custo das linhas que não mudaram;
 *  - item que já movimentou na cozinha barra o lançamento, e nada é lançado pela metade;
 *  - linha de carga lançada não muda mais.
 *
 * Tudo dentro de uma transação com ROLLBACK. Asserção de erro usa savepoint para não abortar
 * a transação externa.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("inventory opening balance (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("rascunho, custo, lançamento e as recusas", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-OPEN', 'unit teste abertura') returning id`
					const [kitchenRow] = await tx`insert into kitchen.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha abertura') returning id`
					const [arroz] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ TESTE ABERTURA', 'KG') returning id`
					const [oleo] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('OLEO TESTE ABERTURA', 'LT') returning id`
					const [feijao] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('FEIJAO TESTE ABERTURA', 'KG') returning id`
					const [author] = await tx`select id from auth.users limit 1`

					const items = [
						{ line_number: 2, ingredient_id: arroz.id, quantity: 10, lot_code: "A1", expiry_date: "2030-01-10", location: "P1" },
						{ line_number: 3, ingredient_id: arroz.id, quantity: 5, lot_code: "A2", expiry_date: "2030-03-01", location: null },
						{ line_number: 4, ingredient_id: oleo.id, quantity: 8, lot_code: null, expiry_date: null, location: null },
					]
					const [{ doc }] = await tx`
						select inventory.save_opening_balance_draft(
							${kitchenRow.id}, ${author.id}, 'catalog_sheet', 'folha.csv', ${tx.json(items)}, ${tx.json([])}) as doc`

					// ── custo numa linha, e a reimportação o preserva ────────────────
					const [a1] = await tx`select id from inventory.opening_balance_item where opening_balance_id = ${doc} and lot_code = 'A1'`
					await tx`select inventory.set_opening_balance_costs(${doc}, ${author.id},
						${tx.json([{ item_id: a1.id, unit_cost: 6, cost_source: "ata", cost_reference: "ATA teste" }])})`
					const [{ again }] = await tx`
						select inventory.save_opening_balance_draft(
							${kitchenRow.id}, ${author.id}, 'catalog_sheet', 'folha-v2.csv', ${tx.json(items)}, ${tx.json([])}) as again`
					expect(again).toBe(doc)
					const [kept] = await tx`select unit_cost, cost_source from inventory.opening_balance_item where opening_balance_id = ${doc} and lot_code = 'A1'`
					expect(Number(kept.unit_cost)).toBe(6)
					expect(kept.cost_source).toBe("ata")

					// ── sem custo em todas as linhas, não lança ──────────────────────
					await expect(tx.savepoint((sp) => sp`select * from inventory.post_opening_balance(${doc}, ${author.id})`)).rejects.toThrow(/sem custo/)

					await tx`select inventory.set_opening_balance_costs(${doc}, ${author.id}, (
						select jsonb_agg(jsonb_build_object('item_id', id, 'unit_cost', 4, 'cost_source', 'manual'))
						from inventory.opening_balance_item where opening_balance_id = ${doc} and unit_cost is null))`

					// ── lançamento ───────────────────────────────────────────────────
					const [posted] = await tx`select * from inventory.post_opening_balance(${doc}, ${author.id})`
					expect(Number(posted.movements)).toBe(3)
					// 10 × 6 + 5 × 4 + 8 × 4
					expect(Number(posted.value)).toBe(112)

					const lots = await tx`
						select lot_code, expiry_date::text as expiry, location from inventory.stock_lot
						where kitchen_id = ${kitchenRow.id} order by lot_code`
					expect(lots.map((lot) => lot.lot_code)).toEqual(["A1", "A2", expect.stringMatching(/^ABERTURA-\d{4}-\d{2}-\d{2}$/)])
					expect(lots[0]).toMatchObject({ expiry: "2030-01-10", location: "P1" })

					const movements = await tx`
						select type, reason_code from inventory.stock_movement where kitchen_id = ${kitchenRow.id}`
					expect(movements).toHaveLength(3)
					expect(movements.every((m) => m.type === "adjustment_in" && m.reason_code === "opening_balance")).toBe(true)

					const [balance] = await tx`
						select coalesce(sum(balance), 0) as b from inventory.v_stock_balance
						where kitchen_id = ${kitchenRow.id} and ingredient_id = ${arroz.id}`
					expect(Number(balance.b)).toBe(15)

					// custo médio do arroz: (10 × 6 + 5 × 4) / 15
					const [cost] = await tx`select avg_unit_cost from inventory.stock_cost where kitchen_id = ${kitchenRow.id} and ingredient_id = ${arroz.id}`
					expect(Number(cost.avg_unit_cost)).toBeCloseTo(80 / 15, 3)

					// ── linha lançada não muda ───────────────────────────────────────
					await expect(tx.savepoint((sp) => sp`update inventory.opening_balance_item set unit_cost = 99 where opening_balance_id = ${doc}`)).rejects.toThrow(
						/não podem mais mudar/
					)

					// ── carga lançada não se altera nem se apaga ─────────────────────
					// Fora do reset do treino: o documento é a origem dos lotes e dos
					// movimentos de implantação, e o ledger não tem outro lugar que
					// explique de onde veio o saldo inicial.
					await expect(tx.savepoint((sp) => sp`update inventory.opening_balance set notes = 'x' where id = ${doc}`)).rejects.toThrow(/não se altera/)
					await expect(tx.savepoint((sp) => sp`delete from inventory.opening_balance where id = ${doc}`)).rejects.toThrow(/não se apaga/)

					// ── item que já movimentou barra a carga inteira ─────────────────
					const [second] = await tx`
						select inventory.save_opening_balance_draft(
							${kitchenRow.id}, ${author.id}, 'spreadsheet', 'segunda.csv',
							${tx.json([
								{ line_number: 2, ingredient_id: feijao.id, quantity: 3, lot_code: "F1" },
								{ line_number: 3, ingredient_id: arroz.id, quantity: 1, lot_code: "A9" },
							])}, ${tx.json([])}) as doc`
					await tx`select inventory.set_opening_balance_costs(${second.doc}, ${author.id}, (
						select jsonb_agg(jsonb_build_object('item_id', id, 'unit_cost', 1, 'cost_source', 'manual'))
						from inventory.opening_balance_item where opening_balance_id = ${second.doc}))`
					await expect(tx.savepoint((sp) => sp`select * from inventory.post_opening_balance(${second.doc}, ${author.id})`)).rejects.toThrow(
						/já movimentado.*ARROZ TESTE ABERTURA/
					)
					// nada entrou pela metade: o feijão da mesma carga também não
					const [feijaoMoves] = await tx`select count(*)::int as n from inventory.stock_movement where ingredient_id = ${feijao.id}`
					expect(feijaoMoves.n).toBe(0)

					throw new Rollback()
				})
				.catch((err: unknown) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
