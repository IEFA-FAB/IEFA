/**
 * Integração — fechamento mensal MCASP (migration 20260729180000).
 * Fechamento congela snapshot/totais; lançamento retroativo em competência
 * fechada é bloqueado pelo trigger; fechar duas vezes viola o unique.
 * Transação com ROLLBACK final.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("monthly closing MCASP (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("close_month congela totais e trava o período — com rollback", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-MCASP', 'unit mcasp') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha mcasp') returning id`
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ACUCAR TESTE MCASP', 'KG') returning id`
					const [lot] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code)
						values (${kitchenRow.id}, ${ingredient.id}, 'L-MCASP') returning id`

					// competência corrente: entrada 10@2 e saída 4
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
						values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'receipt', 10, 2)`
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity)
						values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'production_issue', 4)`

					const competencia = new Date().toISOString().substring(0, 7)
					const [closing] = await tx`select * from inventory.close_month(${kitchenRow.id}, ${`${competencia}-01`}, null)`
					expect(Number(closing.items)).toBe(1)

					const [row] = await tx`
						select total_in, total_out, value_in, value_out, closing_value, balance_snapshot
						from inventory.monthly_closing where id = ${closing.closing_id}`
					expect(Number(row.total_in)).toBe(10)
					expect(Number(row.total_out)).toBe(4)
					expect(Number(row.value_in)).toBe(20)
					expect(Number(row.value_out)).toBe(8)
					// balancete = ledger: 20 − 8 = 12
					expect(Number(row.closing_value)).toBe(12)
					expect(row.balance_snapshot).toHaveLength(1)

					// lançamento na competência fechada → trigger bloqueia
					await expect(
						tx.savepoint(
							(sp) => sp`
								insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
								values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'receipt', 1, 1)`
						)
					).rejects.toThrow(/fechada/)

					// fechar de novo → unique
					await expect(tx.savepoint((sp) => sp`select * from inventory.close_month(${kitchenRow.id}, ${`${competencia}-01`}, null)`)).rejects.toThrow()

					// competência futura → rejeita
					await expect(tx.savepoint((sp) => sp`select * from inventory.close_month(${kitchenRow.id}, '2099-01-01', null)`)).rejects.toThrow(/futura/)

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 30_000)
})
