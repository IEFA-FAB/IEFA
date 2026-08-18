/**
 * Faxineiro das rodadas de teste do SAC-DGC.
 *
 * O E2E (`e2e/tests/sac-dgc-ia.spec.ts`) escreve no banco REAL e limpa o que criou
 * num `afterAll`. Isso cobre falha de asserção, mas NÃO cobre morte abrupta do
 * processo: job de CI cancelado, OOM, Ctrl+C — nenhum hook roda e as linhas ficam em
 * produção, virando competência falsa na lista da SUCONT. Esta é a rede.
 *
 * Como decide o que é lixo (nesta ordem, e é o ponto delicado — roda contra PRODUÇÃO):
 *   1. LIXO: `analysis_run` com `tool = 'sac-dgc'` cujo `filename` tem o marcador
 *      `[TEST]` E o token de execução (`<base36><hex8>-<seq>`). O token não é
 *      digitável por acidente, então casar com ele é prova de que a linha saiu do E2E.
 *   2. SUSPEITA: tem o marcador, não tem o token — alguém pode ter chamado um
 *      arquivo de "[TEST]" à mão. É só RELATADA. `--force` inclui as suspeitas, para
 *      uso manual, nunca no CI.
 *
 * As análises (`sucont.dgc_analysis`) somem por `on delete cascade` da rodada.
 *
 * Uso:
 *   bun run scripts/purge-test-fixtures.ts                    # dry-run: só relata
 *   bun run scripts/purge-test-fixtures.ts --apply
 *   bun run scripts/purge-test-fixtures.ts --apply --force --min-age-minutes 30
 *
 * Requer VITE_SUCONT_SUPABASE_URL e SUCONT_SUPABASE_SECRET_KEY.
 */

import { createClient } from "@supabase/supabase-js"

const MARKER = "[TEST]"
const TOOL = "sac-dgc"

/** Token do `uid()` do E2E: base36 do relógio + 8 hex do randomUUID + `-<seq>`. */
const RUN_TOKEN = /[0-9a-z]{6,10}[0-9a-f]{8}-\d+/

const args = new Set(process.argv.slice(2))
const apply = args.has("--apply")
const force = args.has("--force")

function numericFlag(name: string, fallback: number): number {
	const raw = process.argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1] ?? process.argv[process.argv.indexOf(name) + 1]
	const value = Number(raw)
	return Number.isFinite(value) && value >= 0 ? value : fallback
}

/** Freio: rodada recente pode ser de uma suíte executando NESTE instante. */
const minAgeMinutes = numericFlag("--min-age-minutes", 0)
/** Freio: casar com muita coisa é sinal de que o critério pegou dado real. */
const maxRows = numericFlag("--max-rows", 200)

const url = process.env.VITE_SUCONT_SUPABASE_URL
const secret = process.env.SUCONT_SUPABASE_SECRET_KEY
if (!url || !secret) {
	console.error("Faltam VITE_SUCONT_SUPABASE_URL e/ou SUCONT_SUPABASE_SECRET_KEY.")
	process.exit(1)
}

const db = createClient(url, secret, { db: { schema: "sucont" }, auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await db
	.from("analysis_run")
	.select("id, filename, period, created_at")
	.eq("tool", TOOL)
	.like("filename", `${MARKER}%`)
	.order("created_at", { ascending: true })

if (error) {
	console.error(`Falha ao consultar rodadas: ${error.message}`)
	process.exit(1)
}

// Sem `--min-age-minutes` NÃO existe filtro de idade. Comparar com `Date.now()` como
// se o teto fosse zero descartaria a rodada recém-criada: o `created_at` vem do relógio
// do banco e chega alguns milissegundos "no futuro" em relação ao daqui.
const cutoff = minAgeMinutes > 0 ? Date.now() - minAgeMinutes * 60_000 : Number.POSITIVE_INFINITY
const marked = (data ?? []).filter((run) => new Date(run.created_at).getTime() <= cutoff)
const skippedByAge = (data ?? []).length - marked.length

const lixo = marked.filter((run) => RUN_TOKEN.test(run.filename ?? ""))
const suspeitas = marked.filter((run) => !RUN_TOKEN.test(run.filename ?? ""))
const alvo = force ? [...lixo, ...suspeitas] : lixo

console.log(`rodadas marcadas: ${marked.length} (com token: ${lixo.length}, suspeitas: ${suspeitas.length}, ignoradas por idade: ${skippedByAge})`)
for (const run of suspeitas) {
	console.log(`  SUSPEITA (sem token, só sai com --force): ${run.id} · ${run.period ?? "sem competência"} · ${run.filename}`)
}

if (alvo.length === 0) {
	console.log("nada a apagar.")
	process.exit(0)
}

if (alvo.length > maxRows) {
	console.error(`ABORTADO: ${alvo.length} rodadas casaram, acima do teto de ${maxRows}. Confira o critério antes de insistir.`)
	process.exit(1)
}

for (const run of alvo) {
	console.log(`  ${apply ? "APAGA" : "apagaria"}: ${run.id} · ${run.period ?? "sem competência"} · ${run.created_at}`)
}

if (!apply) {
	console.log("dry-run — nada foi apagado. Use --apply.")
	process.exit(0)
}

const { data: removed, error: deleteError } = await db
	.from("analysis_run")
	.delete()
	.in(
		"id",
		alvo.map((run) => run.id)
	)
	.select("id")

if (deleteError) {
	console.error(`Falha ao apagar: ${deleteError.message}`)
	process.exit(1)
}

console.log(`removidas ${removed?.length ?? 0} rodada(s); as análises saíram por cascade.`)
