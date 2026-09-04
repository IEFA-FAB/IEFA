/**
 * @module sacdgc.fn
 * Persistência do SAC-DGC no schema `sucont` — mesmo projeto Supabase do sisub,
 * separado por schema (ver `#/lib/supabase.server`).
 *
 * A rodada reaproveita `sucont.analysis_run` (tool = 'sac-dgc'), que já é o
 * registro de "um upload processado" das demais ferramentas; o grão vai para
 * `sucont.dgc_analysis`, uma linha por (rodada, UG).
 *
 * As planilhas do DGC NÃO sobem para o servidor: a base é lida no navegador e só
 * o recorte da UG trafega, e só para o modelo. O que persiste é o resultado.
 *
 * Gate: leitura exige `sucont` nível 1 (requireSucontAccess); escrita, nível 2
 * (requireSucontEditor) — mesma divisão do auditor SIAFI x SILOMS.
 *
 * As contagens de alertas e apontamentos NÃO são aceitas do cliente: são colunas
 * geradas no banco a partir do próprio jsonb. Um número que discordasse do
 * conteúdo faria a UG com 9 alertas aparecer como limpa na lista.
 */

import type { AnalysisRun } from "@iefa/database/sucont"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { requireSucontAccess, requireSucontEditor } from "#/lib/auth.server"
import { getSucontServerClient } from "#/lib/supabase.server"
import { competenceToPeriod } from "#/sacdgc/summary"
import type { DgcAnalysis } from "#/sacdgc/types"

const TOOL = "sac-dgc" as const

/** Teto de rodadas listadas. A seção trabalha por competência; 50 cobre anos de histórico. */
const MAX_RUNS = 50
/** Teto de UGs numa rodada. A base tem ~69; o dobro cobre crescimento sem virar leitura sem fim. */
const MAX_ANALYSES = 200

// ── Entrada ───────────────────────────────────────────────────────────────────

const analysisSchema = z.object({
	identificacao: z.object({
		codigoUg: z.string(),
		nomeUg: z.string(),
		anoReferencia: z.string(),
		mesReferencia: z.string(),
	}),
	analisePainel1: z.string(),
	analisePainel2: z.string(),
	analisePainel3: z.string(),
	analisePainel4: z.string(),
	alertasDeCriticidade: z.array(
		z.object({
			titulo: z.string(),
			origemAnalise: z.array(z.string()),
			evidencia: z.string(),
			acaoRecomendada: z.string(),
		})
	),
	checklistAec: z.object({
		indicadores: z.object({ total: z.number().int(), comApontamento: z.number().int(), semApontamento: z.number().int() }),
		perguntas: z.array(
			z.object({
				id: z.number().int(),
				pergunta: z.string(),
				resposta: z.enum(["SIM", "NÃO"]),
				fundamentacaoTecnica: z.string().optional(),
				evidenciasEncontradas: z.array(z.string()).optional(),
				recomendacao: z.string().optional(),
			})
		),
	}),
})

// ── Rodadas ───────────────────────────────────────────────────────────────────

export const listDgcRunsFn = createServerFn({ method: "GET" }).handler(async (): Promise<AnalysisRun[]> => {
	await requireSucontAccess()
	const { data, error } = await getSucontServerClient()
		.from("analysis_run")
		.select("*")
		.eq("tool", TOOL)
		.order("created_at", { ascending: false })
		.limit(MAX_RUNS)
	if (error) throw new Error(error.message)
	return data ?? []
})

export const startDgcRunFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			competence: z.string().trim().max(200),
			filenames: z.array(z.string().max(255)).max(20),
			ugCount: z.number().int().nonnegative().max(1000),
			panelsFound: z.array(z.number().int().min(1).max(4)).max(4),
		})
	)
	.handler(async ({ data }): Promise<{ runId: string }> => {
		const ctx = await requireSucontEditor()
		const { data: row, error } = await getSucontServerClient()
			.from("analysis_run")
			.insert({
				tool: TOOL,
				period: data.competence || null,
				filename: data.filenames.join(" | ").slice(0, 255) || null,
				records_count: data.ugCount,
				summary: { panelsFound: data.panelsFound, filenames: data.filenames } as never,
				created_by: ctx.userId,
			})
			.select("id")
			.single()
		if (error) throw new Error(error.message)
		return { runId: row.id }
	})

// ── Grão: uma análise por UG ──────────────────────────────────────────────────

export const saveDgcAnalysisFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			runId: z.uuid(),
			ugCodigo: z.string().trim().min(1).max(40),
			ugNome: z.string().trim().max(200).nullish(),
			ugGrupo: z.string().trim().max(60).nullish(),
			competence: z.string().trim().max(200),
			analysis: analysisSchema,
		})
	)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const ctx = await requireSucontEditor()
		const { data: row, error } = await getSucontServerClient()
			.from("dgc_analysis")
			.upsert(
				{
					run_id: data.runId,
					ug_codigo: data.ugCodigo,
					ug_nome: data.ugNome ?? null,
					ug_grupo: data.ugGrupo ?? null,
					competence: data.competence,
					period: competenceToPeriod(data.competence),
					analysis: data.analysis as never,
					// Proveniência do que respondeu. Vem do env do servidor, nunca do
					// cliente: o cliente não sabe (nem deve saber) qual modelo rodou.
					model: process.env.SUCONT_AI_MODEL ?? null,
					created_by: ctx.userId,
				},
				{ onConflict: "run_id,ug_codigo" }
			)
			.select("id")
			.single()
		if (error) throw new Error(error.message)
		return { id: row.id }
	})

export interface StoredDgcAnalysis {
	id: string
	ugCodigo: string
	ugNome: string | null
	ugGrupo: string | null
	competence: string
	period: string | null
	alertCount: number
	findingCount: number
	model: string | null
	createdAt: string
	analysis: DgcAnalysis
}

export const loadDgcRunFn = createServerFn({ method: "GET" })
	.validator(z.object({ runId: z.uuid() }))
	.handler(async ({ data }): Promise<StoredDgcAnalysis[]> => {
		await requireSucontAccess()
		const { data: rows, error } = await getSucontServerClient()
			.from("dgc_analysis")
			.select("id, ug_codigo, ug_nome, ug_grupo, competence, period, alert_count, finding_count, model, created_at, analysis")
			.eq("run_id", data.runId)
			.order("ug_codigo", { ascending: true })
			.limit(MAX_ANALYSES)
		if (error) throw new Error(error.message)
		return (rows ?? []).map((row) => ({
			id: row.id,
			ugCodigo: row.ug_codigo,
			ugNome: row.ug_nome,
			ugGrupo: row.ug_grupo,
			competence: row.competence,
			period: row.period,
			alertCount: row.alert_count,
			findingCount: row.finding_count,
			model: row.model,
			createdAt: row.created_at,
			analysis: row.analysis as unknown as DgcAnalysis,
		}))
	})
