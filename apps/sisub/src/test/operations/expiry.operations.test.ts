/**
 * Integração — painel de vencimentos (migration 20260919120000).
 *
 * O que só o banco real prova:
 *  - a resolução da antecedência desce do mais específico para o mais geral, e
 *    a política GLOBAL por ingrediente — o nível que faltava — de fato entra
 *    entre a classe da cozinha e a classe global;
 *  - as faixas são medidas na data civil de BRASÍLIA, e não em UTC: entre 21h
 *    e meia-noite em São Paulo o `current_date` do banco já é o dia seguinte,
 *    e um lote que vence hoje apareceria como vencido;
 *  - lote sem validade não é vencido, e vira `no_expiry` quando a classe é
 *    perecível — é defeito de cadastro, não item saudável;
 *  - `warning` é o DOBRO do limite, e não um número separado.
 *
 * Tudo dentro de uma transação com ROLLBACK.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("inventory expiry panel (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("resolução da antecedência e classificação por faixa", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-EXP', 'unit teste vencimento') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha vencimento') returning id`
					const [leite] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('LEITE TESTE EXP', 'L') returning id`
					const [queijo] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('QUEIJO TESTE EXP', 'KG') returning id`
					const [frango] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('FRANGO TESTE EXP', 'KG') returning id`

					// ── defaults, sem política nenhuma ───────────────────────────────
					const [defaults] = await tx`
						select inventory.expiry_alert_days(${kitchenRow.id}, ${queijo.id}, 'resfriado') as resfriado,
						       inventory.expiry_alert_days(${kitchenRow.id}, ${frango.id}, 'congelado') as congelado,
						       inventory.expiry_alert_days(${kitchenRow.id}, ${queijo.id}, 'seco') as seco`
					expect(Number(defaults.resfriado)).toBe(3)
					expect(Number(defaults.congelado)).toBe(15)
					expect(Number(defaults.seco)).toBe(30)

					// ── política GLOBAL por ingrediente vence o default da classe ────
					// Este é o nível que a tabela permitia e a resolução ignorava: a
					// nutricionista cadastraria "leite: 2 dias" para a Força inteira e
					// o painel seguiria em 3 sem dizer por quê.
					await tx`insert into inventory.expiry_alert_policy (kitchen_id, ingredient_id, alert_days) values (null, ${leite.id}, 2)`
					const [global] = await tx`select inventory.expiry_alert_days(${kitchenRow.id}, ${leite.id}, 'resfriado') as dias`
					expect(Number(global.dias)).toBe(2)

					// ── política da COZINHA por classe vence a global por ingrediente ─
					await tx`insert into inventory.expiry_alert_policy (kitchen_id, conservation_class, alert_days) values (${kitchenRow.id}, 'resfriado', 4)`
					const [porClasse] = await tx`select inventory.expiry_alert_days(${kitchenRow.id}, ${queijo.id}, 'resfriado') as dias`
					expect(Number(porClasse.dias)).toBe(4)
					// e o leite continua em 2? NÃO: a classe da cozinha é mais
					// específica que a global do item, e essa é a ordem da spec
					const [leiteAposClasse] = await tx`select inventory.expiry_alert_days(${kitchenRow.id}, ${leite.id}, 'resfriado') as dias`
					expect(Number(leiteAposClasse.dias)).toBe(4)

					// ── política do ITEM na cozinha vence todas ──────────────────────
					await tx`insert into inventory.expiry_alert_policy (kitchen_id, ingredient_id, alert_days) values (${kitchenRow.id}, ${leite.id}, 1)`
					const [porItem] = await tx`select inventory.expiry_alert_days(${kitchenRow.id}, ${leite.id}, 'resfriado') as dias`
					expect(Number(porItem.dias)).toBe(1)

					// ── faixas, medidas em Brasília ──────────────────────────────────
					// `current_date` é UTC e não serve aqui: às 21h em São Paulo ele já
					// é o dia seguinte, e "ontem" viraria "hoje".
					const hoje = tx`(now() at time zone 'America/Sao_Paulo')::date`
					const [venceu] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost, conservation_class)
						values (${kitchenRow.id}, ${queijo.id}, 'Q-VENCEU', ${hoje} - 1, 10, 'resfriado') returning id`
					const [critico] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost, conservation_class)
						values (${kitchenRow.id}, ${queijo.id}, 'Q-CRITICO', ${hoje} + 3, 10, 'resfriado') returning id`
					const [atencao] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost, conservation_class)
						values (${kitchenRow.id}, ${queijo.id}, 'Q-ATENCAO', ${hoje} + 7, 10, 'resfriado') returning id`
					const [tranquilo] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost, conservation_class)
						values (${kitchenRow.id}, ${queijo.id}, 'Q-OK', ${hoje} + 60, 10, 'resfriado') returning id`
					const [semValidade] = await tx`
						insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, expiry_date, unit_cost, conservation_class)
						values (${kitchenRow.id}, ${frango.id}, 'F-SEM-VAL', null, 20, 'congelado') returning id`
					for (const lot of [venceu, critico, atencao, tranquilo, semValidade]) {
						await tx`
							insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
							values (${kitchenRow.id}, (select ingredient_id from inventory.stock_lot where id = ${lot.id}), ${lot.id}, 'receipt', 4, 10)`
					}

					const bands = new Map(
						(await tx`select lot_id, band, days_left, alert_days from inventory.v_lot_expiry where kitchen_id = ${kitchenRow.id}`).map((row) => [
							row.lot_id as string,
							row,
						])
					)
					// limite 4 (classe da cozinha) → crítico até 4, atenção até 8
					expect(bands.get(venceu.id)?.band).toBe("expired")
					expect(bands.get(critico.id)?.band).toBe("critical")
					expect(bands.get(atencao.id)?.band).toBe("warning")
					expect(bands.get(tranquilo.id)?.band).toBe("ok")
					// perecível sem validade não é vencido: é cadastro a corrigir
					expect(bands.get(semValidade.id)?.band).toBe("no_expiry")
					expect(bands.get(semValidade.id)?.days_left).toBeNull()
					expect(Number(bands.get(critico.id)?.alert_days)).toBe(4)

					// lote sem saldo não aparece: o painel é do que está na prateleira
					await tx`
						insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost)
						values (${kitchenRow.id}, ${queijo.id}, ${tranquilo.id}, 'production_issue', 4, 10)`
					const semSaldo = await tx`select lot_id from inventory.v_lot_expiry where lot_id = ${tranquilo.id}`
					expect(semSaldo).toHaveLength(0)

					throw new Rollback()
				})
				.catch((err: unknown) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
