/**
 * Integração — execução orçamentária contra o banco REAL migrado.
 *
 * Cadeia completa numa transação com ROLLBACK: crédito → empenho → reforço →
 * anulação → liquidação vinculada ao recebimento → pagamento, verificando as
 * invariantes (`pago ≤ liquidado ≤ vigente`), os saldos derivados e a
 * conciliação físico × contábil.
 */
import { splitRestosAPagar } from "@iefa/sisub-domain"
import postgres from "postgres"
import { afterAll, beforeAll, expect, test } from "vitest"
import { describeSupabaseIntegration, getSisubDatabaseUrl } from "../supabase"

const url = getSisubDatabaseUrl()
const describeIf = url ? describeSupabaseIntegration : describeSupabaseIntegration.skip

class Rollback extends Error {}

describeIf("budget execution chain (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("crédito → empenho → eventos → liquidação → pagamento, com invariantes", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					// ── fixtures ────────────────────────────────────────────────────
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-BUDGET', 'unit teste orçamento') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha orçamento') returning id`
					const [list] = await tx`insert into procurement.quantity_estimate (unit_id, title) values (${unit.id}, 'lista orçamento') returning id`
					const [arp] = await tx`
						insert into procurement.procurement_arp (unit_id, quantity_estimate_id, numero_ata, uasg_gerenciadora)
						values (${unit.id}, ${list.id}, 'ATA-ORC', '160077') returning id`
					const [arpItem] = await tx`
						insert into procurement.procurement_arp_item (arp_id, numero_item, quantidade_homologada, ni_fornecedor, nome_fornecedor)
						values (${arp.id}, 1, 1000, '12345678000199', 'FORNECEDOR ORC') returning id`

					// ── crédito: snapshot do SIAFI ──────────────────────────────────
					await tx`
						insert into finance.budget_credit (unit_id, ug, nd, ptres, fonte, competencia, dotacao, empenhado_siafi, saldo_siafi)
						values (${unit.id}, '120070', '33903007', '170963', '1000', date_trunc('month', current_date)::date, 500000, 120000, 380000)`
					const [credito] = await tx`select dotacao, saldo_siafi from finance.budget_credit where unit_id = ${unit.id}`
					expect(Number(credito.saldo_siafi)).toBe(380000)

					// ── empenho como documento ──────────────────────────────────────
					const [empenho] = await tx`
						insert into finance.empenho
							(unit_id, numero_empenho, data_empenho, valor_total, tipo, favorecido_cnpj, nd, ptres, fonte, exercicio, origem)
						values (${unit.id}, '2026NE00ORC1', current_date, 10000,
							'ordinario', '12345678000199', '33903007', '170963', '1000', extract(year from current_date)::int, 'manual')
						returning id`
					await tx`
						insert into finance.empenho_item (empenho_id, arp_item_id, quantity, unit_price, value)
						values (${empenho.id}, ${arpItem.id}, 100, 100, 10000)`

					const [vigente0] = await tx`select valor_vigente from finance.v_empenho_saldo where empenho_id = ${empenho.id}`
					expect(Number(vigente0.valor_vigente)).toBe(10000)

					// ── reforço +5.000 → vigente 15.000 ─────────────────────────────
					await tx`
						insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa)
						values (${empenho.id}, 'reforco', 5000, current_date, 'Reforço para complemento do fornecimento')`
					const [vigente1] = await tx`select valor_vigente from finance.v_empenho_saldo where empenho_id = ${empenho.id}`
					expect(Number(vigente1.valor_vigente)).toBe(15000)

					// evento sem justificativa → rejeitado pela constraint
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa)
								values (${empenho.id}, 'anulacao', 100, current_date, '   ')`
						)
					).rejects.toThrow()

					// ── liquidação vinculada ao recebimento definitivo ───────────────
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ ORC', 'KG') returning id`
					// Os itens entram com o recebimento AINDA ABERTO e só então ele é
					// efetivado. O banco recusa escrita em recebimento efetivado (o
					// termo do art. 140 não muda depois de assinado), e a ordem inversa
					// só funcionava porque essa trava não existia.
					const [receipt] = await tx`
						insert into inventory.goods_receipt (kitchen_id, empenho_id, status)
						values (${kitchenRow.id}, ${empenho.id}, 'provisional') returning id`
					await tx`
						insert into inventory.goods_receipt_item (receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost)
						values (${receipt.id}, ${ingredient.id}, 100, 96, 100)`
					await tx`update inventory.goods_receipt set status = 'definitive', definitive_at = now() where id = ${receipt.id}`

					// físico × contábil: recebimento definitivo AINDA sem liquidação
					const [pendencia] = await tx`
						select situacao, valor_recebido from finance.v_physical_accounting_reconciliation where goods_receipt_id = ${receipt.id}`
					expect(pendencia.situacao).toBe("sem_liquidacao")
					expect(Number(pendencia.valor_recebido)).toBe(9600)

					const [liquidacao] = await tx`
						insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor, goods_receipt_id)
						values (${unit.id}, ${empenho.id}, '2026NS00ORC1', current_date, 9600, ${receipt.id}) returning id`
					await tx`update inventory.goods_receipt set liquidacao_id = ${liquidacao.id} where id = ${receipt.id}`

					const [saldo1] = await tx`select valor_liquidado, saldo_a_liquidar from finance.v_empenho_saldo where empenho_id = ${empenho.id}`
					expect(Number(saldo1.valor_liquidado)).toBe(9600)
					expect(Number(saldo1.saldo_a_liquidar)).toBe(5400)

					// agora concilia (valor recebido == liquidado)
					const [conciliado] = await tx`
						select situacao from finance.v_physical_accounting_reconciliation where goods_receipt_id = ${receipt.id}`
					expect(conciliado.situacao).toBe("conciliado")

					// ── invariante: liquidar acima do vigente é rejeitado ───────────
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor)
								values (${unit.id}, ${empenho.id}, '2026NS00ORC9', current_date, 99999)`
						)
					).rejects.toThrow(/excede o empenho/)

					// ── pagamento parcial e invariante do pago ──────────────────────
					await tx`
						insert into finance.pagamento (unit_id, liquidacao_id, numero_ob, data, valor)
						values (${unit.id}, ${liquidacao.id}, '2026OB00ORC1', current_date, 4000)`
					const [saldo2] = await tx`select valor_pago, valor_a_pagar from finance.v_empenho_saldo where empenho_id = ${empenho.id}`
					expect(Number(saldo2.valor_pago)).toBe(4000)
					expect(Number(saldo2.valor_a_pagar)).toBe(5600)

					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.pagamento (unit_id, liquidacao_id, numero_ob, data, valor)
								values (${unit.id}, ${liquidacao.id}, '2026OB00ORC9', current_date, 99999)`
						)
					).rejects.toThrow(/excede a liquidação/)

					// ── anulação não pode derrubar o vigente abaixo do liquidado ────
					// (regra da fn; aqui verificamos o efeito no saldo derivado)
					await tx`
						insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa)
						values (${empenho.id}, 'anulacao', 5000, current_date, 'Anulação de saldo não utilizado')`
					const [saldo3] = await tx`select valor_vigente, valor_liquidado, saldo_a_liquidar from finance.v_empenho_saldo where empenho_id = ${empenho.id}`
					expect(Number(saldo3.valor_vigente)).toBe(10000)
					expect(Number(saldo3.saldo_a_liquidar)).toBe(400)

					// ── hardening (review): anulação abaixo do liquidado é barrada
					//    pelo BANCO, não só pela server fn (TOCTOU) ───────────────────
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa)
								values (${empenho.id}, 'anulacao', 9999, current_date, 'Anulação inválida — abaixo do liquidado')`
						)
					).rejects.toThrow(/abaixo do já liquidado/)

					// ── hardening (review): crédito com ug/ptres/fonte NULOS ainda
					//    dedupe (UNIQUE NULLS NOT DISTINCT) — antes duplicava ─────────
					await tx`
						insert into finance.budget_credit (unit_id, nd, competencia, dotacao, empenhado_siafi, saldo_siafi)
						values (${unit.id}, '33903099', date_trunc('month', current_date)::date, 1000, 0, 1000)`
					await tx`
						insert into finance.budget_credit (unit_id, nd, competencia, dotacao, empenhado_siafi, saldo_siafi)
						values (${unit.id}, '33903099', date_trunc('month', current_date)::date, 2000, 0, 2000)
						on conflict (unit_id, ug, nd, ptres, fonte, competencia)
						do update set dotacao = excluded.dotacao, saldo_siafi = excluded.saldo_siafi`
					const nulos = await tx`select dotacao from finance.budget_credit where unit_id = ${unit.id} and nd = '33903099'`
					expect(nulos).toHaveLength(1)
					expect(Number(nulos[0]?.dotacao)).toBe(2000)

					// ── hardening (review): lote aplicado não aplica de novo ─────────
					const [batch] = await tx`
						insert into siafi_integration.import_batch (unit_id, report_type, file_name, content_hash, status, applied_at)
						values (${unit.id}, 'ne', 'ne.csv', ${`hash-${unit.id}`}, 'applied', now()) returning id`
					await expect(tx.savepoint((sp) => sp`select * from siafi_integration.claim_import_batch(${batch.id})`)).rejects.toThrow(/já aplicado/)

					// ── conciliação de documentos: empenho só no sisub ──────────────
					const [reconc] = await tx`
						select situacao from finance.v_siafi_reconciliation
						where unit_id = ${unit.id} and documento_tipo = 'ne' and numero_documento = '2026NE00ORC1'`
					expect(reconc.situacao).toBe("apenas_sisub")

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)

	/**
	 * Execução financeira conforme (20260926216000): NC, RP em duas parcelas, retenções com a
	 * OB pelo líquido, teto da NS pelo recebido e o alias `anulacao_total`. Mesma transação com
	 * ROLLBACK do caso acima.
	 */
	test("NC, RP em duas parcelas, OB pelo líquido com DARF e NS limitada ao recebido", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					// ── fixtures ────────────────────────────────────────────────────
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-COMPLY', 'unit teste conformidade') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha conformidade') returning id`
					const [list] = await tx`insert into procurement.quantity_estimate (unit_id, title) values (${unit.id}, 'lista conformidade') returning id`
					const [arp] = await tx`
						insert into procurement.procurement_arp (unit_id, quantity_estimate_id, numero_ata, uasg_gerenciadora)
						values (${unit.id}, ${list.id}, 'ATA-CMP', '160077') returning id`
					const [arpItem] = await tx`
						insert into procurement.procurement_arp_item (arp_id, numero_item, quantidade_homologada, ni_fornecedor, nome_fornecedor)
						values (${arp.id}, 1, 1000, '12345678000199', 'FORNECEDOR CMP') returning id`
					const [empenho] = await tx`
						insert into finance.empenho
							(unit_id, numero_empenho, data_empenho, valor_total, tipo, favorecido_cnpj, nd, ptres, fonte, exercicio, origem)
						values (${unit.id}, '2026NE00CMP1', current_date, 10000,
							'ordinario', '12345678000199', '33903007', '170963', '1000', extract(year from current_date)::int, 'manual')
						returning id`
					await tx`
						insert into finance.empenho_item (empenho_id, arp_item_id, quantity, unit_price, value)
						values (${empenho.id}, ${arpItem.id}, 100, 100, 10000)`

					// ── (F5) nota de crédito ────────────────────────────────────────
					await tx`
						insert into finance.credit_note (unit_id, number, issued_on, kind, issuer_ug, beneficiary_ug, budget_sphere, ptres, fonte, nd, pi, ugr, amount)
						values (${unit.id}, '2026NC000001', current_date, 'descentralizacao', '120001', '120070', '1', '170963', '1000', '339030', 'PIRANCHO', '120001', 50000)`
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.credit_note (unit_id, number, issued_on, issuer_ug, amount)
								values (${unit.id}, '2026NC000001', current_date, '120001', 1)`
						)
					).rejects.toThrow(/credit_note_number_key/)
					await tx`
						insert into finance.budget_credit (unit_id, ug, nd, ptres, fonte, pi, ugr, competencia, dotacao, empenhado_siafi, saldo_siafi)
						values (${unit.id}, '120070', '339030', '170963', '1000', 'PIRANCHO', '120001', date_trunc('month', current_date)::date, 50000, 0, 50000)`

					// ── (F2) recebimento: 96 × R$ 100 = R$ 9.600 ────────────────────
					const [ingredient] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ CMP', 'KG') returning id`
					const [receipt] = await tx`
						insert into inventory.goods_receipt (kitchen_id, empenho_id, status)
						values (${kitchenRow.id}, ${empenho.id}, 'provisional') returning id`
					await tx`
						insert into inventory.goods_receipt_item (receipt_id, ingredient_id, invoiced_qty_base, received_qty_base, unit_cost)
						values (${receipt.id}, ${ingredient.id}, 100, 96, 100)`
					await tx`update inventory.goods_receipt set status = 'definitive', definitive_at = now() where id = ${receipt.id}`

					const [liquidacao] = await tx`
						insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor, goods_receipt_id)
						values (${unit.id}, ${empenho.id}, '2026NS00CMP1', current_date, 9000, ${receipt.id}) returning id`
					// NS que passaria o recebido é recusada pelo banco (pagar pelo que não chegou)
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor, goods_receipt_id)
								values (${unit.id}, ${empenho.id}, '2026NS00CMP2', current_date, 601, ${receipt.id})`
						)
					).rejects.toThrow(/excede o valor recebido/)
					// sem recebimento continua aceita (vira pendência na tela)
					await tx`
						insert into finance.liquidacao (unit_id, empenho_id, numero_ns, data, valor)
						values (${unit.id}, ${empenho.id}, '2026NS00CMP3', current_date, 400)`

					// ── (F7) retenções: IR recolhido + CSLL a recolher ──────────────
					await tx`
						insert into finance.liquidacao_deduction (liquidacao_id, kind, amount, document_kind, document_number, paid_on)
						values (${liquidacao.id}, 'ir', 432, 'darf', '0000000000000001', current_date)`
					await tx`insert into finance.liquidacao_deduction (liquidacao_id, kind, amount) values (${liquidacao.id}, 'csll', 94.5)`
					// a OB paga o líquido: 9.000 − 526,50 = 8.473,50
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.pagamento (unit_id, liquidacao_id, numero_ob, data, valor)
								values (${unit.id}, ${liquidacao.id}, '2026OB00CMP9', current_date, 9000)`
						)
					).rejects.toThrow(/excede a liquidação pelo líquido/)
					await tx`
						insert into finance.pagamento (unit_id, liquidacao_id, numero_ob, data, valor)
						values (${unit.id}, ${liquidacao.id}, '2026OB00CMP1', current_date, 8473.5)`
					await expect(
						tx.savepoint((sp) => sp`insert into finance.liquidacao_deduction (liquidacao_id, kind, amount) values (${liquidacao.id}, 'iss', 1)`)
					).rejects.toThrow(/Dedução excede a liquidação/)

					const [saldo] = await tx`
						select valor_vigente, valor_liquidado, valor_pago, saldo_a_liquidar, valor_a_pagar, deductions_total, deductions_to_remit
						from finance.v_empenho_saldo where empenho_id = ${empenho.id}`
					expect(Number(saldo.valor_liquidado)).toBe(9400)
					// pago = OB ao credor + retenção recolhida
					expect(Number(saldo.valor_pago)).toBe(8905.5)
					// a pagar = a NS sem recebimento (400) + a CSLL ainda não recolhida (94,50)
					expect(Number(saldo.valor_a_pagar)).toBe(494.5)
					expect(Number(saldo.deductions_total)).toBe(526.5)
					expect(Number(saldo.deductions_to_remit)).toBe(94.5)

					// ── (F6) RP em duas parcelas, derivadas do saldo ────────────────
					const split = splitRestosAPagar({
						valorVigente: Number(saldo.valor_vigente),
						valorLiquidado: Number(saldo.valor_liquidado),
						valorPago: Number(saldo.valor_pago),
					})
					expect(split).toEqual({ processado: 494.5, naoProcessado: 600 })
					await tx`
						insert into finance.empenho_rp_inscription (empenho_id, fiscal_year, kind, amount, inscribed_on)
						values (${empenho.id}, extract(year from current_date)::int, 'processado', ${split.processado}, current_date),
						       (${empenho.id}, extract(year from current_date)::int, 'nao_processado', ${split.naoProcessado}, current_date)`
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.empenho_rp_inscription (empenho_id, fiscal_year, kind, amount, inscribed_on)
								values (${empenho.id}, extract(year from current_date)::int, 'processado', 1, current_date)`
						)
					).rejects.toThrow(/empenho_rp_inscription_active_parcel_key/)
					// recálculo: a parcela substituída fica como trilha e libera a nova
					await tx`
						update finance.empenho_rp_inscription set superseded_at = now(), supersede_reason = 'saldo de 31/12 recalculado'
						where empenho_id = ${empenho.id} and kind = 'processado' and superseded_at is null`
					await tx`
						insert into finance.empenho_rp_inscription (empenho_id, fiscal_year, kind, amount, inscribed_on)
						values (${empenho.id}, extract(year from current_date)::int, 'processado', 400, current_date)`
					const parcels = await tx`
						select kind, amount, superseded_at is not null as superseded from finance.empenho_rp_inscription
						where empenho_id = ${empenho.id} and kind = 'processado' order by created_at, superseded_at nulls last`
					expect(parcels.map((p) => p.superseded)).toEqual([true, false])

					// ── (F8) anulação total pelo nome novo: reduz o vigente e respeita o piso
					await expect(
						tx.savepoint(
							(sp) => sp`insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa)
								values (${empenho.id}, 'anulacao_total', 700, current_date, 'Anulação total do saldo')`
						)
					).rejects.toThrow(/abaixo do já liquidado/)
					await tx`
						insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa)
						values (${empenho.id}, 'anulacao_total', 600, current_date, 'Anulação do saldo não liquidado')`
					const [vigente] = await tx`select valor_vigente from finance.v_empenho_vigente where empenho_id = ${empenho.id}`
					expect(Number(vigente.valor_vigente)).toBe(9400)

					// ── cascata: filhos sem unit_id somem com o pai (é o que o reset usa)
					await tx`delete from finance.pagamento where liquidacao_id = ${liquidacao.id}`
					await tx`delete from finance.liquidacao where id = ${liquidacao.id}`
					const [deductions] = await tx`select count(*)::int as n from finance.liquidacao_deduction where liquidacao_id = ${liquidacao.id}`
					expect(deductions.n).toBe(0)

					throw new Rollback()
				})
				.catch((err) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
