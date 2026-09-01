/**
 * @module auditor.fn
 * Persistência do auditor SIAFI x SILOMS (schema `sucont`).
 *
 * A ferramenta era 100% memória do navegador: a planilha entrava, os números
 * apareciam e sumiam no F5. Não havia confronto entre competências sem o operador
 * subir de novo a série inteira, nem registro de qual arquivo produziu qual número,
 * nem trilha de qual MSG foi para qual UG.
 *
 * Aqui a rodada vira `analysis_run`, o grão vira `siloms_siafi_balance`
 * (chave natural: competência + UG + grupo de contas) e a mensagem institucional
 * vira `generated_message`, numerada pela sequência real do banco.
 *
 * Leitura exige `sucont` nível 1; escrita, nível 2 (requireSucontEditor).
 */

import type { AnalysisRun, GeneratedMessage } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { applyMessageNumber, balanceGrainKey, dedupeBalanceGrain } from "#/auditor/services/dataProcessor"
import { AccountGroup, type StoredBalanceRow } from "#/auditor/types"
import { requireSucontAccess, requireSucontEditor } from "#/lib/auth.server"
import { getSucontServerClient } from "#/lib/supabase.server"

/** Lotes de escrita/leitura. PostgREST devolve no máximo 1000 linhas por request. */
const PAGE_SIZE = 1000
/** Teto de linhas por chamada de gravação — o cliente fatia a série antes de enviar. */
const MAX_ROWS_PER_CALL = 2000
/** Teto de linhas lidas de uma vez (32 competências x 84 UGs x 3 grupos ≈ 8 mil). */
const MAX_ROWS_READ = 60_000
/** Quantos conflitos detalhamos de volta; acima disso o operador vê só a contagem. */
const MAX_REPORTED_CONFLICTS = 200

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competência deve ser YYYY-MM")

const balanceRowSchema = z.object({
	period: periodSchema,
	ugCodigo: z.string().min(1).max(20),
	ugNome: z.string().max(120).nullish(),
	accountGroup: z.enum(AccountGroup),
	siafiValue: z.number(),
	silomsValue: z.number(),
})

export type BalanceRowInput = z.infer<typeof balanceRowSchema>

/** `2024-01` → `2024-01-01` (a coluna é `date` e exige o primeiro dia do mês). */
const toPeriodDate = (period: string) => `${period}-01`
/** `2024-01-01` → `2024-01` (o dashboard só trabalha com competência). */
const toPeriodMonth = (date: string) => date.slice(0, 7)

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100

const grainKey = balanceGrainKey

// ── Rodadas de análise ────────────────────────────────────────────────────────

export const listAuditorRunsFn = createServerFn({ method: "GET" }).handler(async (): Promise<AnalysisRun[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient()
		.from("analysis_run")
		.select("*")
		.eq("tool", "auditor")
		.order("created_at", { ascending: false })
		.limit(50)
	if (error) throw new Error(error.message)
	return data ?? []
})

export const startAuditorRunFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			filename: z.string().min(1).max(255),
			recordsCount: z.number().int().nonnegative(),
			periodLabel: z.string().max(120).nullish(),
			summary: z.record(z.string(), z.unknown()).nullish(),
		})
	)
	.handler(async ({ data }): Promise<{ runId: string }> => {
		const ctx = await requireSucontEditor()
		const { data: row, error } = await getSucontServerClient()
			.from("analysis_run")
			.insert({
				tool: "auditor",
				filename: data.filename,
				records_count: data.recordsCount,
				period: data.periodLabel ?? null,
				summary: (data.summary ?? null) as never,
				created_by: ctx.userId,
			})
			.select("id")
			.single()
		if (error) throw new Error(error.message)
		return { runId: row.id }
	})

// ── Grão: saldos por (competência, UG, grupo) ─────────────────────────────────

export interface BalanceConflict {
	period: string
	ugCodigo: string
	accountGroup: string
	previous: { siafiValue: number; silomsValue: number }
	next: { siafiValue: number; silomsValue: number }
}

export interface SaveBalancesResult {
	inserted: number
	unchanged: number
	changed: number
	conflicts: BalanceConflict[]
	conflictsTruncated: boolean
	/** Grãos repetidos dentro do próprio arquivo, colapsados antes de gravar. */
	duplicateGrains: number
}

/**
 * Grava um lote de saldos. Idempotente pela chave natural
 * (period, ug_codigo, account_group): reenviar o mesmo mês não duplica linha.
 *
 * Antes de gravar, compara com o que já está no banco e devolve os conflitos —
 * competências que mudaram de valor. É assim que um arquivo em que um período
 * repete outro com números diferentes aparece, em vez de sobrescrever calado.
 *
 * `difference` NÃO é enviada: é coluna gerada no banco. A coluna DIF do relatório
 * de origem vem com sinal invertido linha a linha e com zeros sobre saldos que
 * divergem — nunca é fonte.
 */
export const saveAuditorBalancesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			runId: z.uuid().nullish(),
			rows: z.array(balanceRowSchema).min(1).max(MAX_ROWS_PER_CALL),
		})
	)
	.handler(async ({ data }): Promise<SaveBalancesResult> => {
		const ctx = await requireSucontEditor()
		const client = getSucontServerClient()

		// Deduplica pelo grão ANTES de qualquer coisa — senão o Postgres aborta o lote
		// inteiro com 21000. A regra vive em dataProcessor porque é pura e tem teste.
		const { rows, duplicates: duplicateGrains } = dedupeBalanceGrain(
			data.rows.map((r) => ({ ...r, siafiValue: round2(r.siafiValue), silomsValue: round2(r.silomsValue) }))
		)

		// Estado atual das competências tocadas por este lote. O filtro por período +
		// UG é um superset barato da chave composta (que o PostgREST não filtra
		// diretamente); o casamento exato acontece em memória, logo abaixo.
		const periods = [...new Set(rows.map((r) => toPeriodDate(r.period)))]
		const ugs = [...new Set(rows.map((r) => r.ugCodigo))]

		// Paginado: o PostgREST corta em 1000 linhas por request. Um lote de 2000
		// grãos consulta um superset SEMPRE maior que isso assim que a série existe —
		// sem paginar, metade do arquivo voltaria classificada como "saldo novo" e as
		// alterações de valor fora da primeira página seriam sobrescritas sem nunca
		// aparecer em `conflicts`, que é justamente o que esta função existe para achar.
		const existing = new Map<string, { siafiValue: number; silomsValue: number }>()
		for (let offset = 0; ; offset += PAGE_SIZE) {
			const { data: page, error: readError } = await client
				.from("siloms_siafi_balance")
				.select("period, ug_codigo, account_group, siafi_value, siloms_value")
				.in("period", periods)
				.in("ug_codigo", ugs)
				.order("period", { ascending: true })
				.order("ug_codigo", { ascending: true })
				.order("account_group", { ascending: true })
				.range(offset, offset + PAGE_SIZE - 1)
			if (readError) throw new Error(readError.message)
			if (!page || page.length === 0) break

			for (const row of page) {
				existing.set(grainKey(toPeriodMonth(row.period), row.ug_codigo, row.account_group), {
					siafiValue: round2(Number(row.siafi_value)),
					silomsValue: round2(Number(row.siloms_value)),
				})
			}

			if (page.length < PAGE_SIZE) break
		}

		let inserted = 0
		let unchanged = 0
		const conflicts: BalanceConflict[] = []

		for (const row of rows) {
			const before = existing.get(grainKey(row.period, row.ugCodigo, row.accountGroup))
			if (!before) {
				inserted++
				continue
			}
			if (before.siafiValue === row.siafiValue && before.silomsValue === row.silomsValue) {
				unchanged++
				continue
			}
			conflicts.push({
				period: row.period,
				ugCodigo: row.ugCodigo,
				accountGroup: row.accountGroup,
				previous: before,
				next: { siafiValue: row.siafiValue, silomsValue: row.silomsValue },
			})
		}

		const payload = rows.map((r) => ({
			period: toPeriodDate(r.period),
			ug_codigo: r.ugCodigo,
			ug_nome: r.ugNome ?? null,
			account_group: r.accountGroup,
			siafi_value: r.siafiValue,
			siloms_value: r.silomsValue,
			source_run_id: data.runId ?? null,
			created_by: ctx.userId,
		}))

		for (let i = 0; i < payload.length; i += PAGE_SIZE) {
			const { error } = await client.from("siloms_siafi_balance").upsert(payload.slice(i, i + PAGE_SIZE), { onConflict: "period,ug_codigo,account_group" })
			if (error) throw new Error(error.message)
		}

		return {
			inserted,
			unchanged,
			changed: conflicts.length,
			conflicts: conflicts.slice(0, MAX_REPORTED_CONFLICTS),
			conflictsTruncated: conflicts.length > MAX_REPORTED_CONFLICTS,
			duplicateGrains,
		}
	})

/**
 * Reexporta a forma que o dashboard já consome, em vez de declarar uma paralela:
 * duas definições do mesmo registro divergiriam na primeira coluna nova.
 */
export type StoredBalance = StoredBalanceRow

/**
 * Série persistida, para o dashboard abrir já com histórico — sem upload.
 * É este endpoint que torna possível confrontar a competência corrente com as
 * anteriores sem depender de o operador ter em mãos um arquivo com a série toda.
 */
export const loadAuditorBalancesFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			fromPeriod: periodSchema.nullish(),
			toPeriod: periodSchema.nullish(),
		})
	)
	.handler(async ({ data }): Promise<StoredBalance[]> => {
		await requireSucontAccess()
		const client = getSucontServerClient()

		const out: StoredBalance[] = []
		for (let offset = 0; offset < MAX_ROWS_READ; offset += PAGE_SIZE) {
			let query = client
				.from("siloms_siafi_balance")
				.select("period, ug_codigo, ug_nome, account_group, siafi_value, siloms_value")
				.order("period", { ascending: true })
				.order("ug_codigo", { ascending: true })
				.order("account_group", { ascending: true })
				.range(offset, offset + PAGE_SIZE - 1)

			if (data.fromPeriod) query = query.gte("period", toPeriodDate(data.fromPeriod))
			if (data.toPeriod) query = query.lte("period", toPeriodDate(data.toPeriod))

			const { data: page, error } = await query
			if (error) throw new Error(error.message)
			if (!page || page.length === 0) break

			for (const row of page) {
				out.push({
					period: toPeriodMonth(row.period),
					ugCodigo: row.ug_codigo,
					ugNome: row.ug_nome,
					accountGroup: row.account_group as AccountGroup,
					siafiValue: Number(row.siafi_value),
					silomsValue: Number(row.siloms_value),
				})
			}

			if (page.length < PAGE_SIZE) break
		}

		return out
	})

// ── Mensagens institucionais ──────────────────────────────────────────────────

export const listGeneratedMessagesFn = createServerFn({ method: "GET" }).handler(async (): Promise<GeneratedMessage[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient()
		.from("generated_message")
		.select("*")
		.eq("tool", "auditor")
		.order("created_at", { ascending: false })
		.limit(100)
	if (error) throw new Error(error.message)
	return data ?? []
})

/**
 * Registra a mensagem e devolve o número definitivo.
 *
 * A numeração vem de `sucont.message_number_seq` — sequência real, compartilhada
 * entre operadores. Antes era um campo de texto que começava em "XXX": dois
 * operadores emitiam o mesmo número no mesmo dia e nada registrava o envio.
 */
export const registerAuditorMessageFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			corpo: z.string().min(1).max(50_000),
			ugCodigo: z.string().max(20).nullish(),
			tipo: z.enum(["RANKING", "HEATMAP"]).nullish(),
			analysisRunId: z.uuid().nullish(),
		})
	)
	.handler(async ({ data }): Promise<{ id: string; number: number; corpo: string }> => {
		const ctx = await requireSucontEditor()
		const client = getSucontServerClient()

		const { data: row, error } = await client
			.from("generated_message")
			.insert({
				tool: "auditor",
				ug_codigo: data.ugCodigo ?? null,
				tipo: data.tipo ?? null,
				corpo: data.corpo,
				analysis_run_id: data.analysisRunId ?? null,
				created_by: ctx.userId,
			})
			.select("id, number")
			.single()
		if (error) throw new Error(error.message)

		const corpo = applyMessageNumber(data.corpo, row.number)
		if (corpo !== data.corpo) {
			const { error: patchError } = await client.from("generated_message").update({ corpo }).eq("id", row.id)
			if (patchError) throw new Error(patchError.message)
		}

		return { id: row.id, number: row.number, corpo }
	})

/**
 * Fecha a rodada com o que de fato foi gravado.
 *
 * `startAuditorRunFn` registra a INTENÇÃO (o arquivo tem N linhas). Se a gravação
 * parar no meio — timeout, queda —, a linha da rodada continuaria afirmando N e o
 * histórico registraria uma importação completa que nunca houve. Aqui o número vira
 * o que aterrissou, e `summary.status` diz se a série está inteira.
 */
export const finalizeAuditorRunFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			runId: z.uuid(),
			rowsWritten: z.number().int().nonnegative(),
			status: z.enum(["complete", "partial", "failed"]),
			error: z.string().max(2000).nullish(),
		})
	)
	.handler(async ({ data }): Promise<{ ok: true }> => {
		await requireSucontEditor()
		const client = getSucontServerClient()

		const { data: run, error: readError } = await client.from("analysis_run").select("summary").eq("id", data.runId).single()
		if (readError) throw new Error(readError.message)

		const summary = { ...((run?.summary as Record<string, unknown> | null) ?? {}), status: data.status, error: data.error ?? null }

		const { error } = await client
			.from("analysis_run")
			.update({ records_count: data.rowsWritten, summary: summary as never })
			.eq("id", data.runId)
		if (error) throw new Error(error.message)
		return { ok: true }
	})
