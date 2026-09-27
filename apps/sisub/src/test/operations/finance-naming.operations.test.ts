/**
 * Integração — crédito recebido, crédito disponível e UG emitente depois do contract 20260927090000
 * (lote 4 da linguagem ubíqua): o que a camada de compatibilidade do expand testava e continua
 * valendo com os nomes do glossário.
 *
 *   * `finance.budget_credit.received_credit`/`available_credit_siafi` têm o default 0 das colunas
 *     que substituíram, e o upsert pela chave de classificação (o do lote de crédito do SIAFI)
 *     atualiza as duas;
 *   * `siafi_integration.apply_document_row` grava `finance.empenho.issuer_ug` na NE nova e só
 *     completa a UG da NE já registrada, sem sobrescrever a que existe.
 *
 * Banco real, `sql.begin` + ROLLBACK final: nada persiste.
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

async function seedUnit(tx: postgres.TransactionSql, code: string): Promise<number> {
	const [unit] = await tx`insert into core.units (code, display_name) values (${code}, 'unit teste lote 4') returning id`
	return Number(unit.id)
}

describeIf("crédito recebido, crédito disponível e UG emitente (DB)", () => {
	let sql: postgres.Sql

	beforeAll(() => {
		if (!url) throw new Error("SISUB_DATABASE_URL ausente")
		sql = postgres(url, { max: 1, prepare: false })
	})

	afterAll(async () => {
		await sql?.end({ timeout: 5 })
	})

	test("crédito: default 0 sem as colunas e upsert pela chave de classificação", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const unitId = await seedUnit(tx, "ZZTEST-L4-CR")
				const read = async (nd: string) => {
					const [row] = await tx`
						select received_credit, available_credit_siafi from finance.budget_credit where unit_id = ${unitId} and nd = ${nd}`
					return { received: Number(row.received_credit), available: Number(row.available_credit_siafi) }
				}

				await tx`insert into finance.budget_credit (unit_id, nd, competencia) values (${unitId}, '33903099', '2026-09-01')`
				expect(await read("33903099")).toEqual({ received: 0, available: 0 })

				await tx`
					insert into finance.budget_credit (unit_id, nd, competencia, received_credit, empenhado_siafi, available_credit_siafi)
					values (${unitId}, '33903099', '2026-09-01', 3000, 500, 2500)
					on conflict (unit_id, ug, nd, ptres, fonte, competencia)
					do update set received_credit = excluded.received_credit, available_credit_siafi = excluded.available_credit_siafi`
				expect(await read("33903099")).toEqual({ received: 3000, available: 2500 })
			})
		).resolves.toBe("rolled-back")
	}, 60_000)

	test("import do SIAFI grava issuer_ug na NE nova e só completa a que falta", async () => {
		await expect(
			inRollback(sql, async (tx) => {
				const unitId = await seedUnit(tx, "ZZTEST-L4-NE")
				const issuerUg = async (numero: string) => {
					const [row] = await tx`select issuer_ug from finance.empenho where unit_id = ${unitId} and numero_empenho = ${numero}`
					return row.issuer_ug as string | null
				}
				const apply = async (parsed: Record<string, string>) => {
					const [row] = await tx`
						select siafi_integration.apply_document_row(${unitId}, 'ne', gen_random_uuid(), null, ${tx.json(parsed)}, null, null) as outcome`
					return row.outcome as string
				}

				expect(await apply({ numero_ne: "2026NE004010", valor: "50.00", data: "2026-09-06", ug: "120099" })).toBe("created")
				expect(await issuerUg("2026NE004010")).toBe("120099")

				await tx`insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total) values (${unitId}, '2026NE004011', '2026-09-05', 70)`
				expect(await apply({ numero_ne: "2026NE004011", valor: "70.00", ug: "120098" })).toBe("enriched")
				expect(await issuerUg("2026NE004011")).toBe("120098")

				await tx`
					insert into finance.empenho (unit_id, numero_empenho, data_empenho, valor_total, issuer_ug)
					values (${unitId}, '2026NE004001', '2026-09-05', 100, '120070')`
				await apply({ numero_ne: "2026NE004001", valor: "100.00", ug: "999999" })
				expect(await issuerUg("2026NE004001")).toBe("120070")
			})
		).resolves.toBe("rolled-back")
	}, 60_000)
})
