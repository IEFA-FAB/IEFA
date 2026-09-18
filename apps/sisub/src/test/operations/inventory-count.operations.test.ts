/**
 * Integração — inventário com escopo, rodadas e aprovação (migration 20260920120000).
 *
 * O que só o banco real prova, e que separa um inventário de uma planilha:
 *  - duas contagens abertas não disputam o mesmo item, e quem garante é ÍNDICE
 *    ÚNICO, não checagem na aplicação;
 *  - a cozinha não para para contar: a diferença é medida contra o saldo no
 *    INSTANTE do lançamento, então a saída posterior não vira falta;
 *  - o reenvio da fila offline não conta duas vezes;
 *  - quem abriu a contagem não a aprova;
 *  - a aprovação lança `count_gain`/`count_loss` e o saldo passa a refletir o
 *    contado;
 *  - encerrada a contagem, o escopo é liberado para a próxima.
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

describeIf("inventory count (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("escopo, sobreposição, instante da contagem, replay e aprovação", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-CNT', 'unit teste contagem') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha contagem') returning id`
					const [arroz] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ TESTE CNT', 'KG') returning id`
					const [oleo] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('OLEO TESTE CNT', 'L') returning id`
					const [autor] = await tx`select id from auth.users limit 1`
					const [outro] = await tx`select id from auth.users where id <> ${autor.id} limit 1`
					// sem um segundo usuário a prova de segregação não prova nada
					expect(outro?.id).toBeTruthy()

					const [lotArroz] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, unit_cost)
						values (${kitchenRow.id}, ${arroz.id}, 'L-ARROZ-CNT', 4) returning id`
					const [lotOleo] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, unit_cost)
						values (${kitchenRow.id}, ${oleo.id}, 'L-OLEO-CNT', 8) returning id`
					// recebidos há 5 h: `occurred_at` retroativo só vale dentro do mesmo
					// dia civil de Brasília, e o gatilho recusa o resto
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost, occurred_at)
						values (${kitchenRow.id}, ${arroz.id}, ${lotArroz.id}, 'receipt', 50, 4, now() - interval '5 hours'),
						       (${kitchenRow.id}, ${oleo.id}, ${lotOleo.id}, 'receipt', 60, 8, now() - interval '5 hours')`

					// ── abertura materializa o escopo ────────────────────────────────
					const [aberta] = await tx`
						select * from inventory.open_inventory_count(${kitchenRow.id}, 'rotating', 'full', '{}'::jsonb, true, null, ${autor.id})`
					expect(Number(aberta.scope_items)).toBe(2)

					// ── duas contagens abertas não disputam o mesmo item ─────────────
					await expect(
						tx.savepoint((sp) => sp`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'full', '{}'::jsonb, true, null, ${autor.id})`)
					).rejects.toThrow(/Já existe contagem aberta/)

					// ── duas pessoas contando a mesma prateleira SOMAM ───────────────
					await tx`
						insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
						values (${aberta.count_id}, ${lotArroz.id}, 12, 'ev-a', ${autor.id}, now() - interval '3 hours'),
						       (${aberta.count_id}, ${lotArroz.id}, 38, 'ev-b', ${outro.id}, now() - interval '3 hours')`
					const [somado] = await tx`
						select sum(quantity) as total from inventory.inventory_count_entry where count_id = ${aberta.count_id} and lot_id = ${lotArroz.id}`
					expect(Number(somado.total)).toBe(50)

					// ── reenvio da fila offline não conta duas vezes ─────────────────
					await expect(
						tx.savepoint(
							(sp) => sp`
								insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by)
								values (${aberta.count_id}, ${lotArroz.id}, 12, 'ev-a', ${autor.id})`
						)
					).rejects.toThrow(/duplicate key|count_entry_client_key/)

					// ── a cozinha continua trabalhando: saída DEPOIS não vira falta ──
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost, occurred_at)
						values (${kitchenRow.id}, ${arroz.id}, ${lotArroz.id}, 'production_issue', 10, 4, now() - interval '1 hour')`
					const [refs] = await tx`
						select inventory.balance_at(${kitchenRow.id}, ${lotArroz.id}, null, null, now() - interval '3 hours') as no_instante,
						       inventory.balance_at(${kitchenRow.id}, ${lotArroz.id}, null, null, now()) as agora`
					expect(Number(refs.no_instante)).toBe(50) // contado 50 → diferença ZERO
					expect(Number(refs.agora)).toBe(40)

					// ── óleo contado a menor ─────────────────────────────────────────
					await tx`
						insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
						values (${aberta.count_id}, ${lotOleo.id}, 30, 'ev-c', ${autor.id}, now() - interval '3 hours')`

					// ── quem abriu não aprova ────────────────────────────────────────
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${aberta.count_id}, ${autor.id}, null)`)).rejects.toThrow(
						/não a aprova/
					)

					// ── aprovação por outra pessoa lança o ajuste ────────────────────
					const [aprovada] = await tx`select * from inventory.approve_inventory_count(${aberta.count_id}, ${outro.id}, null)`
					// só o óleo diverge: o arroz bate com o saldo do instante em que foi contado
					expect(Number(aprovada.lines)).toBe(1)
					const itens = await tx`
						select i.reason_code, i.direction, i.quantity
						  from inventory.stock_adjustment_item i
						  join inventory.stock_adjustment a on a.id = i.adjustment_id
						 where a.inventory_count_id = ${aberta.count_id}`
					expect(itens).toHaveLength(1)
					expect(itens[0]?.reason_code).toBe("count_loss")
					expect(itens[0]?.direction).toBe("out")
					expect(Number(itens[0]?.quantity)).toBe(30)

					// o saldo passa a refletir o contado
					const [saldoOleo] = await tx`select balance from inventory.v_stock_balance where lot_id = ${lotOleo.id}`
					expect(Number(saldoOleo.balance)).toBe(30)
					// e o arroz segue intocado pela contagem: 50 recebidos − 10 da produção
					const [saldoArroz] = await tx`select balance from inventory.v_stock_balance where lot_id = ${lotArroz.id}`
					expect(Number(saldoArroz.balance)).toBe(40)

					const [documento] = await tx`
						select status, adjustment_id, approved_by, approved_by_own_entry
						  from inventory.inventory_count where id = ${aberta.count_id}`
					expect(documento.status).toBe("approved")
					expect(documento.adjustment_id).not.toBeNull()
					expect(documento.approved_by).toBe(outro.id)
					// `outro` lançou ('ev-b'), e em `dual` isso é permitido — mas fica
					// GRAVADO. Sem a marca, o lançador aprovando o próprio lançamento
					// seria indistinguível de uma aprovação com segregação de verdade, e
					// numa auditoria daqui a um ano ninguém separaria os dois casos.
					expect(documento.approved_by_own_entry).toBe(true)

					// ── e quem não lançou aprova SEM a marca ─────────────────────────
					const [terceiro] = await tx`
						select id from auth.users where id <> ${autor.id} and id <> ${outro.id} limit 1`
					expect(terceiro?.id).toBeTruthy()
					const [limpa] = await tx`
						select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
							${tx.json({ ingredient_ids: [arroz.id] })}, true, null, ${autor.id})`
					await tx`
						insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
						values (${limpa.count_id}, ${lotArroz.id}, 40, 'ev-d', ${outro.id}, now() - interval '30 minutes')`
					await tx`select * from inventory.approve_inventory_count(${limpa.count_id}, ${terceiro.id}, null)`
					const [comSegregacao] = await tx`select approved_by_own_entry from inventory.inventory_count where id = ${limpa.count_id}`
					expect(comSegregacao.approved_by_own_entry).toBe(false)

					// ── encerrada, o escopo é liberado para a próxima ────────────────
					const [seguinte] = await tx`
						select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'full', '{}'::jsonb, true, null, ${autor.id})`
					expect(Number(seguinte.scope_items)).toBe(2)

					// ── contagem não cega exige o motivo registrado ──────────────────
					await expect(
						tx.savepoint(
							(sp) =>
								sp`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'location', '{"location":"X"}'::jsonb, false, null, ${autor.id})`
						)
					).rejects.toThrow(/não cega exige o motivo/)

					throw new Rollback()
				})
				.catch((err: unknown) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
