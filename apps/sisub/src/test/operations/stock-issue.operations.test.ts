/**
 * Integração — saída do dia (migration 20260917220000).
 *
 * O que só o banco real prova:
 *  - idempotência da emissão: o MESMO `emission_id` reenviado não saca de novo
 *    (duplo clique e retry de rede com o almoxarife na frente do estoque);
 *  - alocação dentro da transação, pulando vencido e quarentena, preferindo
 *    "usar primeiro" e tratando lote sem validade por data de entrada;
 *  - falta de saldo não bloqueia: vira movimento sem lote, que a contagem
 *    regulariza — cozinha não para porque o ledger está atrasado;
 *  - devolução volta ao MESMO lote pelo custo com que saiu, limitada ao que
 *    saiu por aquela requisição.
 *
 * Tudo numa transação com ROLLBACK.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("stock issue request (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("emissão idempotente, alocação, falta sem lote e devolução", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-ISSUE', 'unit teste saída') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha saída') returning id`
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ TESTE SAIDA', 'KG') returning id`
					const [author] = await tx`select id from auth.users limit 1`

					// Três lotes: um vencido, um sem validade recebido antes, um válido.
					// A validade é medida na data civil de Brasília, como a função faz:
					// `current_date` é UTC e entre 21h e meia-noite em São Paulo já está
					// no dia seguinte — `current_date - 1` seria o HOJE de Brasília e o
					// lote "vencido" entraria na alocação, conforme a hora do dia.
					const [vencido] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, received_at)
						values (${kitchenRow.id}, ${ingredient.id}, 'L-VENC', ((now() at time zone 'America/Sao_Paulo')::date - 1), now() - interval '10 days') returning id`
					const [semValidade] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, received_at)
						values (${kitchenRow.id}, ${ingredient.id}, 'L-SEM-VAL', null, now() - interval '5 days') returning id`
					const [valido] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, received_at)
						values (${kitchenRow.id}, ${ingredient.id}, 'L-VALIDO', ((now() at time zone 'America/Sao_Paulo')::date + 30), now() - interval '1 day') returning id`
					for (const lot of [vencido, semValidade, valido]) {
						await tx`
							insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
							values (${kitchenRow.id}, ${ingredient.id}, ${lot.id}, 'receipt', 10, 4)`
					}

					const [request] = await tx`
						insert into inventory.stock_issue_request (kitchen_id, issue_date, origin, created_by)
						values (${kitchenRow.id}, (now() at time zone 'America/Sao_Paulo')::date, 'production', ${author.id}) returning id`

					// ── alocação: pula o vencido, começa pelo sem validade (mais antigo) ──
					const emission = "emissao-teste-0001"
					const [first] = await tx`
						select * from inventory.issue_stock(${request.id}, ${ingredient.id}, 12, ${author.id}, ${emission}, null, null, null)`
					expect(Number(first.movements)).toBe(2)
					expect(Number(first.without_lot)).toBe(0)

					const alocado = await tx`
						select lot_id, quantity from inventory.stock_movement
						where issue_request_id = ${request.id} and type = 'production_issue' order by quantity desc`
					expect(alocado.map((row) => row.lot_id)).toEqual([semValidade.id, valido.id])
					expect(alocado.map((row) => Number(row.quantity))).toEqual([10, 2])
					const [vencidoBalance] = await tx`select balance from inventory.v_stock_balance where lot_id = ${vencido.id}`
					expect(Number(vencidoBalance.balance)).toBe(10) // intocado

					// ── retry da MESMA emissão não saca de novo ──────────────────────
					const [retry] = await tx`
						select * from inventory.issue_stock(${request.id}, ${ingredient.id}, 12, ${author.id}, ${emission}, null, null, null)`
					expect(Number(retry.movements)).toBe(2)
					const [{ n: total }] = await tx`
						select count(*)::int as n from inventory.stock_movement where issue_request_id = ${request.id} and type = 'production_issue'`
					expect(total).toBe(2)

					// ── "usar primeiro" fura a ordem de validade ─────────────────────
					await tx`update inventory.stock_lot set use_first = true where id = ${vencido.id}`
					// mesmo marcado, lote VENCIDO continua fora: a marcação prioriza,
					// não ressuscita
					const [second] = await tx`
						select * from inventory.issue_stock(${request.id}, ${ingredient.id}, 3, ${author.id}, 'emissao-teste-0002', null, null, null)`
					expect(Number(second.without_lot)).toBe(0)
					const ultimo = await tx`
						select lot_id from inventory.stock_movement where emission_id = 'emissao-teste-0002'`
					expect(ultimo.every((row) => row.lot_id === valido.id)).toBe(true)

					// ── quarentena sai da alocação ───────────────────────────────────
					await tx`update inventory.stock_lot set quarantined_at = now(), quarantine_reason = 'teste' where id = ${valido.id}`
					const [third] = await tx`
						select * from inventory.issue_stock(${request.id}, ${ingredient.id}, 2, ${author.id}, 'emissao-teste-0003', null, null, null)`
					// só restava o válido (em quarentena) e o vencido: a saída inteira
					// cai em "sem lote", que a contagem vai regularizar
					expect(Number(third.without_lot)).toBe(2)
					const [semLote] = await tx`select lot_id from inventory.stock_movement where emission_id = 'emissao-teste-0003'`
					expect(semLote.lot_id).toBeNull()
					await tx`update inventory.stock_lot set quarantined_at = null where id = ${valido.id}`

					// ── devolução volta ao MESMO lote, pelo custo da saída ───────────
					const [returned] = await tx`
						select * from inventory.return_issue(${request.id}, ${semValidade.id}, 4, ${author.id}, 'devolucao-teste-0001')`
					expect(Number(returned.return_unit_cost)).toBe(4)
					const [saldoDevolvido] = await tx`select balance from inventory.v_stock_balance where lot_id = ${semValidade.id}`
					expect(Number(saldoDevolvido.balance)).toBe(4) // 10 − 10 + 4

					// devolver mais do que saiu daquele lote é recusado
					await expect(
						tx.savepoint((sp) => sp`select * from inventory.return_issue(${request.id}, ${semValidade.id}, 99, ${author.id}, 'devolucao-teste-0002')`)
					).rejects.toThrow(/Devolução maior que o emitido/)

					// ── requisição fechada não aceita mais emissão ───────────────────
					await tx`update inventory.stock_issue_request set status = 'closed', closed_at = now() where id = ${request.id}`
					await expect(
						tx.savepoint(
							(sp) => sp`select * from inventory.issue_stock(${request.id}, ${ingredient.id}, 1, ${author.id}, 'emissao-teste-0009', null, null, null)`
						)
					).rejects.toThrow(/já fechada/)

					throw new Rollback()
				})
				.catch((err: unknown) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
