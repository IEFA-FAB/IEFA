/**
 * Integração — camada de compatibilidade do rename 20260927010000 (anexo quantitativo e previsão
 * de demanda), exercitada pelo caminho LEGADO: é o que o código da `main` em produção faz entre a
 * aplicação do expand e o deploy do código novo.
 *
 *   * `procurement.kitchen_ata_draft*` são views auto-updatable sobre `kitchen_demand_forecast*`
 *     (`forecast_id as draft_id`): insert multi-linha com DEFAULT, `on conflict (draft_id,
 *     list_id) do nothing`, update e delete pela view;
 *   * `ata_id`/`ata_item_id` e `procurement_list_id`/`procurement_list_item_id` convivem, com um
 *     trigger que espelha os dois sentidos e as duas FKs (`set null`/`cascade`).
 *
 * Sai no contract (20260927020000) junto com a camada que ele testa.
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

/** Uma OM, uma cozinha, dois anexos com um item cada e um plano de cardápio — tudo dentro da transação. */
async function seed(tx: postgres.TransactionSql) {
	const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-ANNEX', 'unit teste rename') returning id`
	const [kitchen] = await tx`insert into kitchen.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha rename') returning id`
	const [listA] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unit.id}, 'anexo A') returning id`
	const [listB] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unit.id}, 'anexo B') returning id`
	const [itemA] =
		await tx`insert into procurement.procurement_list_item (list_id, ingredient_name, total_quantity) values (${listA.id}, 'ARROZ', 10) returning id`
	const [itemB] =
		await tx`insert into procurement.procurement_list_item (list_id, ingredient_name, total_quantity) values (${listB.id}, 'FEIJAO', 10) returning id`
	const [template] = await tx`insert into kitchen.menu_template (name, kitchen_id) values ('[TEST] rename', ${kitchen.id}) returning id`
	return {
		unitId: unit.id as number,
		kitchenId: kitchen.id as number,
		listA: listA.id as string,
		listB: listB.id as string,
		itemA: itemA.id as string,
		itemB: itemB.id as string,
		templateId: template.id as string,
	}
}

describeIf("compatibilidade do rename do anexo quantitativo (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("coluna antiga e nova se espelham em insert, update e upsert, e divergência é recusada", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// Código antigo: grava só ata_id.
				const [legacy] = await tx`
					insert into procurement.procurement_arp (unit_id, ata_id, numero_ata, uasg_gerenciadora)
					values (${s.unitId}, ${s.listA}, '00001/2026', '160001') returning id, ata_id, procurement_list_id`
				expect(legacy.procurement_list_id).toBe(s.listA)
				expect(legacy.ata_id).toBe(s.listA)

				// Código novo: grava só procurement_list_id.
				const [fresh] = await tx`
					insert into procurement.procurement_arp (unit_id, procurement_list_id, numero_ata, uasg_gerenciadora)
					values (${s.unitId}, ${s.listB}, '00002/2026', '160001') returning id, ata_id, procurement_list_id`
				expect(fresh.ata_id).toBe(s.listB)

				// Update só da antiga, depois só da nova, depois das duas com o mesmo valor.
				const [afterOld] = await tx`update procurement.procurement_arp set ata_id = ${s.listB} where id = ${legacy.id} returning ata_id, procurement_list_id`
				expect(afterOld.procurement_list_id).toBe(s.listB)
				const [afterNew] =
					await tx`update procurement.procurement_arp set procurement_list_id = ${s.listA} where id = ${legacy.id} returning ata_id, procurement_list_id`
				expect(afterNew.ata_id).toBe(s.listA)
				const [cleared] = await tx`
					update procurement.procurement_arp set ata_id = null, procurement_list_id = null where id = ${legacy.id} returning ata_id, procurement_list_id`
				expect([cleared.ata_id, cleared.procurement_list_id]).toEqual([null, null])

				// Update que não toca nenhuma das duas mantém as duas iguais.
				const [untouched] =
					await tx`update procurement.procurement_arp set uasg_gerenciadora = '160002' where id = ${fresh.id} returning ata_id, procurement_list_id`
				expect(untouched.ata_id).toBe(untouched.procurement_list_id)

				// Valores diferentes nas duas colunas: recusado.
				await expect(
					tx.savepoint(
						(sp) => sp`
							insert into procurement.procurement_arp (unit_id, ata_id, procurement_list_id, numero_ata, uasg_gerenciadora)
							values (${s.unitId}, ${s.listA}, ${s.listB}, '00003/2026', '160001')`
					)
				).rejects.toMatchObject({ code: "23514" })
				await expect(
					tx.savepoint((sp) => sp`update procurement.procurement_arp set ata_id = ${s.listA}, procurement_list_id = ${s.listB} where id = ${legacy.id}`)
				).rejects.toMatchObject({ code: "23514" })

				// Upsert do PostgREST da `main` (arp.fn.ts): `on conflict (id) do update` só com a antiga.
				const [arpItem] = await tx`
					insert into procurement.procurement_arp_item (arp_id, ata_item_id, numero_item)
					values (${fresh.id}, ${s.itemA}, 1)
					on conflict (id) do update set ata_item_id = excluded.ata_item_id
					returning id, ata_item_id, procurement_list_item_id`
				expect(arpItem.procurement_list_item_id).toBe(s.itemA)
				const [upserted] = await tx`
					insert into procurement.procurement_arp_item (id, arp_id, ata_item_id, numero_item)
					values (${arpItem.id}, ${fresh.id}, ${s.itemB}, 1)
					on conflict (id) do update set ata_item_id = excluded.ata_item_id
					returning ata_item_id, procurement_list_item_id`
				expect(upserted.procurement_list_item_id).toBe(s.itemB)

				// Pesquisa de preços: cabeçalho pela antiga, item pela nova.
				const [research] = await tx`
					insert into procurement.procurement_pesquisa_preco (ata_id) values (${s.listA}) returning id, procurement_list_id`
				expect(research.procurement_list_id).toBe(s.listA)
				const [researchItem] = await tx`
					insert into procurement.procurement_pesquisa_preco_item (research_id, procurement_list_item_id, product_name)
					values (${research.id}, ${s.itemA}, 'ARROZ') returning ata_item_id`
				expect(researchItem.ata_item_id).toBe(s.itemA)

				// Id inexistente gravado pela coluna antiga: a FK recusa.
				await expect(
					tx.savepoint((sp) => sp`insert into procurement.procurement_pesquisa_preco (ata_id) values ('00000000-0000-4000-8000-00000000dead')`)
				).rejects.toMatchObject({ code: "23503" })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("apagar item e anexo: set null nas duas colunas e cascata na pesquisa", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				const [arp] = await tx`
					insert into procurement.procurement_arp (unit_id, ata_id, numero_ata, uasg_gerenciadora)
					values (${s.unitId}, ${s.listA}, '00010/2026', '160001') returning id`
				const [arpItem] = await tx`
					insert into procurement.procurement_arp_item (arp_id, ata_item_id, numero_item) values (${arp.id}, ${s.itemA}, 1) returning id`
				const [research] = await tx`insert into procurement.procurement_pesquisa_preco (ata_id) values (${s.listA}) returning id`
				const [researchItem] = await tx`
					insert into procurement.procurement_pesquisa_preco_item (research_id, ata_item_id, product_name)
					values (${research.id}, ${s.itemA}, 'ARROZ') returning id`

				await tx`delete from procurement.procurement_list_item where id = ${s.itemA}`
				const [arpItemAfter] = await tx`select ata_item_id, procurement_list_item_id from procurement.procurement_arp_item where id = ${arpItem.id}`
				expect([arpItemAfter.ata_item_id, arpItemAfter.procurement_list_item_id]).toEqual([null, null])
				const [researchItemAfter] = await tx`
					select ata_item_id, procurement_list_item_id from procurement.procurement_pesquisa_preco_item where id = ${researchItem.id}`
				expect([researchItemAfter.ata_item_id, researchItemAfter.procurement_list_item_id]).toEqual([null, null])

				await tx`delete from procurement.procurement_list where id = ${s.listA}`
				const [arpAfter] = await tx`select ata_id, procurement_list_id from procurement.procurement_arp where id = ${arp.id}`
				expect([arpAfter.ata_id, arpAfter.procurement_list_id]).toEqual([null, null])
				const remaining = await tx`select 1 from procurement.procurement_pesquisa_preco where id = ${research.id}`
				expect(remaining).toHaveLength(0)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("previsão de demanda pelas views kitchen_ata_draft*: insert com DEFAULT, on conflict, update e delete", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// Insert multi-linha com DEFAULT explícito (o que o Drizzle da `main` emite).
				const drafts = await tx`
					insert into procurement.kitchen_ata_draft (id, kitchen_id, title, notes, status, created_at, updated_at, reviewed_at, reviewed_by)
					values
						(default, ${s.kitchenId}, '[TEST] previsão 1', null, default, default, default, default, default),
						(default, ${s.kitchenId}, '[TEST] previsão 2', null, 'sent', default, default, default, default)
					returning id, status, created_at`
				expect(drafts).toHaveLength(2)
				expect(drafts[0].id).toBeTruthy()
				expect(drafts[0].status).toBe("pending")
				expect(drafts[0].created_at).toBeTruthy()
				const [first, second] = drafts.map((d) => d.id as string)

				// A linha está na tabela nova, com o nome novo da coluna nas filhas.
				const selections = await tx`
					insert into procurement.kitchen_ata_draft_selection (id, draft_id, template_id, repetitions)
					values (default, ${first}, ${s.templateId}, default), (default, ${second}, ${s.templateId}, 2)
					returning id, draft_id, repetitions`
				expect(selections.map((r) => r.repetitions)).toEqual([1, 2])
				const inTable = await tx`
					select forecast_id from procurement.kitchen_demand_forecast_selection where forecast_id in (${first}, ${second}) order by repetitions`
				expect(inTable.map((r) => r.forecast_id)).toEqual([first, second])

				// on conflict (draft_id, list_id) do nothing pela view (recordKitchenDraftImport da `main`).
				const inserted = await tx`
					insert into procurement.kitchen_ata_draft_import (draft_id, list_id, imported_by, imported_at)
					values (${second}, ${s.listA}, null, default)
					on conflict (draft_id, list_id) do nothing returning draft_id`
				expect(inserted).toHaveLength(1)
				const ignored = await tx`
					insert into procurement.kitchen_ata_draft_import (draft_id, list_id, imported_by, imported_at)
					values (${second}, ${s.listA}, null, default)
					on conflict (draft_id, list_id) do nothing returning draft_id`
				expect(ignored).toHaveLength(0)
				const [imports] = await tx`select count(*)::int as n from procurement.kitchen_demand_forecast_import where forecast_id = ${second}`
				expect(imports.n).toBe(1)

				// Update pela view, filtrando pela coluna antiga.
				const [sent] = await tx`update procurement.kitchen_ata_draft set status = 'sent', updated_at = now() where id = ${first} returning status`
				expect(sent.status).toBe("sent")
				const [bumped] = await tx`update procurement.kitchen_ata_draft_selection set repetitions = 3 where draft_id = ${first} returning repetitions`
				expect(bumped.repetitions).toBe(3)

				// O CHECK da tabela vale pela view.
				await expect(tx.savepoint((sp) => sp`update procurement.kitchen_ata_draft set status = 'bogus' where id = ${first}`)).rejects.toMatchObject({
					code: "23514",
				})

				// Delete pela view (o reset de treino da `main`), com cascata para seleções e importações.
				const deletedSelections = await tx`delete from procurement.kitchen_ata_draft_selection where draft_id = ${first} returning 1`
				expect(deletedSelections).toHaveLength(1)
				const deleted = await tx`delete from procurement.kitchen_ata_draft where kitchen_id = ${s.kitchenId} returning id`
				expect(deleted).toHaveLength(2)
				const [leftovers] = await tx`
					select
						(select count(*)::int from procurement.kitchen_demand_forecast_selection where forecast_id in (${first}, ${second})) as selections,
						(select count(*)::int from procurement.kitchen_demand_forecast_import where forecast_id = ${second}) as imports`
				expect(leftovers).toEqual({ selections: 0, imports: 0 })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
