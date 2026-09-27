/**
 * Integração — camada de compatibilidade do lote 4 da linguagem ubíqua (20260927080000), exercitada
 * pelo caminho LEGADO: é o que o código da `main` em produção faz entre a aplicação do expand e o
 * deploy do código novo.
 *
 *   * `finance.budget_credit.received_credit`/`available_credit_siafi` convivem com
 *     `dotacao`/`saldo_siafi`, e `finance.empenho.issuer_ug` com `ug_emitente`, com um trigger que
 *     espelha os dois sentidos e recusa valores divergentes;
 *   * as antigas ficam anuláveis e sem default (o trigger as preenche), para o código novo não
 *     precisar citá-las; nenhuma das duas informada = 0, o default de antes;
 *   * `siafi_integration.apply_document_row` grava `issuer_ug`, e o espelho leva a `ug_emitente`.
 *
 * Sai no contract (20260927090000) junto com a camada que ele testa. Entre a aplicação do contract
 * e o merge do PR dele, o banco já não tem as colunas antigas e a `main` ainda tem este arquivo: os
 * casos se pulam quando a coluna nova existe e a antiga não, para não avermelhar o gate de todo PR
 * nessa janela. Antes do expand (a nova ainda não existe), falham.
 *
 * Banco real, `sql.begin` + ROLLBACK final: nada persiste.
 */
import postgres from "postgres"
import { afterAll, beforeAll, expect, type TestContext, test } from "vitest"
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

/** Recusa esperada dentro da transação, isolada num savepoint para a transação seguir. */
async function refused(tx: postgres.TransactionSql, body: (sp: postgres.TransactionSql) => Promise<unknown>): Promise<string> {
	try {
		await tx.savepoint(body)
	} catch (err) {
		return (err as Error).message
	}
	return "aceito"
}

async function seedUnit(tx: postgres.TransactionSql, code: string): Promise<number> {
	const [unit] = await tx`insert into core.units (code, display_name) values (${code}, 'unit teste lote 4') returning id`
	return Number(unit.id)
}

describeIf("compatibilidade do lote 4 (crédito recebido, crédito disponível, UG emitente) (DB)", () => {
	let sql: postgres.Sql

	/** Contract já aplicado: a camada que este arquivo testa não existe mais. */
	let contracted = false

	beforeAll(async () => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
		const [state] = await sql<{ legacy: boolean; current: boolean }[]>`
			select
				exists (select 1 from information_schema.columns where table_schema = 'finance' and table_name = 'budget_credit' and column_name = 'dotacao') as legacy,
				exists (select 1 from information_schema.columns where table_schema = 'finance' and table_name = 'budget_credit' and column_name = 'received_credit') as current`
		contracted = state.current && !state.legacy
	})

	const skipIfContracted = (ctx: TestContext) => {
		if (contracted) ctx.skip("contract 20260927090000 aplicado: a camada de compatibilidade já saiu")
	}

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("as colunas antigas ficam anuláveis e sem default; as novas, obrigatórias", async (ctx) => {
		skipIfContracted(ctx)
		const columns = await sql<{ name: string; nullable: string; default: string | null }[]>`
			select table_name || '.' || column_name as name, is_nullable as nullable, column_default as default
			from information_schema.columns
			where table_schema = 'finance'
				and (table_name, column_name) in (
					('budget_credit', 'dotacao'), ('budget_credit', 'saldo_siafi'), ('budget_credit', 'received_credit'),
					('budget_credit', 'available_credit_siafi'), ('empenho', 'ug_emitente'), ('empenho', 'issuer_ug')
				)
			order by 1`
		expect(columns).toEqual([
			{ name: "budget_credit.available_credit_siafi", nullable: "NO", default: null },
			{ name: "budget_credit.dotacao", nullable: "YES", default: null },
			{ name: "budget_credit.received_credit", nullable: "NO", default: null },
			{ name: "budget_credit.saldo_siafi", nullable: "YES", default: null },
			{ name: "empenho.issuer_ug", nullable: "YES", default: null },
			{ name: "empenho.ug_emitente", nullable: "YES", default: null },
		])
	})

	test("crédito: o código antigo grava e lê dotacao/saldo_siafi, o novo received_credit/available_credit_siafi", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const unitId = await seedUnit(tx, "ZZTEST-L4-CR")
				const read = async (nd: string) => {
					const [row] = await tx`
						select dotacao, saldo_siafi, received_credit, available_credit_siafi
						from finance.budget_credit where unit_id = ${unitId} and nd = ${nd}`
					return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? null : Number(v)]))
				}

				// Insert da `main` (o upsert do lote de crédito e a suíte gravam os nomes antigos).
				await tx`
					insert into finance.budget_credit (unit_id, ug, nd, ptres, fonte, competencia, dotacao, empenhado_siafi, saldo_siafi)
					values (${unitId}, '120070', '33903007', '170963', '1000', '2026-09-01', 500000, 120000, 380000)`
				expect(await read("33903007")).toEqual({ dotacao: 500000, saldo_siafi: 380000, received_credit: 500000, available_credit_siafi: 380000 })

				// Sem nenhuma das duas: o default de antes (0) nas duas.
				await tx`insert into finance.budget_credit (unit_id, nd, competencia) values (${unitId}, '33903099', '2026-09-01')`
				expect(await read("33903099")).toEqual({ dotacao: 0, saldo_siafi: 0, received_credit: 0, available_credit_siafi: 0 })

				// Insert do código novo: a antiga é preenchida pelo espelho.
				await tx`
					insert into finance.budget_credit (unit_id, nd, competencia, received_credit, empenhado_siafi, available_credit_siafi)
					values (${unitId}, '33903011', '2026-09-01', 1000, 200, 800)`
				expect(await read("33903011")).toEqual({ dotacao: 1000, saldo_siafi: 800, received_credit: 1000, available_credit_siafi: 800 })

				// Upsert da `main` pela chave de classificação (`on conflict … do update` pelos nomes antigos).
				await tx`
					insert into finance.budget_credit (unit_id, nd, competencia, dotacao, empenhado_siafi, saldo_siafi)
					values (${unitId}, '33903099', '2026-09-01', 2000, 0, 2000)
					on conflict (unit_id, ug, nd, ptres, fonte, competencia)
					do update set dotacao = excluded.dotacao, saldo_siafi = excluded.saldo_siafi`
				expect(await read("33903099")).toEqual({ dotacao: 2000, saldo_siafi: 2000, received_credit: 2000, available_credit_siafi: 2000 })

				// Upsert do código novo, pelos nomes novos.
				await tx`
					insert into finance.budget_credit (unit_id, nd, competencia, received_credit, empenhado_siafi, available_credit_siafi)
					values (${unitId}, '33903099', '2026-09-01', 3000, 500, 2500)
					on conflict (unit_id, ug, nd, ptres, fonte, competencia)
					do update set received_credit = excluded.received_credit, available_credit_siafi = excluded.available_credit_siafi`
				expect(await read("33903099")).toEqual({ dotacao: 3000, saldo_siafi: 2500, received_credit: 3000, available_credit_siafi: 2500 })

				// Update por um nome e pelo outro.
				await tx`update finance.budget_credit set dotacao = 4000 where unit_id = ${unitId} and nd = '33903099'`
				await tx`update finance.budget_credit set available_credit_siafi = 3500 where unit_id = ${unitId} and nd = '33903099'`
				expect(await read("33903099")).toEqual({ dotacao: 4000, saldo_siafi: 3500, received_credit: 4000, available_credit_siafi: 3500 })

				// As duas mudadas para o mesmo valor passam; para valores diferentes, não.
				await tx`update finance.budget_credit set dotacao = 4100, received_credit = 4100 where unit_id = ${unitId} and nd = '33903099'`
				expect(await read("33903099")).toMatchObject({ dotacao: 4100, received_credit: 4100 })
				expect(
					await refused(tx, (sp) => sp`update finance.budget_credit set dotacao = 1, received_credit = 2 where unit_id = ${unitId} and nd = '33903099'`)
				).toMatch(/divergem/)
				expect(
					await refused(
						tx,
						(sp) => sp`
							insert into finance.budget_credit (unit_id, nd, competencia, saldo_siafi, available_credit_siafi)
							values (${unitId}, '33903030', '2026-09-01', 10, 20)`
					)
				).toMatch(/divergem/)
				// Update que não toca as colunas não as mexe.
				await tx`update finance.budget_credit set empenhado_siafi = 1 where unit_id = ${unitId} and nd = '33903099'`
				expect(await read("33903099")).toEqual({ dotacao: 4100, saldo_siafi: 3500, received_credit: 4100, available_credit_siafi: 3500 })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("NE: ug_emitente (main) e issuer_ug (código novo) espelhados, e o import do SIAFI grava issuer_ug", async (ctx) => {
		skipIfContracted(ctx)
		await expect(
			inRollback(sql, async (tx) => {
				const unitId = await seedUnit(tx, "ZZTEST-L4-NE")
				const ug = async (numero: string) => {
					const [row] = await tx`select ug_emitente, issuer_ug from finance.empenho where unit_id = ${unitId} and numero_empenho = ${numero}`
					return row
				}

				// Registro da `main` (`insertPreparedEmpenho`) com a coluna antiga.
				await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total, ug_emitente)
					values (${unitId}, '2026NE004001', '2026-09-05', 100, '120070')`
				expect(await ug("2026NE004001")).toEqual({ ug_emitente: "120070", issuer_ug: "120070" })

				// Código novo.
				await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total, issuer_ug)
					values (${unitId}, '2026NE004002', '2026-09-05', 100, '120001')`
				expect(await ug("2026NE004002")).toEqual({ ug_emitente: "120001", issuer_ug: "120001" })

				// Classificação pela `main` (`updateEmpenhoClassificationFn`), inclusive limpando.
				await tx`update finance.empenho set ug_emitente = '120002' where unit_id = ${unitId} and numero_empenho = '2026NE004002'`
				expect(await ug("2026NE004002")).toEqual({ ug_emitente: "120002", issuer_ug: "120002" })
				await tx`update finance.empenho set ug_emitente = null where unit_id = ${unitId} and numero_empenho = '2026NE004002'`
				expect(await ug("2026NE004002")).toEqual({ ug_emitente: null, issuer_ug: null })
				await tx`update finance.empenho set issuer_ug = '120003' where unit_id = ${unitId} and numero_empenho = '2026NE004002'`
				expect(await ug("2026NE004002")).toEqual({ ug_emitente: "120003", issuer_ug: "120003" })

				expect(
					await refused(
						tx,
						(sp) => sp`
							insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total, ug_emitente, issuer_ug)
							values (${unitId}, '2026NE004003', '2026-09-05', 100, '120070', '120001')`
					)
				).toMatch(/divergem/)
				expect(
					await refused(
						tx,
						(sp) => sp`update finance.empenho set ug_emitente = '1', issuer_ug = '2' where unit_id = ${unitId} and numero_empenho = '2026NE004001'`
					)
				).toMatch(/divergem/)

				// Import do SIAFI: NE nova e NE já registrada sem UG (completa só o que falta).
				const [created] = await tx`
					select siafi_integration.apply_document_row(
						${unitId}, 'ne', gen_random_uuid(), null,
						${tx.json({ numero_ne: "2026NE004010", valor: "50.00", data: "2026-09-06", ug: "120099" })}, null, null
					) as outcome`
				expect(created.outcome).toBe("created")
				expect(await ug("2026NE004010")).toEqual({ ug_emitente: "120099", issuer_ug: "120099" })

				await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total)
					values (${unitId}, '2026NE004011', '2026-09-05', 70)`
				const [enriched] = await tx`
					select siafi_integration.apply_document_row(
						${unitId}, 'ne', gen_random_uuid(), null,
						${tx.json({ numero_ne: "2026NE004011", valor: "70.00", ug: "120098" })}, null, null
					) as outcome`
				expect(enriched.outcome).toBe("enriched")
				expect(await ug("2026NE004011")).toEqual({ ug_emitente: "120098", issuer_ug: "120098" })

				// UG já gravada não é sobrescrita pelo import.
				await tx`
					select siafi_integration.apply_document_row(
						${unitId}, 'ne', gen_random_uuid(), null,
						${tx.json({ numero_ne: "2026NE004001", valor: "100.00", ug: "999999" })}, null, null
					)`
				expect(await ug("2026NE004001")).toEqual({ ug_emitente: "120070", issuer_ug: "120070" })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
