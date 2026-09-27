/**
 * Integração — camada de compatibilidade do rename 20260927060000 (lote 3 da linguagem ubíqua:
 * pesquisa de preços e prefixos redundantes), exercitada pelo caminho LEGADO: é o que o código da
 * `main` em produção faz entre a aplicação do expand e o deploy do código novo.
 *
 *   * `procurement.procurement_pesquisa_preco*`, `compras_amostra`, `procurement_arp*` e
 *     `procurement_segment*` são views auto-updatable sobre `price_research*`, `price_sample`,
 *     `arp*` e `segment*`, com a coluna antiga por alias (`price_sample_id as amostra_id`) e os
 *     defaults da tabela: insert com DEFAULT, `on conflict` pelas uniques antigas, update e delete
 *     pela view, e os triggers da tabela disparando;
 *   * `procurement.upsert_compras_amostras` e `sisub.compras_amostra_fingerprint` são wrappers das
 *     funções novas (`upsert_price_samples`, `price_sample_fingerprint`);
 *   * `finance.empenho_item_check_unit`, `inventory.designations_covering` e
 *     `procurement.supply_order_empenho_usage` foram recriadas com os nomes novos e continuam
 *     valendo para o que a `main` grava pelas views.
 *
 * Sai no contract (20260927070000) junto com a camada que ele testa.
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

/** Duas OMs, uma cozinha, um anexo e uma ARP com um item gravados pelo nome ANTIGO. */
async function seed(tx: postgres.TransactionSql) {
	const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-L3A', 'unit teste lote 3') returning id`
	const [other] = await tx`insert into core.units (code, display_name) values ('ZZTEST-L3B', 'outra unit teste lote 3') returning id`
	const [kitchen] = await tx`insert into kitchen.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha lote 3') returning id`
	const [estimate] = await tx`insert into procurement.quantity_estimate (unit_id, title) values (${unit.id}, 'anexo lote 3') returning id`
	const [arp] = await tx`
		insert into procurement.procurement_arp (unit_id, quantity_estimate_id, numero_ata, uasg_gerenciadora)
		values (${unit.id}, ${estimate.id}, '00001/2026', '160001') returning id, source`
	const [arpItem] = await tx`
		insert into procurement.procurement_arp_item (arp_id, numero_item, quantidade_homologada, valor_unitario)
		values (${arp.id}, 1, 100, 7.5) returning id, source, quantidade_empenhada`
	return {
		unitId: unit.id as number,
		otherUnitId: other.id as number,
		kitchenId: kitchen.id as number,
		estimateId: estimate.id as string,
		arpId: arp.id as string,
		arpSource: arp.source as string,
		arpItemId: arpItem.id as string,
		arpItemSource: arpItem.source as string,
		arpItemCommitted: arpItem.quantidade_empenhada as string,
	}
}

/** O fato de uma amostra do Compras.gov.br como o worker da API o manda para a RPC. */
function fact(idCompra: string, extra: Record<string, unknown> = {}) {
	return { id_compra: idCompra, id_item_compra: 1, descricao_item: "ARROZ TIPO 1", preco_unitario: 5.5, codigo_uasg: "160001", ...extra }
}

describeIf("compatibilidade do rename do lote 3: pesquisa de preços, ARP e contratação planejada (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("pesquisa de preços pelas views antigas: defaults, alias `amostra_id` e `on conflict` da ponte", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// Cabeçalho pela view antiga, com os defaults que a `main` não informa.
				const [research] = await tx`
					insert into procurement.procurement_pesquisa_preco (quantity_estimate_id, idempotency_key) values (${s.estimateId}, 'l3-compat')
					returning id, reference_method, period_months, total_items, created_at`
				expect(research).toMatchObject({ reference_method: "median", period_months: 12, total_items: 0 })
				expect(research.created_at).toBeTruthy()
				const [header] = await tx`select quantity_estimate_id from procurement.price_research where id = ${research.id}`
				expect(header.quantity_estimate_id).toBe(s.estimateId)

				// `on conflict` pelo índice único parcial da idempotência, pela view.
				const replay = await tx`
					insert into procurement.procurement_pesquisa_preco (quantity_estimate_id, idempotency_key) values (${s.estimateId}, 'l3-compat')
					on conflict (idempotency_key) where idempotency_key is not null do nothing returning id`
				expect(replay).toHaveLength(0)

				const [item] = await tx`
					insert into procurement.procurement_pesquisa_preco_item (research_id, product_name) values (${research.id}, 'ARROZ')
					returning id, is_compliant, non_compliance_reasons, manual_selection, total_raw`
				expect(item).toMatchObject({ is_compliant: false, non_compliance_reasons: [], manual_selection: false, total_raw: 0 })

				// A RPC antiga (wrapper) e a nova gravam o MESMO fato uma vez só.
				const [viaOld] = await tx`select * from procurement.upsert_compras_amostras(${tx.json([fact("L3-1")])}::jsonb) as t(id)`
				const [viaNew] =
					await tx`select * from procurement.upsert_price_samples(${tx.json([fact("L3-1", { ni_fornecedor: "12345678000199" })])}::jsonb) as t(id)`
				expect(viaNew.id).toBe(viaOld.id)
				const [sample] = await tx`select ni_fornecedor, fingerprint from procurement.price_sample where id = ${viaOld.id}`
				expect(sample.ni_fornecedor).toBe("12345678000199")

				// A impressão digital antiga (wrapper) e a nova dão o mesmo valor que a coluna gerada.
				const [prints] = await tx`
					select
						sisub.compras_amostra_fingerprint(id_compra, id_item_compra, descricao_item, preco_unitario, capacidade_unidade_fornecimento, sigla_unidade_fornecimento, sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg, municipio, estado, esfera, marca, normalized_price, reference_date) as old_print,
						sisub.price_sample_fingerprint(id_compra, id_item_compra, descricao_item, preco_unitario, capacidade_unidade_fornecimento, sigla_unidade_fornecimento, sigla_unidade_medida, quantidade, codigo_uasg, nome_uasg, municipio, estado, esfera, marca, normalized_price, reference_date) as new_print
					from procurement.compras_amostra where id = ${viaOld.id}`
				expect(prints).toEqual({ old_print: sample.fingerprint, new_print: sample.fingerprint })

				// Ponte pela view antiga, pela coluna antiga; `on conflict (research_item_id, amostra_id)`.
				const [bridge] = await tx`
					insert into procurement.procurement_pesquisa_preco_amostra (research_item_id, sample_type, amostra_id)
					values (${item.id}, 'valid', ${viaOld.id}) returning id, art5_parameter`
				expect(bridge.art5_parameter).toBe("I")
				await tx`
					insert into procurement.procurement_pesquisa_preco_amostra (research_item_id, sample_type, amostra_id)
					values (${item.id}, 'outlier', ${viaOld.id})
					on conflict (research_item_id, amostra_id) do nothing`
				const [bridged] = await tx`select price_sample_id, sample_type from procurement.price_research_sample where id = ${bridge.id}`
				expect(bridged).toEqual({ price_sample_id: viaOld.id, sample_type: "valid" })

				// A amostra usada numa pesquisa não sai (RESTRICT), nem pela view antiga.
				await expect(tx.savepoint((sp) => sp`delete from procurement.compras_amostra where id = ${viaOld.id}`)).rejects.toMatchObject({ code: "23503" })

				// Apagar a pesquisa pela view cascateia itens e ponte na tabela.
				await tx`delete from procurement.procurement_pesquisa_preco where id = ${research.id}`
				const [left] = await tx`
					select
						(select count(*)::int from procurement.price_research_item where research_id = ${research.id}) as items,
						(select count(*)::int from procurement.price_research_sample where research_item_id = ${item.id}) as samples`
				expect(left).toEqual({ items: 0, samples: 0 })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("ARP pelas views antigas: defaults, upsert do sync pela unique e o trigger da contratação de origem", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				expect(s.arpSource).toBe("compras_gov")
				expect(s.arpItemSource).toBe("compras_gov")
				expect(Number(s.arpItemCommitted)).toBe(0)

				// Upsert do sync de ARP da `main` (arp.fn.ts) pela unique (unit_id, numero_ata, uasg_gerenciadora).
				await tx`
					insert into procurement.procurement_arp (unit_id, numero_ata, uasg_gerenciadora, objeto)
					values (${s.unitId}, '00001/2026', '160001', 'gêneros')
					on conflict (unit_id, numero_ata, uasg_gerenciadora) do update set objeto = excluded.objeto`
				const [arp] = await tx`select objeto, quantity_estimate_id from procurement.arp where id = ${s.arpId}`
				expect(arp).toEqual({ objeto: "gêneros", quantity_estimate_id: s.estimateId })

				// Upsert dos itens pela PK (arp.fn.ts, `onConflict: "id"`).
				await tx`
					insert into procurement.procurement_arp_item (id, arp_id, numero_item, quantidade_empenhada)
					values (${s.arpItemId}, ${s.arpId}, 1, 40)
					on conflict (id) do update set quantidade_empenhada = excluded.quantidade_empenhada`
				const [item] = await tx`select quantidade_empenhada from procurement.arp_item where id = ${s.arpItemId}`
				expect(Number(item.quantidade_empenhada)).toBe(40)

				// O trigger da tabela (`arp_check_acquisition`) dispara pela view: a contratação de origem
				// de outra OM é recusada.
				const [foreign] = await tx`insert into procurement.acquisition (unit_id, kind) values (${s.otherUnitId}, 'registro_precos') returning id`
				await expect(
					tx.savepoint((sp) => sp`update procurement.procurement_arp set acquisition_id = ${foreign.id} where id = ${s.arpId}`)
				).rejects.toMatchObject({ code: "23514" })
				const [own] = await tx`insert into procurement.acquisition (unit_id, kind) values (${s.unitId}, 'registro_precos') returning id`
				await tx`update procurement.procurement_arp set acquisition_id = ${own.id} where id = ${s.arpId}`

				// Delete pela view: o item cai pelo CASCADE da tabela.
				await tx`delete from procurement.procurement_arp where id = ${s.arpId}`
				const [gone] = await tx`select count(*)::int as n from procurement.arp_item where arp_id = ${s.arpId}`
				expect(gone.n).toBe(0)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("as funções recriadas leem as tabelas novas pelo que a `main` grava nas views", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)

				// `finance.empenho_item_check_unit`: item da ARP de outra OM é recusado.
				const [foreignArp] = await tx`
					insert into procurement.procurement_arp (unit_id, numero_ata, uasg_gerenciadora) values (${s.otherUnitId}, '00002/2026', '160001') returning id`
				const [foreignItem] = await tx`insert into procurement.procurement_arp_item (arp_id, numero_item) values (${foreignArp.id}, 1) returning id`
				const [empenho] = await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total)
					values (${s.unitId}, '2026NEL3COMPAT', current_date, 750) returning id`
				await expect(
					tx.savepoint(
						(sp) =>
							sp`insert into finance.empenho_item (empenho_id, arp_item_id, quantity, unit_price, value) values (${empenho.id}, ${foreignItem.id}, 1, 1, 1)`
					)
				).rejects.toMatchObject({ code: "23514" })
				await tx`
					insert into finance.empenho_item (empenho_id, arp_item_id, quantity, unit_price, value)
					values (${empenho.id}, ${s.arpItemId}, 100, null, 750)`

				// `procurement.supply_order_empenho_usage`: sem preço na OF nem na NE, vale o da ARP.
				const [order] = await tx`insert into procurement.supply_order (empenho_id, kitchen_id) values (${empenho.id}, ${s.kitchenId}) returning id`
				await tx`insert into procurement.supply_order_item (supply_order_id, arp_item_id, ordered_qty) values (${order.id}, ${s.arpItemId}, 10)`
				const [usage] = await tx`select priced_total, unpriced_lines from procurement.supply_order_empenho_usage(${empenho.id})`
				expect(Number(usage.priced_total)).toBe(75)
				expect(usage.unpriced_lines).toBe(0)

				// `inventory.designations_covering`: a designação pela ARP cobre a NE que empenha item dela.
				// A designação aponta para a conta (auth.users), não para `core.person`.
				const [person] = await tx`insert into auth.users (id, email) values (gen_random_uuid(), 'zztest-l3-compat@example.invalid') returning id`
				await tx`
					insert into procurement.contract_designation (unit_id, arp_id, person_id, role, source, valid_from)
					values (${s.unitId}, ${s.arpId}, ${person.id}, 'technical_inspector', 'permanente', current_date - 1)`
				const covering = await tx`
					select person_id, by_arp from inventory.designations_covering(${s.unitId}, ${empenho.id}, array['technical_inspector'])`
				expect(covering.map((c) => [c.person_id, c.by_arp])).toEqual([[person.id, true]])
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("contratação planejada pelas views antigas: defaults, unicidade do nome e cascata das regras", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const s = await seed(tx)
				const [segment] = await tx`
					insert into procurement.procurement_segment (unit_id, name) values (${s.unitId}, 'Carnes') returning id, lead_time_months, validity_months, updated_at`
				expect(segment).toMatchObject({ lead_time_months: 5, validity_months: 12 })
				expect(segment.updated_at).toBeTruthy()

				// O índice único parcial do nome vale pela view.
				await expect(
					tx.savepoint((sp) => sp`insert into procurement.procurement_segment (unit_id, name) values (${s.unitId}, ' carnes ')`)
				).rejects.toMatchObject({ code: "23505" })

				const [folder] = await tx`insert into kitchen.folder (description) values ('[TEST] pasta lote 3') returning id`
				const [rule] = await tx`
					insert into procurement.procurement_segment_rule (segment_id, mode, folder_id) values (${segment.id}, 'include', ${folder.id}) returning id, created_at`
				expect(rule.created_at).toBeTruthy()
				await tx`update procurement.quantity_estimate set segment_id = ${segment.id} where id = ${s.estimateId}`
				await tx`update procurement.quantity_estimate set segment_id = null where id = ${s.estimateId}`

				await tx`delete from procurement.procurement_segment where id = ${segment.id}`
				const [gone] = await tx`select count(*)::int as n from procurement.segment_rule where id = ${rule.id}`
				expect(gone.n).toBe(0)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("a RPC nova e o wrapper antigo gravam como `service_role`, o papel com que o worker da API chama", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				await tx`set local role service_role`
				const [viaNew] = await tx`select * from procurement.upsert_price_samples(${tx.json([fact("L3-ROLE")])}::jsonb) as t(id)`
				const [viaOld] =
					await tx`select * from procurement.upsert_compras_amostras(${tx.json([fact("L3-ROLE", { nome_fornecedor: "FORNECEDOR" })])}::jsonb) as t(id)`
				expect(viaOld.id).toBe(viaNew.id)
				const [sample] = await tx`select nome_fornecedor from procurement.price_sample where id = ${viaNew.id}`
				expect(sample.nome_fornecedor).toBe("FORNECEDOR")
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("as views têm os grants das tabelas: servidor escreve, leitor do analytics lê o item da ARP, cliente não alcança", async () => {
		const [grants] = await sql`
			select
				has_table_privilege('service_role', 'procurement.procurement_pesquisa_preco', 'insert') as service_research,
				has_table_privilege('service_role', 'procurement.compras_amostra', 'select') as service_sample,
				has_table_privilege('service_role', 'procurement.procurement_segment_rule', 'delete') as service_rule,
				has_table_privilege('analytics_reader', 'procurement.procurement_arp_item', 'select') as analytics_arp_item,
				has_table_privilege('analytics_reader', 'procurement.arp_item', 'select') as analytics_arp_item_table,
				has_table_privilege('anon', 'procurement.procurement_arp', 'select') as anon_arp,
				has_table_privilege('authenticated', 'procurement.compras_amostra', 'select') as authenticated_sample,
				has_function_privilege('service_role', 'procurement.upsert_compras_amostras(jsonb)', 'execute') as service_rpc_old,
				has_function_privilege('service_role', 'procurement.upsert_price_samples(jsonb)', 'execute') as service_rpc_new,
				has_function_privilege('authenticated', 'procurement.upsert_price_samples(jsonb)', 'execute') as authenticated_rpc_new,
				has_table_privilege('service_role', 'procurement.price_sample', 'insert') as service_sample_insert,
				has_column_privilege('service_role', 'procurement.price_sample', 'ni_fornecedor', 'update') as service_sample_update,
				has_function_privilege('service_role', 'sisub.price_sample_fingerprint(text, integer, text, numeric, numeric, text, text, numeric, text, text, text, text, text, text, numeric, date)', 'execute') as service_fingerprint`
		expect(grants).toEqual({
			service_research: true,
			service_sample: true,
			service_rule: true,
			analytics_arp_item: true,
			analytics_arp_item_table: true,
			anon_arp: false,
			authenticated_sample: false,
			service_rpc_old: true,
			service_rpc_new: true,
			authenticated_rpc_new: false,
			// `upsert_price_samples` roda como quem chama (deixou de ser DEFINER): o `service_role`
			// precisa gravar a amostra, completar o fornecedor e calcular a coluna gerada.
			service_sample_insert: true,
			service_sample_update: true,
			service_fingerprint: true,
		})
	})
})
