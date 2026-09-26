/**
 * @module restos-a-pagar.fn
 * Inscrição em restos a pagar em DUAS parcelas por empenho (achado F6 da auditoria de
 * 2026-09-26): liquidado e não pago → RP processado; empenhado e não liquidado → RP não
 * processado (Lei 4.320, art. 36; Decreto 93.872/1986, arts. 67-68). A conta é pura
 * (`splitRestosAPagar`/`planRestosAPagarInscription` em `@iefa/sisub-domain`); aqui só se lê e
 * se grava.
 *
 * Expand: `finance.empenho.rp_inscrito/rp_tipo/rp_exercicio` continuam sendo espelhados (o
 * `rp_tipo` com a escolha antiga, `legacyRestosAPagarKind`) e o evento `rp_inscricao` continua
 * sendo gravado, um por parcela. `inscribeRestosAPagarFn` (empenho.fn.ts) é o caminho antigo,
 * de um tipo só; a tela nova usa este.
 * CLIENT: getServerClient (leitura) e getDb (Drizzle) para a gravação, numa transação.
 * AUTH: `unit` escopado — 1 leitura, 3 inscrever (encerramento do exercício, como o antigo).
 * TABLES: finance.empenho, finance.v_empenho_saldo, finance.empenho_rp_inscription, finance.empenho_event.
 * @domain core
 * @migration 20260926216000_finance_compliance
 */

import { legacyRestosAPagarKind, planRestosAPagarInscription, type RestosAPagarKind, splitRestosAPagar } from "@iefa/sisub-domain"
import { describeDriverError } from "@iefa/sisub-domain/utils"
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { withSensitiveAudit } from "@/lib/audit.server"
import { getDb } from "@/lib/db.server"
import { getServerClient } from "@/lib/supabase.server"
import { requireUnitScope } from "@/lib/unit-auth.server"

// biome-ignore lint/suspicious/noExplicitAny: tabelas novas fora dos tipos gerados até o regen
type LooseClient = { from: (table: string) => any }

const finance = () => getServerClient("finance") as unknown as LooseClient

// TODO: regenerar tipos após aplicar 20260926216000 e trocar este tipo local pelo gerado.
export interface RpInscriptionRow {
	empenho_id: string
	fiscal_year: number
	kind: RestosAPagarKind
	amount: number
	inscribed_on: string
}

export interface RestosAPagarPreviewRow {
	empenhoId: string
	numeroEmpenho: string
	favorecido: string | null
	valorVigente: number
	valorLiquidado: number
	valorPago: number
	/** Liquidado e não pago (inclui retenção ainda não recolhida). */
	processado: number
	/** Empenhado e não liquidado. */
	naoProcessado: number
	/** Parcelas já gravadas para este exercício. */
	inscribed: RpInscriptionRow[]
}

/** O que o encerramento do exercício inscreveria, empenho a empenho, e o que já foi inscrito. */
export const previewRestosAPagarFn = createServerFn({ method: "GET" })
	.validator(z.object({ unitId: z.number().int().positive(), exercicio: z.number().int().min(2000).max(2100) }))
	.handler(async ({ data }): Promise<RestosAPagarPreviewRow[]> => {
		await requireUnitScope(1, data.unitId)
		const fin = finance()

		const { data: empenhos, error } = await fin
			.from("empenho")
			.select("id, numero_empenho, favorecido_nome, favorecido_cnpj")
			.eq("unit_id", data.unitId)
			.eq("exercicio", data.exercicio)
			.eq("status", "ativo")
			.order("numero_empenho")
			.limit(1000)
		if (error) throw new Error(`Erro ao listar empenhos do exercício: ${error.message}`)
		const rows = (empenhos ?? []) as Array<{ id: string; numero_empenho: string; favorecido_nome: string | null; favorecido_cnpj: string | null }>
		if (rows.length === 0) return []

		const [{ data: saldos, error: saldoError }, { data: inscriptions, error: inscriptionError }] = await Promise.all([
			fin.from("v_empenho_saldo").select("empenho_id, valor_vigente, valor_liquidado, valor_pago").eq("unit_id", data.unitId).limit(5000),
			fin
				.from("empenho_rp_inscription")
				.select("empenho_id, fiscal_year, kind, amount, inscribed_on")
				.eq("fiscal_year", data.exercicio)
				.in(
					"empenho_id",
					rows.map((row) => row.id)
				),
		])
		if (saldoError) throw new Error(`Erro ao ler os saldos: ${saldoError.message}`)
		if (inscriptionError) throw new Error(`Erro ao ler as inscrições em RP: ${inscriptionError.message}`)

		const saldoById = new Map<string, { valor_vigente: number; valor_liquidado: number; valor_pago: number }>()
		for (const saldo of saldos ?? []) saldoById.set(saldo.empenho_id, saldo)
		const inscribedById = new Map<string, RpInscriptionRow[]>()
		for (const row of (inscriptions ?? []) as RpInscriptionRow[]) {
			const list = inscribedById.get(row.empenho_id) ?? []
			list.push({ ...row, amount: Number(row.amount) })
			inscribedById.set(row.empenho_id, list)
		}

		return rows.map((row) => {
			const saldo = saldoById.get(row.id)
			const balance = {
				valorVigente: Number(saldo?.valor_vigente ?? 0),
				valorLiquidado: Number(saldo?.valor_liquidado ?? 0),
				valorPago: Number(saldo?.valor_pago ?? 0),
			}
			const split = splitRestosAPagar(balance)
			return {
				empenhoId: row.id,
				numeroEmpenho: row.numero_empenho,
				favorecido: row.favorecido_nome ?? row.favorecido_cnpj,
				...balance,
				processado: split.processado,
				naoProcessado: split.naoProcessado,
				inscribed: inscribedById.get(row.id) ?? [],
			}
		})
	})

/** Mesmo teto de espera do evento de empenho: vira erro com mensagem antes dos 60 s do ALB. */
const RP_LOCK_TIMEOUT = "10s"

/**
 * Inscreve em RP as duas parcelas de cada empenho ativo do exercício. Idempotente: parcela
 * já gravada não se repete (plano puro + `on conflict do nothing` na unicidade
 * `(empenho_id, fiscal_year, kind)`), então rodar de novo depois de uma liquidação só
 * acrescenta o que faltou. Tudo numa transação, serializada por unidade e exercício.
 */
export const inscribeRpParcelsFn = createServerFn({ method: "POST" })
	.validator(z.object({ unitId: z.number().int().positive(), exercicio: z.number().int().min(2000).max(2100) }))
	.handler(async ({ data }) => {
		const ctx = await requireUnitScope(3, data.unitId)
		const { userId } = ctx

		return withSensitiveAudit(
			"inscribeRpParcelsFn",
			ctx,
			async () => {
				try {
					return await getDb().transaction(async (tx) => {
						await tx.execute(sql`select set_config('lock_timeout', ${RP_LOCK_TIMEOUT}, true)`)
						await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`rp_inscription:${data.unitId}:${data.exercicio}`}::text, 42))`)

						const balances = await tx.execute<{ empenho_id: string; valor_vigente: string; valor_liquidado: string; valor_pago: string }>(sql`
							select s.empenho_id, s.valor_vigente::text, s.valor_liquidado::text, s.valor_pago::text
							  from finance.v_empenho_saldo s
							  join finance.empenho e on e.id = s.empenho_id
							 where e.unit_id = ${data.unitId} and e.exercicio = ${data.exercicio} and e.status = 'ativo'
						`)
						const existing = await tx.execute<{ empenho_id: string; kind: string }>(sql`
							select r.empenho_id, r.kind
							  from finance.empenho_rp_inscription r
							  join finance.empenho e on e.id = r.empenho_id
							 where e.unit_id = ${data.unitId} and r.fiscal_year = ${data.exercicio}
						`)

						const empenhos = [...balances].map((row) => ({
							empenhoId: row.empenho_id,
							valorVigente: Number(row.valor_vigente),
							valorLiquidado: Number(row.valor_liquidado),
							valorPago: Number(row.valor_pago),
						}))
						const plan = planRestosAPagarInscription(
							data.exercicio,
							empenhos,
							[...existing].map((row) => ({ empenhoId: row.empenho_id, exercicio: data.exercicio, tipo: row.kind }))
						)
						const inscribedOn = `${data.exercicio}-12-31`

						for (const parcel of plan) {
							await tx.execute(sql`
								insert into finance.empenho_rp_inscription (empenho_id, fiscal_year, kind, amount, inscribed_on, created_by)
								values (${parcel.empenhoId}::uuid, ${parcel.exercicio}, ${parcel.tipo}, ${parcel.valor}, ${inscribedOn}::date, ${userId}::uuid)
								on conflict (empenho_id, fiscal_year, kind) do nothing
							`)
							// histórico no livro do empenho (não altera o vigente: rp_inscricao tem sinal 0)
							await tx.execute(sql`
								insert into finance.empenho_event (empenho_id, tipo, valor, data, justificativa, created_by)
								values (
									${parcel.empenhoId}::uuid, 'rp_inscricao', ${parcel.valor}, ${inscribedOn}::date,
									${`Inscrição em restos a pagar ${parcel.tipo === "processado" ? "processados" : "não processados"} do exercício ${data.exercicio}`},
									${userId}::uuid
								)
							`)
						}

						// espelho legado (expand): rp_inscrito/rp_tipo/rp_exercicio de quem ganhou parcela
						const touched = new Set(plan.map((parcel) => parcel.empenhoId))
						for (const empenho of empenhos) {
							if (!touched.has(empenho.empenhoId)) continue
							const legacy = legacyRestosAPagarKind(splitRestosAPagar(empenho))
							await tx.execute(sql`
								update finance.empenho
								   set rp_inscrito = true, rp_tipo = ${legacy}, rp_exercicio = ${data.exercicio}
								 where id = ${empenho.empenhoId}::uuid
							`)
						}

						const total = (tipo: RestosAPagarKind) => plan.filter((p) => p.tipo === tipo).reduce((acc, p) => acc + p.valor, 0)
						return {
							parcelas: plan.length,
							empenhos: touched.size,
							processado: Math.round(total("processado") * 100) / 100,
							naoProcessado: Math.round(total("nao_processado") * 100) / 100,
						}
					})
				} catch (error) {
					// biome-ignore lint/suspicious/noConsole: server-side — o detalhe do driver só vai para o log
					console.error("[inscribeRpParcelsFn]", describeDriverError(error))
					throw new Error("Erro ao inscrever restos a pagar. Tente novamente.")
				}
			},
			// A execução que não inscreveu nada também deixa linha: "nada a inscrever" é resposta.
			(result) => ({ unitId: data.unitId, exercicio: data.exercicio, parcelas: result.parcelas, empenhos: result.empenhos })
		)
	})
