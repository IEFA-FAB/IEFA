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

/**
 * "X horas atrás", comprimido para caber no DIA CIVIL de Brasília. O guard do
 * ledger só aceita `occurred_at` retroativo dentro do mesmo dia, e intervalos
 * fixos ("5 horas atrás") quebravam o teste entre 00h e 05h de Brasília — a
 * mesma armadilha do #370. A hora vira fração do tempo decorrido desde a
 * meia-noite: a ORDEM entre os instantes do teste é preservada, sempre no dia.
 */
function agoIn(tx: postgres.TransactionSql) {
	return (hours: number) =>
		tx`(now() - (now() - (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) * ${hours / 10}::float8)`
}

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
					const ago = agoIn(tx)
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
						values (${kitchenRow.id}, ${arroz.id}, ${lotArroz.id}, 'receipt', 50, 4, ${ago(5)}),
						       (${kitchenRow.id}, ${oleo.id}, ${lotOleo.id}, 'receipt', 60, 8, ${ago(5)})`

					// ── abertura materializa o escopo ────────────────────────────────
					const [aberta] = await tx`
						select * from inventory.open_inventory_count(${kitchenRow.id}, 'rotating', 'full', '{}'::jsonb, true, null, ${autor.id})`
					expect(Number(aberta.scope_items)).toBe(2)
					// a contagem "abriu" há 4 h: o lançamento não pode ser anterior à abertura
					await tx`update inventory.inventory_count set created_at = ${ago(4)} where id = ${aberta.count_id}`

					// ── duas contagens abertas não disputam o mesmo item ─────────────
					await expect(
						tx.savepoint((sp) => sp`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'full', '{}'::jsonb, true, null, ${autor.id})`)
					).rejects.toThrow(/Já existe contagem aberta/)

					// ── duas pessoas contando a mesma prateleira SOMAM ───────────────
					await tx`
						insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
						values (${aberta.count_id}, ${lotArroz.id}, 12, 'ev-a', ${autor.id}, ${ago(3)}),
						       (${aberta.count_id}, ${lotArroz.id}, 38, 'ev-b', ${outro.id}, ${ago(3)})`
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
						values (${kitchenRow.id}, ${arroz.id}, ${lotArroz.id}, 'production_issue', 10, 4, ${ago(1)})`
					const [refs] = await tx`
						select inventory.balance_at(${kitchenRow.id}, ${lotArroz.id}, null, null, ${ago(3)}) as no_instante,
						       inventory.balance_at(${kitchenRow.id}, ${lotArroz.id}, null, null, now()) as agora`
					expect(Number(refs.no_instante)).toBe(50) // contado 50 → diferença ZERO
					expect(Number(refs.agora)).toBe(40)

					// ── óleo contado a menor ─────────────────────────────────────────
					await tx`
						insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
						values (${aberta.count_id}, ${lotOleo.id}, 30, 'ev-c', ${autor.id}, ${ago(3)})`

					// ── aprovar exige a coleta ENCERRADA ─────────────────────────────
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${aberta.count_id}, ${outro.id}, null)`)).rejects.toThrow(
						/encerre a coleta/
					)
					await tx`update inventory.inventory_count set status = 'review' where id = ${aberta.count_id}`

					// ── quem abriu não aprova ────────────────────────────────────────
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${aberta.count_id}, ${autor.id}, null)`)).rejects.toThrow(
						/não a aprova/
					)

					// ── produção concluída espera a requisição da PRODUÇÃO fechada ───
					// (20260920150000) uma avulsa fechada no mesmo dia não basta: ela não
					// diz nada sobre o que o cardápio consumiu
					const hoje = tx`(now() at time zone 'America/Sao_Paulo')::date`
					const [prato] = await tx`insert into kitchen.menu_items default values returning id`
					await tx`insert into kitchen.production_task (kitchen_id, menu_item_id, production_date, status)
						values (${kitchenRow.id}, ${prato.id}, ${hoje}, 'DONE')`
					await tx`insert into inventory.stock_issue_request (kitchen_id, issue_date, origin, purpose, destination, status, closed_at, created_by)
						values (${kitchenRow.id}, ${hoje}, 'ad_hoc', 'apoio', 'ala', 'closed', now(), ${autor.id})`
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${aberta.count_id}, ${outro.id}, null)`)).rejects.toThrow(
						/sem a requisição do dia fechada/
					)
					await tx`insert into inventory.stock_issue_request (kitchen_id, issue_date, origin, status, closed_at, created_by)
						values (${kitchenRow.id}, ${hoje}, 'production', 'closed', now(), ${autor.id})`

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
					await tx`update inventory.inventory_count set created_at = ${ago(1)} where id = ${limpa.count_id}`
					await tx`
						insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
						values (${limpa.count_id}, ${lotArroz.id}, 40, 'ev-d', ${outro.id}, ${ago(0.5)})`
					await tx`update inventory.inventory_count set status = 'review' where id = ${limpa.count_id}`
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

	test("revisão inteira (20260920160000): alçada, sem lote, escopo, não contado, rodadas e transições", async () => {
		await expect(
			sql
				.begin(async (tx) => {
					const ago = agoIn(tx)
					const [unit] = await tx`insert into core.units (code, display_name) values ('ZZTEST-CNT2', 'unit teste contagem 2') returning id`
					const [kitchenRow] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha contagem 2') returning id`
					const [outraCozinha] = await tx`insert into core.kitchen (unit_id, display_name) values (${unit.id}, 'cozinha vizinha') returning id`
					const [arroz] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('ARROZ TESTE CNT2', 'KG') returning id`
					const [feijao] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('FEIJAO TESTE CNT2', 'KG') returning id`
					const [sal] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('SAL TESTE CNT2', 'KG') returning id`
					const users = await tx`select id from auth.users order by id limit 3`
					expect(users).toHaveLength(3)
					const [abre, conta, aprova] = users.map((row) => row.id as string)

					// segregação ESTRITA e alçada baixa: toda divergência passa da alçada
					await tx`insert into inventory.kitchen_stock_settings (kitchen_id, segregation, adjustment_approval_value)
						values (${kitchenRow.id}, 'strict', 1)`

					const lote = async (ingredientId: string, code: string, qty: number, expiry: string, kitchenId = kitchenRow.id) => {
						const [row] = await tx`
							insert into inventory.stock_lot (kitchen_id, ingredient_id, lot_code, unit_cost, expiry_date, received_at)
							values (${kitchenId}, ${ingredientId}, ${code}, 5, ${expiry}::date, now() - interval '10 days') returning id`
						await tx`insert into inventory.stock_movement (kitchen_id, ingredient_id, lot_id, type, quantity, unit_cost, occurred_at)
							values (${kitchenId}, ${ingredientId}, ${row.id}, 'receipt', ${qty}, 5, ${ago(5)})`
						return row.id as string
					}
					const arrozL1 = await lote(arroz.id, "ARZ-L1", 10, "2030-01-10")
					const arrozL2 = await lote(arroz.id, "ARZ-L2", 5, "2030-01-20")
					const feijaoL1 = await lote(feijao.id, "FEI-L1", 8, "2030-02-01")
					const salL1 = await lote(sal.id, "SAL-L1", 3, "2030-03-01")
					// lote de feijão em QUARENTENA, que venceria antes: a falta não sai dele
					const feijaoQ = await lote(feijao.id, "FEI-Q", 5, "2029-12-01")
					await tx`update inventory.stock_lot set quarantined_at = now(), quarantine_reason = 'suspeito' where id = ${feijaoQ}`
					const vizinho = await lote(arroz.id, "VIZ-L1", 4, "2030-01-01", outraCozinha.id)

					const [c] = await tx`
						select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
							${tx.json({ ingredient_ids: [arroz.id, feijao.id, sal.id] })}, true, null, ${abre})`
					await tx`update inventory.inventory_count set created_at = ${ago(4)} where id = ${c.count_id}`
					const lancar = (event: string, target: { lot?: string; ingredient?: string }, qty: number, countId = c.count_id) =>
						tx`insert into inventory.inventory_count_entry (count_id, lot_id, ingredient_id, quantity, client_event_id, counted_by, counted_at)
							values (${countId}, ${target.lot ?? null}, ${target.ingredient ?? null}, ${qty}, ${event}, ${conta}, ${ago(3)})`

					// ── lançamento fora do escopo, de outra cozinha ou fora do tempo ──
					const [milho] = await tx`insert into kitchen.ingredient (description, measure_unit) values ('MILHO TESTE CNT2', 'KG') returning id`
					await expect(
						tx.savepoint(
							(sp) => sp`insert into inventory.inventory_count_entry (count_id, ingredient_id, quantity, client_event_id, counted_by)
						values (${c.count_id}, ${milho.id}, 1, 'fora-escopo', ${conta})`
						)
					).rejects.toThrow(/não está no escopo/)
					await expect(
						tx.savepoint(
							(sp) => sp`insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by)
						values (${c.count_id}, ${vizinho}, 1, 'outra-cozinha', ${conta})`
						)
					).rejects.toThrow(/outra cozinha/)
					await expect(
						tx.savepoint(
							(sp) => sp`insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by, counted_at)
						values (${c.count_id}, ${arrozL1}, 1, 'antes', ${conta}, ${ago(6)})`
						)
					).rejects.toThrow(/fora da contagem/)

					// ── achado: entra no escopo; repetido é no-op ───────────────────
					const [{ add_found_item: added }] = await tx`select inventory.add_found_item(${c.count_id}, ${milho.id}, null)`
					expect(added).toBe(true)
					const [{ add_found_item: again }] = await tx`select inventory.add_found_item(${c.count_id}, ${milho.id}, null)`
					expect(again).toBe(false)

					// ── arroz: L1 contado por lote (10) + 5 soltos → diferença ZERO ─
					await lancar("arz-l1", { lot: arrozL1 }, 10)
					await lancar("arz-solto", { ingredient: arroz.id }, 5)
					// feijão: contado a menor, SEM lote (8 no ledger, 6 na prateleira)
					await lancar("fei-solto", { ingredient: feijao.id }, 6)
					// sal: ninguém contou — aceito como não contado
					await tx`select inventory.set_not_counted_accepted(${c.count_id}, ${sal.id}, null, true)`

					const linhas = await tx`select * from inventory.count_lines(${c.count_id})`
					const arrozSolto = linhas.find((row) => row.ingredient_id === arroz.id && row.lot_id == null)
					expect(Number(arrozSolto?.counted_qty)).toBe(5)
					// saldo do item (15) − lote contado à parte (10) = 5: sem diferença
					expect(Number(arrozSolto?.ledger_qty)).toBe(5)

					// ── rodada 2: o feijão é recontado; o arroz fica da rodada 1 ─────
					await tx`update inventory.inventory_count set status = 'review' where id = ${c.count_id}`
					// o milho (achado) ficou sem lançamento e sem decisão: a recontagem não abre
					await expect(tx.savepoint((sp) => sp`select inventory.open_recount(${c.count_id}, ${[feijao.id]}::uuid[], '{}'::uuid[], ${abre})`)).rejects.toThrow(
						/sem lançamento e sem decisão/
					)
					await tx`select inventory.set_not_counted_accepted(${c.count_id}, ${milho.id}, null, true)`
					const [{ open_recount: filha }] = await tx`select inventory.open_recount(${c.count_id}, ${[feijao.id]}::uuid[], '{}'::uuid[], ${abre})`
					await tx`update inventory.inventory_count set created_at = ${ago(4)} where id = ${filha}`
					// a rodada anterior não aceita mais lançamento nem aprovação
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${c.count_id}, ${aprova}, null)`)).rejects.toThrow(
						/não está aguardando aprovação/
					)
					// o monte de feijão: 7 soltos; o lote em quarentena NÃO foi contado por lote
					await lancar("fei-r2", { ingredient: feijao.id }, 7, filha)
					await tx`update inventory.inventory_count set status = 'review' where id = ${filha}`
					// falta sem lote com lote em quarentena não contado: recusa (a falta
					// nem sai do suspeito nem é jogada nos sadios)
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${filha}, ${aprova}, null)`)).rejects.toThrow(
						/está em quarentena e não foi contado por lote/
					)
					// conta-se o lote em quarentena à parte (5) e a coleta volta a fechar
					await tx`update inventory.inventory_count set status = 'counting' where id = ${filha}`
					await lancar("fei-q", { lot: feijaoQ }, 5, filha)
					await tx`update inventory.inventory_count set status = 'review' where id = ${filha}`

					// ── strict: quem contou na rodada 1 não aprova a rodada 2 ────────
					await expect(tx.savepoint((sp) => sp`select * from inventory.approve_inventory_count(${filha}, ${conta}, null)`)).rejects.toThrow(
						/Segregação estrita/
					)

					// ── terceiro aprova, mesmo acima da alçada, em strict ────────────
					const [aprovada] = await tx`select * from inventory.approve_inventory_count(${filha}, ${aprova}, null)`
					const itens = await tx`
						select i.lot_id, i.direction, i.quantity from inventory.stock_adjustment_item i
						 where i.adjustment_id = ${aprovada.adjustment_id} order by i.quantity`
					// feijão: 7 (rodada 2) contra 8 → 1 de falta, saindo do lote não contado;
					// sal: aceito como não contado → 3 saem do lote
					expect(itens.map((row) => [row.lot_id, row.direction, Number(row.quantity)])).toEqual([
						[feijaoL1, "out", 1],
						[salL1, "out", 3],
					])
					const [autorAjuste] = await tx`select created_by from inventory.stock_adjustment where id = ${aprovada.adjustment_id}`
					// o autor do ajuste é quem abriu a contagem, não quem aprovou
					expect(autorAjuste.created_by).toBe(abre)
					const estados = await tx`select id, status from inventory.inventory_count where id in (${c.count_id}, ${filha})`
					expect(estados.every((row) => row.status === "approved")).toBe(true)
					// o arroz não foi ajustado: L2 segue com 5
					const [l2] = await tx`select balance from inventory.v_stock_balance where lot_id = ${arrozL2}`
					expect(Number(l2.balance)).toBe(5)

					// ── contagem aprovada não se rejeita nem recebe lançamento ───────
					await expect(tx.savepoint((sp) => sp`select inventory.reject_inventory_count(${filha}, ${aprova}, 'motivo qualquer')`)).rejects.toThrow(
						/não pode ser rejeitada/
					)
					await expect(
						tx.savepoint(
							(sp) => sp`insert into inventory.inventory_count_entry (count_id, lot_id, quantity, client_event_id, counted_by)
								values (${filha}, ${arrozL1}, 1, 'tarde', ${conta})`
						)
					).rejects.toThrow(/não aceita lançamento/)

					// a quarentena ficou intocada: a falta não soltou o lote suspeito
					const [quarentena] = await tx`select quarantined_at from inventory.stock_lot where id = ${feijaoQ}`
					expect(quarentena.quarantined_at).not.toBeNull()

					// ── a rodada anterior vence com a cadeia, não sozinha ────────────
					const [v1] = await tx`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
						${tx.json({ ingredient_ids: [sal.id] })}, true, null, ${abre})`
					await tx`update inventory.inventory_count set status = 'review' where id = ${v1.count_id}`
					await tx`select inventory.set_not_counted_accepted(${v1.count_id}, ${sal.id}, null, true)`
					await tx`update inventory.count_scope_item set not_counted_accepted = false where count_id = ${v1.count_id}`
					const [{ open_recount: v2 }] = await tx`select inventory.open_recount(${v1.count_id}, ${[sal.id]}::uuid[], '{}'::uuid[], ${abre})`
					// a mãe "venceu" no relógio, mas a recontagem dela vive: ela segue esperando
					await tx`update inventory.inventory_count set expires_at = now() - interval '1 minute' where id = ${v1.count_id}`
					// abrir outra contagem é o que dispara a expiração; ela é rejeitada logo
					// em seguida para não segurar o arroz nos passos seguintes
					const [gatilho] = await tx`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
						${tx.json({ ingredient_ids: [arroz.id] })}, true, null, ${abre})`
					await tx`select inventory.reject_inventory_count(${gatilho.count_id}, ${aprova}, 'só dispara a expiração')`
					const [maeViva] = await tx`select status from inventory.inventory_count where id = ${v1.count_id}`
					expect(maeViva.status).toBe("recount")
					// vence a recontagem: a mãe vence junto
					await tx`update inventory.inventory_count set expires_at = now() - interval '1 minute' where id = ${v2}`
					const [gatilho2] = await tx`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
						${tx.json({ ingredient_ids: [arroz.id] })}, true, null, ${abre})`
					await tx`select inventory.reject_inventory_count(${gatilho2.count_id}, ${aprova}, 'só dispara a expiração')`
					const cadeia = await tx`select status from inventory.inventory_count where id in (${v1.count_id}, ${v2})`
					expect(cadeia.every((row) => row.status === "expired")).toBe(true)

					// ── achado que está em OUTRA contagem aberta ─────────────────────
					const [a] = await tx`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
						${tx.json({ ingredient_ids: [arroz.id] })}, true, null, ${abre})`
					const [b] = await tx`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
						${tx.json({ ingredient_ids: [feijao.id] })}, true, null, ${abre})`
					await expect(tx.savepoint((sp) => sp`select inventory.add_found_item(${b.count_id}, ${arroz.id}, null)`)).rejects.toThrow(/outra contagem aberta/)
					// rejeitar em coleta libera o escopo
					await tx`select inventory.reject_inventory_count(${a.count_id}, ${aprova}, 'contagem errada')`
					const [{ add_found_item: agora }] = await tx`select inventory.add_found_item(${b.count_id}, ${arroz.id}, null)`
					expect(agora).toBe(true)

					// ── a guarda de "sem decisão" vale também para preparação congelada ─
					// (`NULL = any(...)` deixava passar a linha de preparação quando a
					// recontagem era só de insumos)
					const [congelado] = await tx`insert into kitchen.frozen_preparation (description) values ('CALDO TESTE CNT2') returning id`
					const [w] = await tx`select * from inventory.open_inventory_count(${kitchenRow.id}, 'eventual', 'item_list',
						${tx.json({ ingredient_ids: [sal.id] })}, true, null, ${abre})`
					await tx`select inventory.add_found_item(${w.count_id}, null, ${congelado.id})`
					await tx`insert into inventory.inventory_count_entry (count_id, ingredient_id, quantity, client_event_id, counted_by)
						values (${w.count_id}, ${sal.id}, 1, 'sal-w', ${conta})`
					await tx`update inventory.inventory_count set status = 'review' where id = ${w.count_id}`
					await expect(tx.savepoint((sp) => sp`select inventory.open_recount(${w.count_id}, ${[sal.id]}::uuid[], '{}'::uuid[], ${abre})`)).rejects.toThrow(
						/sem lançamento e sem decisão/
					)

					throw new Rollback()
				})
				.catch((err: unknown) => {
					if (err instanceof Rollback) return "rolled-back"
					throw err
				})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
