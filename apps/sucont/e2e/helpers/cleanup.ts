/**
 * Faxina das rodadas que o E2E gravou.
 *
 * A suíte roda contra o banco de PRODUÇÃO (mesmo projeto Supabase do sisub), então
 * rodada vazada não é ruído de teste: vira competência falsa na lista da SUCONT.
 * Daí duas regras herdadas do sisub:
 *
 *   1. Falha de limpeza é falha do teste. Silenciar aqui é deixar o lixo em prod.
 *   2. A faxina roda ANTES e DEPOIS da suíte. O `afterAll` cobre falha de asserção,
 *      mas não cobre o processo morrer de repente (job cancelado, Ctrl+C) — e foi
 *      exatamente assim que fixtures `[TEST]` foram parar em produção no sisub.
 *
 * `sucont.dgc_analysis` referencia a rodada com `on delete cascade`: apagar a
 * `analysis_run` leva as análises junto, sem ordem de FK para acertar.
 */

import { createClient } from "@supabase/supabase-js"
import { E2E_MARKER } from "./fixtures"

/** `tool` das rodadas do SAC-DGC. Restringe a faxina à ferramenta certa. */
const TOOL = "sac-dgc"

function client() {
	const url = process.env.VITE_SUCONT_SUPABASE_URL
	const secret = process.env.SUCONT_SUPABASE_SECRET_KEY
	if (!url || !secret) {
		throw new Error("Faxina E2E precisa de VITE_SUCONT_SUPABASE_URL e SUCONT_SUPABASE_SECRET_KEY")
	}
	// Service role: a escrita do app passa por PBAC, mas a faxina é manutenção e
	// precisa alcançar a linha independentemente de quem a criou.
	return createClient(url, secret, { db: { schema: "sucont" }, auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Apaga as rodadas marcadas. Sem `token`, apaga TODA rodada marcada — é o modo da
 * varredura inicial, que recolhe o que execuções anteriores deixaram para trás.
 *
 * @returns ids removidos.
 * @throws se o delete falhar — a limpeza não pode fracassar em silêncio.
 */
export async function purgeE2ERuns(token?: string): Promise<string[]> {
	let query = client().from("analysis_run").delete().eq("tool", TOOL).like("filename", `${E2E_MARKER}%`)
	// `filename` guarda os nomes das planilhas unidos; o token está dentro do primeiro.
	if (token) query = query.like("filename", `%${token}%`)

	const { data, error } = await query.select("id")
	if (error) throw new Error(`Falha ao limpar rodadas E2E do SAC-DGC: ${error.message}`)
	return (data ?? []).map((row) => row.id)
}

/** Quantas análises sobraram para as rodadas marcadas. Deve ser 0 depois da faxina. */
export async function countE2EAnalyses(token?: string): Promise<number> {
	let runs = client().from("analysis_run").select("id").eq("tool", TOOL).like("filename", `${E2E_MARKER}%`)
	if (token) runs = runs.like("filename", `%${token}%`)

	const { data, error } = await runs
	if (error) throw new Error(`Falha ao conferir rodadas E2E: ${error.message}`)
	const ids = (data ?? []).map((row) => row.id)
	if (ids.length === 0) return 0

	const { count, error: countError } = await client().from("dgc_analysis").select("*", { count: "exact", head: true }).in("run_id", ids)
	if (countError) throw new Error(`Falha ao conferir análises E2E: ${countError.message}`)
	return count ?? 0
}
