/**
 * Integração — contratação de origem, ARP sem anexo, NE com itens, OF por valor e import do SIAFI
 * sem perda (migration 20260926214000, change `sisub-flexible-expense-execution`).
 *
 * Banco real, `sql.begin` + savepoints + ROLLBACK final: nada persiste. O trigger que dá o item
 * único à NE gravada só com o cabeçalho é DEFERRED (roda no commit); como aqui não há commit, os
 * casos que dependem dele o disparam com `set constraints … immediate`.
 *
 * Catálogo de edge cases: GU-ORG-01..05, GU-NE-01..02, GU-SIAFI-01..03 em
 * `.claude/skills/edge-cases/modules/gestao-unidade.md`.
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

describeIf("contratação de origem, NE com itens e OF por valor (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("carona sem anexo → uma NE com três itens → OF pelo valor vigente, aguardando empenho e vínculo depois", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-ORIG', 'unit teste origem') returning id`
				const [kitchen] = await tx`insert into kitchen.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha origem') returning id`

				// Contratação só com o tipo e o papel: nasce incompleta e é usável.
				const [acq] = await tx`
					insert into procurement.acquisition (unit_id, kind, srp_role)
					values (${unit.id}, 'registro_precos', 'nao_participante') returning id`

				// ARP de outra UASG, sem anexo quantitativo, cadastrada à mão.
				const [arp] = await tx`
					insert into procurement.procurement_arp (unit_id, ata_id, acquisition_id, numero_ata, uasg_gerenciadora, source)
					values (${unit.id}, null, ${acq.id}, '00012/2026', '120001', 'manual') returning id, last_synced_at`
				expect(arp.last_synced_at).toBeNull()
				const items = await tx`
					insert into procurement.procurement_arp_item (arp_id, numero_item, descricao_item, valor_unitario, quantidade_homologada, source)
					values (${arp.id}, 1, 'ARROZ', 5, 1000, 'manual'), (${arp.id}, 2, 'FEIJAO', 8, 1000, 'manual'), (${arp.id}, 3, 'OLEO', 10, 1000, 'manual')
					returning id, numero_item`
				const byNumber = new Map(items.map((row) => [Number(row.numero_item), row.id as string]))

				// Uma NE, três itens, gravados na mesma transação (o caminho novo).
				const [ne] = await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total, acquisition_id, tipo)
					values (${unit.id}, '2026NE000123', '2026-09-01', 1150, ${acq.id}, 'ordinario') returning id`
				await tx`
					insert into finance.empenho_item (empenho_id, arp_item_id, position, quantity, unit_price, value) values
						(${ne.id}, ${byNumber.get(1) as string}, 1, 50, 5, 250),
						(${ne.id}, ${byNumber.get(2) as string}, 2, 50, 8, 400),
						(${ne.id}, ${byNumber.get(3) as string}, 3, 50, 10, 500)`

				// Com vários itens, nenhum fala pela NE: as colunas antigas ficam nulas.
				const [header] = await tx`select arp_item_id, quantidade_empenhada, valor_unitario from finance.empenho where id = ${ne.id}`
				expect(header.arp_item_id).toBeNull()
				expect(header.quantidade_empenhada).toBeNull()

				// Comprometimento local por item de ARP: cada um soma só o seu.
				const committed = await tx`
					select arp_item_id, sum(quantity)::numeric as qty from finance.empenho_item where empenho_id = ${ne.id} group by arp_item_id`
				expect(committed.map((row) => Number(row.qty))).toEqual([50, 50, 50])

				// O retrato oficial da ARP não é tocado pelo empenho local.
				const [official] = await tx`select quantidade_empenhada from procurement.procurement_arp_item where id = ${byNumber.get(1) as string}`
				expect(Number(official.quantidade_empenhada)).toBe(0)

				// OF pelo valor: 500 + 400 = 900 de 1.150.
				const [of] = await tx`
					insert into procurement.supply_order (empenho_id, kitchen_id, sent_at, expected_delivery, status)
					values (${ne.id}, ${kitchen.id}, '2026-09-02', '2026-09-10', 'sent') returning id`
				await tx`insert into procurement.supply_order_item (supply_order_id, arp_item_id, ordered_qty) values (${of.id}, ${byNumber.get(3) as string}, 50)`
				await tx`insert into procurement.supply_order_item (supply_order_id, arp_item_id, ordered_qty) values (${of.id}, ${byNumber.get(2) as string}, 50)`
				// + 60 × 5 = 300 → 1.200 > 1.150
				await expect(
					tx.savepoint(
						(sp) =>
							sp`insert into procurement.supply_order_item (supply_order_id, arp_item_id, ordered_qty) values (${of.id}, ${byNumber.get(1) as string}, 60)`
					)
				).rejects.toThrow(/excede o valor vigente/)

				// Reforço é evento; o teto acompanha o valor vigente.
				await tx`insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa) values (${ne.id}, 'reforco', 100, '2026-09-03', 'reforço para o arroz')`
				await tx`insert into procurement.supply_order_item (supply_order_id, arp_item_id, ordered_qty) values (${of.id}, ${byNumber.get(1) as string}, 60)`

				// OF aguardando empenho: a emergência acontece.
				const [waiting] = await tx`
					insert into procurement.supply_order (empenho_id, kitchen_id, sent_at, expected_delivery, status)
					values (null, ${kitchen.id}, '2026-09-04', '2026-09-05', 'sent') returning id`
				await tx`insert into procurement.supply_order_item (supply_order_id, ordered_qty, unit_price) values (${waiting.id}, 10, 20)`

				// Registro rápido da NE (só cabeçalho) e vínculo depois: o teto confere no vínculo.
				const [quick] = await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total) values (${unit.id}, '2026NE000200', '2026-09-04', 150) returning id`
				await expect(tx.savepoint((sp) => sp`update procurement.supply_order set empenho_id = ${quick.id} where id = ${waiting.id}`)).rejects.toThrow(
					/excede o valor vigente/
				)
				await tx`insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa) values (${quick.id}, 'reforco', 50, '2026-09-04', 'completa a NE')`
				await tx`update procurement.supply_order set empenho_id = ${quick.id} where id = ${waiting.id}`

				// Empenho anulado não sustenta OF nova.
				const [cancelled] = await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total, status) values (${unit.id}, '2026NE000300', '2026-09-04', 500, 'anulado') returning id`
				const [of2] = await tx`
					insert into procurement.supply_order (empenho_id, kitchen_id, sent_at, expected_delivery, status)
					values (${cancelled.id}, ${kitchen.id}, '2026-09-04', '2026-09-05', 'sent') returning id`
				await expect(
					tx.savepoint((sp) => sp`insert into procurement.supply_order_item (supply_order_id, ordered_qty, unit_price) values (${of2.id}, 1, 1)`)
				).rejects.toThrow(/anulado/)

				// O registro rápido ganha o item único no commit (aqui forçado).
				await tx`set constraints finance.empenho_ensure_item immediate`
				const [quickItem] = await tx`select value, arp_item_id from finance.empenho_item where empenho_id = ${quick.id}`
				expect(Number(quickItem.value)).toBe(150)
				expect(quickItem.arp_item_id).toBeNull()
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("anexo apagado não leva ARP nem empenho; item de ARP com empenho não se apaga", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-ANEXO', 'unit teste anexo') returning id`
				const [list] = await tx`insert into procurement.procurement_list (unit_id, title) values (${unit.id}, 'anexo que vai sumir') returning id`
				const [arp] = await tx`
					insert into procurement.procurement_arp (unit_id, ata_id, numero_ata, uasg_gerenciadora)
					values (${unit.id}, ${list.id}, '00001/2026', '160001') returning id`
				const [arpItem] = await tx`
					insert into procurement.procurement_arp_item (arp_id, numero_item, valor_unitario, quantidade_homologada) values (${arp.id}, 1, 5, 100) returning id`
				// NE pelo caminho antigo (a `main` grava assim): o item nasce no commit.
				const [ne] = await tx`
					insert into finance.empenho (unit_id, arp_item_id, numero_empenho, data_empenho, quantidade_empenhada, valor_unitario, valor_total)
					values (${unit.id}, ${arpItem.id}, '2026NE000777', '2026-07-01', 100, 5, 500) returning id`
				await tx`set constraints finance.empenho_ensure_item immediate`
				const [item] = await tx`select arp_item_id, quantity, unit_price, value from finance.empenho_item where empenho_id = ${ne.id}`
				expect(item.arp_item_id).toBe(arpItem.id)
				expect(Number(item.value)).toBe(500)

				await tx`delete from procurement.procurement_list where id = ${list.id}`
				const [arpAfter] = await tx`select ata_id from procurement.procurement_arp where id = ${arp.id}`
				expect(arpAfter.ata_id).toBeNull()
				const [neAfter] = await tx`select count(*)::int as n from finance.empenho where id = ${ne.id}`
				expect(neAfter.n).toBe(1)

				// Apagar o item de ARP (ou a ARP) com empenho é recusado: RESTRICT, não CASCADE.
				await expect(tx.savepoint((sp) => sp`delete from procurement.procurement_arp_item where id = ${arpItem.id}`)).rejects.toThrow(/foreign key/)
				await expect(tx.savepoint((sp) => sp`delete from procurement.procurement_arp where id = ${arp.id}`)).rejects.toThrow(/foreign key/)

				// Apagar a NE leva os itens (CASCADE) — é o caminho do reset de treino.
				await tx`delete from finance.empenho where id = ${ne.id}`
				const [left] = await tx`select count(*)::int as n from finance.empenho_item where empenho_id = ${ne.id}`
				expect(left.n).toBe(0)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("dispensa só com o tipo; limites do art. 75 semeados; contratação de outra unidade é recusada", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const [unitA] = await tx`insert into core.units (code, display_name) values ('ZZTEST-DISPA', 'unit A') returning id`
				const [unitB] = await tx`insert into core.units (code, display_name) values ('ZZTEST-DISPB', 'unit B') returning id`
				const [acq] = await tx`insert into procurement.acquisition (unit_id, kind) values (${unitA.id}, 'dispensa') returning id, fiscal_year`
				expect(Number(acq.fiscal_year)).toBeGreaterThanOrEqual(2026)

				const [limit] = await tx`select value, source_act from procurement.direct_contract_limit where clause = 'II' and valid_from = '2026-01-01'`
				expect(Number(limit.value)).toBe(65492.11)
				expect(limit.source_act).toContain("12.807")

				// O papel de ata só vale para registro de preços; o inciso só para dispensa.
				await expect(tx.savepoint((sp) => sp`update procurement.acquisition set srp_role = 'participante' where id = ${acq.id}`)).rejects.toThrow(
					/acquisition_srp_role_ck/
				)

				const [ne] =
					await tx`insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total) values (${unitB.id}, '2026NE000901', '2026-09-01', 10) returning id`
				await expect(tx.savepoint((sp) => sp`update finance.empenho set acquisition_id = ${acq.id} where id = ${ne.id}`)).rejects.toThrow(/outra unidade/)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)
})

describeIf("import do SIAFI sem perda (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("NS antes da NE fica estacionada e vira liquidação quando a NE chega; OB idem com a NS", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-SIAFI', 'unit teste siafi') returning id`
				const batch = async (type: string, parsed: Record<string, unknown>, hash: string) => {
					const [b] = await tx`
						insert into siafi_integration.import_batch (unit_id, report_type, file_name, content_hash, status)
						values (${unit.id}, ${type}, ${`${type}.csv`}, ${hash}, 'parsed') returning id`
					await tx`insert into siafi_integration.import_row (batch_id, row_number, raw, parsed, parse_status) values (${b.id}, 1, '{}'::jsonb, ${tx.json(parsed as postgres.JSONValue)}, 'parsed')`
					return b.id as string
				}

				const ns = await batch("ns", { numero_ns: "2026NS000010", ne_origem: "2026NE000123", valor: 100, data: "2026-09-10" }, "hash-ns")
				const [nsResult] = await tx`select siafi_integration.apply_document_batch(${ns}::uuid) as r`
				expect(nsResult.r.waiting).toBe(1)
				const [parked] = await tx`select parse_status, parse_error from siafi_integration.import_row where batch_id = ${ns}`
				expect(parked.parse_status).toBe("waiting_parent")
				expect(parked.parse_error).toBe("Aguardando a NE 2026NE000123")

				const ob = await batch("ob", { numero_ob: "2026OB000005", ns_origem: "2026NS000010", valor: 100, data: "2026-09-12" }, "hash-ob")
				await tx`select siafi_integration.apply_document_batch(${ob}::uuid)`

				const ne = await batch("ne", { numero_ne: "2026ne000123", valor: 500, data: "2026-09-01", nd: "33903007" }, "hash-ne")
				const [neResult] = await tx`select siafi_integration.apply_document_batch(${ne}::uuid) as r`
				expect(neResult.r.created).toBe(1)
				expect(neResult.r.relinked).toBe(2)

				const [empenho] = await tx`select id, acquisition_id, origem from finance.empenho where unit_id = ${unit.id} and numero_empenho = '2026NE000123'`
				expect(empenho.acquisition_id).toBeNull()
				expect(empenho.origem).toBe("siafi")
				const [liq] = await tx`select empenho_id, valor from finance.liquidacao where unit_id = ${unit.id} and numero_ns = '2026NS000010'`
				expect(liq.empenho_id).toBe(empenho.id)
				const [pag] = await tx`select count(*)::int as n from finance.pagamento where unit_id = ${unit.id} and numero_ob = '2026OB000005'`
				expect(pag.n).toBe(1)

				// Lote aplicado não se reaplica.
				await expect(tx.savepoint((sp) => sp`select siafi_integration.apply_document_batch(${ne}::uuid)`)).rejects.toThrow(/já aplicado/)
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("NE registrada à mão é completada pelo número sem trocar o valor; erro de gravação não grava nada e o lote se reaplica", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-SIAFI2', 'unit teste siafi 2') returning id`
				await tx`insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total) values (${unit.id}, '2026NE000200', '2026-09-01', 300)`

				const [b1] = await tx`
					insert into siafi_integration.import_batch (unit_id, report_type, file_name, content_hash, status)
					values (${unit.id}, 'ne', 'ne.csv', 'hash-ne-1', 'parsed') returning id`
				await tx`
					insert into siafi_integration.import_row (batch_id, row_number, raw, parsed, parse_status)
					values (${b1.id}, 1, '{}'::jsonb, ${tx.json({ numero_ne: "2026NE000200", valor: 350, nd: "33903007", ptres: "170963", favorecido_nome: "FORN" })}, 'parsed')`
				const [r1] = await tx`select siafi_integration.apply_document_batch(${b1.id}::uuid) as r`
				expect(r1.r.enriched).toBe(1)
				expect(r1.r.divergent).toBe(1)
				const [completed] =
					await tx`select valor_total, nd, ptres, favorecido_nome from finance.empenho where unit_id = ${unit.id} and numero_empenho = '2026NE000200'`
				expect(Number(completed.valor_total)).toBe(300)
				expect(completed.nd).toBe("33903007")
				expect(completed.favorecido_nome).toBe("FORN")

				// Linha sem valor: o lote inteiro falha e nada entra.
				const [b2] = await tx`
					insert into siafi_integration.import_batch (unit_id, report_type, file_name, content_hash, status)
					values (${unit.id}, 'ne', 'ne2.csv', 'hash-ne-2', 'parsed') returning id`
				await tx`
					insert into siafi_integration.import_row (batch_id, row_number, raw, parsed, parse_status) values
						(${b2.id}, 1, '{}'::jsonb, ${tx.json({ numero_ne: "2026NE000301", valor: 10 })}, 'parsed'),
						(${b2.id}, 2, '{}'::jsonb, ${tx.json({ numero_ne: "2026NE000302" })}, 'parsed')`
				await expect(tx.savepoint((sp) => sp`select siafi_integration.apply_document_batch(${b2.id}::uuid)`)).rejects.toThrow(/sem valor/)
				const [none] =
					await tx`select count(*)::int as n from finance.empenho where unit_id = ${unit.id} and numero_empenho in ('2026NE000301', '2026NE000302')`
				expect(none.n).toBe(0)

				// A server fn marca `failed`; corrigida a linha, o lote se aplica.
				await tx`update siafi_integration.import_batch set status = 'failed', error_message = 'NE 2026NE000302 sem valor no relatório' where id = ${b2.id}`
				await tx`update siafi_integration.import_row set parsed = parsed || '{"valor": 20}'::jsonb where batch_id = ${b2.id} and row_number = 2`
				const [r2] = await tx`select siafi_integration.apply_document_batch(${b2.id}::uuid) as r`
				expect(r2.r.created).toBe(2)
				const [status] = await tx`select status, error_message from siafi_integration.import_batch where id = ${b2.id}`
				expect(status.status).toBe("applied")
				expect(status.error_message).toBeNull()
			})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
