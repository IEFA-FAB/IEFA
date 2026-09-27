/**
 * Integração — camada de compatibilidade do rename 20260927040000 (anexo quantitativo →
 * `procurement.quantity_estimate*`), exercitada pelo caminho LEGADO: é o que o código da `main`
 * em produção faz entre a aplicação do expand e o deploy do código novo.
 *
 *   * `procurement.procurement_list*` são views auto-updatable sobre `quantity_estimate*`, com as
 *     colunas antigas por alias (`quantity_estimate_id as list_id`, `max_increase_percent as
 *     max_margin_percent`, `estimated_quantity as total_quantity`...) e os defaults da tabela:
 *     insert com DEFAULT, `on conflict` pela unique antiga, update e delete pela view;
 *   * `procurement_list_id`/`procurement_list_item_id`/`list_id` convivem com
 *     `quantity_estimate_id`/`quantity_estimate_item_id` em `procurement_arp`,
 *     `procurement_arp_item`, `procurement_pesquisa_preco(_item)`, `price_research_emission` e
 *     `kitchen_demand_forecast_import`, com um trigger que espelha os dois sentidos e as duas FKs;
 *   * o CHECK do status aceita `published` (o que a `main` grava) e `completed` (o código novo).
 *
 * Sai no contract (20260927050000) junto com a camada que ele testa.
 *
 * Banco real, `sql.begin` + savepoints + ROLLBACK final: nada persiste.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

async function inRollback(sql: postgres.Sql, body: (tx: postgres.TransactionSql) => Promise<void>): Promise<string> {
	return sql
		.begin(async (tx) => {
			await body(tx)
			throw new Rollback()
		})
		.then(
			() => "committed",
			(err) => {
				if (err instanceof Rollback) return "rolled-back"
				throw err
			}
		)
}

/** Uma OM, uma cozinha, um cardápio, uma previsão de demanda e dois anexos gravados pelo nome ANTIGO. */
async function seed(tx: postgres.TransactionSql) {
	const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-QE', 'unit teste rename do anexo') returning id`
	const [kitchen] = await tx`insert into kitchen.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha rename do anexo') returning id`
	const [template] = await tx`insert into kitchen.menu_template (name, kitchen_id) values ('[TEST] rename do anexo', ${kitchen.id}) returning id`
	const [forecast] = await tx`insert into procurement.kitchen_demand_forecast (kitchen_id, title) values (${kitchen.id}, '[TEST] previsão') returning id`
	const [listA] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unit.id}, 'anexo A') returning id`
	const [listB] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unit.id}, 'anexo B') returning id`
	const [itemA] =
		await tx`insert into procurement.procurement_list_item (list_id, ingredient_name, total_quantity) values (${listA.id}, 'ARROZ', 10) returning id`
	const [itemB] =
		await tx`insert into procurement.procurement_list_item (list_id, ingredient_name, total_quantity) values (${listB.id}, 'FEIJAO', 10) returning id`
	return {
		unitId: unit.id as number,
		kitchenId: kitchen.id as number,
		templateId: template.id as string,
		forecastId: forecast.id as string,
		listA: listA.id as string,
		listB: listB.id as string,
		itemA: itemA.id as string,
		itemB: itemB.id as string,
	}
}

describeIf("compatibilidade do rename do anexo quantitativo para quantity_estimate (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("as views antigas leem e escrevem a tabela nova, com os defaults e as colunas antigas", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// Defaults que a `main` não informa: status, acréscimo, orçamento sigiloso, mínima cotada.
				const [header] = await tx`
					select status, max_margin_percent, is_budget_confidential, min_quote_percent from procurement.procurement_list where id = ${s.listA}`
				expect(header).toMatchObject({ status: "draft", max_margin_percent: 20, is_budget_confidential: false })
				expect(Number(header.min_quote_percent)).toBe(100)

				// Update pelas colunas antigas chega às novas.
				await tx`update procurement.procurement_list set max_margin_percent = 35, margin_justification = 'safra' where id = ${s.listA}`
				const [renamed] = await tx`select max_increase_percent, max_quantity_justification from procurement.quantity_estimate where id = ${s.listA}`
				expect(renamed).toEqual({ max_increase_percent: 35, max_quantity_justification: "safra" })

				// Cozinha: `on conflict` pela unique antiga (list_id, kitchen_id).
				const [kitchenRow] = await tx`
					insert into procurement.procurement_list_kitchen (list_id, kitchen_id) values (${s.listA}, ${s.kitchenId}) returning id`
				await tx`
					insert into procurement.procurement_list_kitchen (list_id, kitchen_id, delivery_notes) values (${s.listA}, ${s.kitchenId}, 'doca 2')
					on conflict (list_id, kitchen_id) do update set delivery_notes = excluded.delivery_notes`
				const [notes] = await tx`select delivery_notes, quantity_estimate_id from procurement.quantity_estimate_kitchen where id = ${kitchenRow.id}`
				expect(notes).toEqual({ delivery_notes: "doca 2", quantity_estimate_id: s.listA })

				// Seleção pelo list_kitchen_id, com o default de repetitions.
				const [selection] = await tx`
					insert into procurement.procurement_list_selection (list_kitchen_id, template_id) values (${kitchenRow.id}, ${s.templateId}) returning id, repetitions`
				expect(selection.repetitions).toBe(1)
				const [newSelection] = await tx`select quantity_estimate_kitchen_id from procurement.quantity_estimate_selection where id = ${selection.id}`
				expect(newSelection.quantity_estimate_kitchen_id).toBe(kitchenRow.id)

				// Itens: multi-linha com DEFAULT, update e upsert pela PK com as colunas antigas.
				await tx`
					insert into procurement.procurement_list_item (id, list_id, ingredient_name, total_quantity, max_margin_percent)
					values (default, ${s.listA}, 'OLEO', 5, 10), (default, ${s.listA}, 'SAL', 2, default)`
				await tx`update procurement.procurement_list_item set total_quantity = 12 where id = ${s.itemA}`
				await tx`
					insert into procurement.procurement_list_item (id, list_id, ingredient_name, total_quantity) values (${s.itemA}, ${s.listA}, 'ARROZ', 13)
					on conflict (id) do update set total_quantity = excluded.total_quantity`
				const items = await tx`
					select ingredient_name, estimated_quantity, max_increase_percent from procurement.quantity_estimate_item
					where quantity_estimate_id = ${s.listA} order by ingredient_name`
				expect(items.map((i) => [i.ingredient_name, Number(i.estimated_quantity), i.max_increase_percent])).toEqual([
					["ARROZ", 13, null],
					["OLEO", 5, 10],
					["SAL", 2, null],
				])

				// Retrato pelo nome antigo.
				await tx`
					insert into procurement.procurement_list_snapshot_component (list_id, ingredient_name, total_quantity, max_margin_percent)
					values (${s.listA}, 'ARROZ', 13, 10)`
				await tx`insert into procurement.procurement_list_snapshot_selection (list_id, kitchen_id, template_name) values (${s.listA}, ${s.kitchenId}, 'Semanal')`
				const [frozen] = await tx`
					select
						(select count(*)::int from procurement.quantity_estimate_snapshot_component where quantity_estimate_id = ${s.listA} and snapshot_source = 'native') as components,
						(select count(*)::int from procurement.quantity_estimate_snapshot_selection where quantity_estimate_id = ${s.listA} and repetitions = 1) as selections`
				expect(frozen).toEqual({ components: 1, selections: 1 })

				// Delete pela view: a cascata da tabela vale.
				await tx`delete from procurement.procurement_list where id = ${s.listA}`
				const [left] = await tx`
					select
						(select count(*)::int from procurement.quantity_estimate_item where quantity_estimate_id = ${s.listA}) as items,
						(select count(*)::int from procurement.quantity_estimate_selection where id = ${selection.id}) as selections,
						(select count(*)::int from procurement.quantity_estimate_snapshot_component where quantity_estimate_id = ${s.listA}) as components`
				expect(left).toEqual({ items: 0, selections: 0, components: 0 })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("o status aceita `published` (main) e `completed` (código novo), e só eles além de draft/archived", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				await tx`update procurement.procurement_list set status = 'published' where id = ${s.listA}`
				await tx`update procurement.quantity_estimate set status = 'completed' where id = ${s.listB}`
				const statuses = await tx`select id, status from procurement.quantity_estimate where id in (${s.listA}, ${s.listB})`
				expect(Object.fromEntries(statuses.map((r) => [r.id, r.status]))).toEqual({ [s.listA]: "published", [s.listB]: "completed" })
				await expect(tx.savepoint((sp) => sp`update procurement.quantity_estimate set status = 'publicado' where id = ${s.listA}`)).rejects.toMatchObject({
					code: "23514",
				})
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("coluna antiga e nova se espelham em insert, update e upsert, e divergência é recusada", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// Código antigo: grava só procurement_list_id.
				const [legacy] = await tx`
					insert into procurement.procurement_arp (unit_id, procurement_list_id, numero_ata, uasg_gerenciadora)
					values (${s.unitId}, ${s.listA}, '00001/2026', '160001') returning id, procurement_list_id, quantity_estimate_id`
				expect(legacy.quantity_estimate_id).toBe(s.listA)

				// Código novo: grava só quantity_estimate_id.
				const [fresh] = await tx`
					insert into procurement.procurement_arp (unit_id, quantity_estimate_id, numero_ata, uasg_gerenciadora)
					values (${s.unitId}, ${s.listB}, '00002/2026', '160001') returning id, procurement_list_id`
				expect(fresh.procurement_list_id).toBe(s.listB)

				// Update só da antiga, depois só da nova.
				const [afterOld] =
					await tx`update procurement.procurement_arp set procurement_list_id = ${s.listB} where id = ${legacy.id} returning quantity_estimate_id`
				expect(afterOld.quantity_estimate_id).toBe(s.listB)
				const [afterNew] =
					await tx`update procurement.procurement_arp set quantity_estimate_id = ${s.listA} where id = ${legacy.id} returning procurement_list_id`
				expect(afterNew.procurement_list_id).toBe(s.listA)

				// Valores diferentes nas duas colunas: recusado, no insert e no update que muda as duas
				// (mudar só uma, repetindo a outra, é a escrita normal de quem só conhece um nome).
				await expect(
					tx.savepoint(
						(sp) => sp`
							insert into procurement.procurement_arp (unit_id, procurement_list_id, quantity_estimate_id, numero_ata, uasg_gerenciadora)
							values (${s.unitId}, ${s.listA}, ${s.listB}, '00003/2026', '160001')`
					)
				).rejects.toMatchObject({ code: "23514" })
				await expect(
					tx.savepoint((sp) => sp`update procurement.procurement_arp set procurement_list_id = ${s.listB}, quantity_estimate_id = null where id = ${legacy.id}`)
				).rejects.toMatchObject({ code: "23514" })

				// Upsert do sync de ARP da `main` (arp.fn.ts) pela unique, escrevendo a antiga.
				await tx`
					insert into procurement.procurement_arp (unit_id, procurement_list_id, numero_ata, uasg_gerenciadora)
					values (${s.unitId}, ${s.listB}, '00001/2026', '160001')
					on conflict (unit_id, numero_ata, uasg_gerenciadora) do update set procurement_list_id = excluded.procurement_list_id`
				const [upserted] = await tx`select quantity_estimate_id from procurement.procurement_arp where id = ${legacy.id}`
				expect(upserted.quantity_estimate_id).toBe(s.listB)

				// Itens de ARP e pesquisa de preços: mesmo espelho para o item do anexo.
				const [arpItem] = await tx`
					insert into procurement.procurement_arp_item (arp_id, procurement_list_item_id) values (${legacy.id}, ${s.itemA}) returning id, quantity_estimate_item_id`
				expect(arpItem.quantity_estimate_item_id).toBe(s.itemA)
				const [research] = await tx`
					insert into procurement.procurement_pesquisa_preco (procurement_list_id) values (${s.listA}) returning id, quantity_estimate_id`
				expect(research.quantity_estimate_id).toBe(s.listA)
				const [researchItem] = await tx`
					insert into procurement.procurement_pesquisa_preco_item (research_id, product_name, quantity_estimate_item_id)
					values (${research.id}, 'ARROZ', ${s.itemA}) returning procurement_list_item_id`
				expect(researchItem.procurement_list_item_id).toBe(s.itemA)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("emissão e importação da previsão: espelho, unique pelos dois nomes e `on conflict` antigo e novo", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// Emissão (apenas-inserção) pela coluna antiga e pela nova; sequência única pelos dois nomes.
				await tx`insert into procurement.price_research_emission (list_id, sequence, sha256, items) values (${s.listA}, 1, ${"a".repeat(64)}, '[]')`
				await tx`insert into procurement.price_research_emission (quantity_estimate_id, sequence, sha256, items) values (${s.listA}, 2, ${"b".repeat(64)}, '[]')`
				const [emissions] = await tx`
					select count(*)::int as n from procurement.price_research_emission where quantity_estimate_id = ${s.listA} and list_id = ${s.listA}`
				expect(emissions.n).toBe(2)
				await expect(
					tx.savepoint(
						(sp) =>
							sp`insert into procurement.price_research_emission (quantity_estimate_id, sequence, sha256, items) values (${s.listA}, 2, ${"c".repeat(64)}, '[]')`
					)
				).rejects.toMatchObject({ code: "23505" })

				// Importação: `on conflict (forecast_id, list_id)` (main) e `(forecast_id, quantity_estimate_id)` (novo).
				await tx`
					insert into procurement.kitchen_demand_forecast_import (forecast_id, list_id) values (${s.forecastId}, ${s.listA})
					on conflict (forecast_id, list_id) do nothing`
				await tx`
					insert into procurement.kitchen_demand_forecast_import (forecast_id, list_id) values (${s.forecastId}, ${s.listA})
					on conflict (forecast_id, list_id) do nothing`
				await tx`
					insert into procurement.kitchen_demand_forecast_import (forecast_id, quantity_estimate_id) values (${s.forecastId}, ${s.listA})
					on conflict (forecast_id, quantity_estimate_id) do nothing`
				const [imports] = await tx`
					select count(*)::int as n from procurement.kitchen_demand_forecast_import where forecast_id = ${s.forecastId} and list_id = quantity_estimate_id`
				expect(imports.n).toBe(1)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("apagar o anexo e o item pela view solta/cascateia pelas duas FKs", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				const [arp] = await tx`
					insert into procurement.procurement_arp (unit_id, procurement_list_id, numero_ata, uasg_gerenciadora)
					values (${s.unitId}, ${s.listA}, '00009/2026', '160001') returning id`
				const [arpItem] = await tx`insert into procurement.procurement_arp_item (arp_id, procurement_list_item_id) values (${arp.id}, ${s.itemA}) returning id`
				const [research] = await tx`insert into procurement.procurement_pesquisa_preco (procurement_list_id) values (${s.listA}) returning id`
				await tx`insert into procurement.price_research_emission (list_id, sequence, sha256, items) values (${s.listA}, 1, ${"d".repeat(64)}, '[]')`
				await tx`insert into procurement.kitchen_demand_forecast_import (forecast_id, list_id) values (${s.forecastId}, ${s.listA})`

				// Item: ON DELETE SET NULL nas duas colunas do item da ARP.
				await tx`delete from procurement.procurement_list_item where id = ${s.itemA}`
				const [itemLink] = await tx`select procurement_list_item_id, quantity_estimate_item_id from procurement.procurement_arp_item where id = ${arpItem.id}`
				expect(itemLink).toEqual({ procurement_list_item_id: null, quantity_estimate_item_id: null })

				// Anexo: SET NULL na ARP, CASCADE na pesquisa, na emissão e na importação.
				await tx`delete from procurement.procurement_list where id = ${s.listA}`
				const [arpLink] = await tx`select procurement_list_id, quantity_estimate_id from procurement.procurement_arp where id = ${arp.id}`
				expect(arpLink).toEqual({ procurement_list_id: null, quantity_estimate_id: null })
				const [gone] = await tx`
					select
						(select count(*)::int from procurement.procurement_pesquisa_preco where id = ${research.id}) as research,
						(select count(*)::int from procurement.price_research_emission where quantity_estimate_id = ${s.listA}) as emissions,
						(select count(*)::int from procurement.kitchen_demand_forecast_import where quantity_estimate_id = ${s.listA}) as imports`
				expect(gone).toEqual({ research: 0, emissions: 0, imports: 0 })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("as views têm os grants das tabelas: servidor escreve, leitor do analytics lê, cliente não alcança", async () => {
		const [grants] = await sql`
			select
				has_table_privilege('service_role', 'procurement.procurement_list', 'insert') as service_list,
				has_table_privilege('service_role', 'procurement.procurement_list_snapshot_selection', 'delete') as service_snapshot,
				has_table_privilege('analytics_reader', 'procurement.procurement_list', 'select') as analytics_list,
				has_table_privilege('analytics_reader', 'procurement.procurement_list_item', 'select') as analytics_item,
				has_table_privilege('anon', 'procurement.procurement_list', 'select') as anon_list,
				has_table_privilege('authenticated', 'procurement.procurement_list_item', 'select') as authenticated_item`
		expect(grants).toEqual({
			service_list: true,
			service_snapshot: true,
			analytics_list: true,
			analytics_item: true,
			anon_list: false,
			authenticated_item: false,
		})
	})
})
