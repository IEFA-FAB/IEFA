/**
 * Bench dos candidatos a modelo do oráculo SUCONT, pelo adapter real do repo.
 *
 * Roda os TRÊS caminhos que o app usa de verdade, com os artefatos de produção
 * importados (não reescritos):
 *   1. chatStream       → oráculo, `buildSystemPrompt` de `#/lib/oracle-prompt`
 *   2. structuredOutput → document-ai, `analysisSchema` (DATA_ANALYSIS)
 *   3. structuredOutput → document-ai, `fabSchema` (FAB_OFFICE)
 *
 * O (3) existe porque `generateJson` devolve `result.data as T` sem validar: campo
 * obrigatório que o modelo não emitir vira `undefined` dentro de um ofício, sem erro.
 *
 * Só entram candidatos que a task role pode invocar (policy `-ecs-task-extra`):
 * `global.anthropic.*` (inference profile) e `openai.gpt-oss-*` (foundation model).
 *
 * Uso: cd apps/sucont && AWS_PROFILE=iefa-prod bun model-bench.ts
 */
import { createBedrockAdapter } from "@iefa/ai-provider/bedrock"
import { buildSystemPrompt } from "#/lib/oracle-prompt"
import { analysisSchema, fabSchema } from "#/server/document-schemas"

const REGION = "sa-east-1"

/** Teto por chamada. O app tem 60 s no `generateJson`; sem isto uma chamada travada perde o run inteiro. */
const DEADLINE_MS = 90_000

const CANDIDATES = [
	{ id: "openai.gpt-oss-120b-1:0", label: "gpt-oss-120b" },
	{ id: "openai.gpt-oss-20b-1:0", label: "gpt-oss-20b" },
	{ id: "global.anthropic.claude-haiku-4-5-20251001-v1:0", label: "haiku-4.5" },
	{ id: "global.anthropic.claude-sonnet-4-6", label: "sonnet-4.6" },
]

/** Contexto que a UI injeta em `forwardedProps.contextSummary` — entra no system prompt. */
const CONTEXT_SUMMARY = JSON.stringify({
	totalInconsistencias: 90,
	totalVolume: 5_507_980.55,
	odsList: ["ODS-1", "ODS-2", "ODS-4"],
	orgaoSuperiorList: ["DIREF", "FAer"],
	topUGs: [
		{ ug: "120002", occurrences: 47, saldo: 3_412_880.55 },
		{ ug: "121002", occurrences: 31, saldo: 1_205_000.0 },
		{ ug: "120701", occurrences: 12, saldo: 890_100.0 },
	],
})

const ORACLE_USER = "Qual ODS concentra o maior risco patrimonial nos dados carregados, e qual a ordem de atuação recomendada? Seja objetivo."

const JSON_ANALYSIS_USER = `Rascunho do analista: "Levantamento das inconsistências do 1º trimestre. A UG 120002 (DIREF) responde por 47 ocorrências
e R$ 3.412.880,55 em saldo alongado em conta de trânsito. A 121002 tem 31 ocorrências e R$ 1.205.000,00. A 120701 tem 12 e R$ 890.100,00.
Recomenda-se regularização por desincorporação e ajuste de exercícios anteriores, com lastro documental."
Produza o relatório de análise de dados estruturado a partir desse rascunho.`

const JSON_FAB_USER = `Rascunho do analista: "Oficiar a UG 120002 (DIREF) sobre 47 inconsistências e R$ 3.412.880,55 em saldo alongado
em conta de trânsito, solicitando regularização por desincorporação com lastro documental, prazo de 30 dias.
Assunto: fidedignidade patrimonial. Assina o Cel Int Guerra, Chefe da SUCONT-4, em Brasília."
Produza o ofício FAB estruturado a partir desse rascunho.`

// biome-ignore lint/suspicious/noExplicitAny: bench — TextOptions exige campos que os adapters tratam como opcionais
const opts = (o: Record<string, unknown>) => o as any

type Row = { label: string; task: string; ok: boolean; ttfbMs: number | null; totalMs: number; inTok: number; outTok: number; note: string }
const rows: Row[] = []

// biome-ignore lint/suspicious/noConsole: script de bench
const log = (s: string) => console.log(s)

function withDeadline<T>(p: Promise<T>, label: string): Promise<T> {
	return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`deadline ${DEADLINE_MS}ms em ${label}`)), DEADLINE_MS))])
}

function push(row: Row) {
	rows.push(row)
	// Imprime na hora: um travamento no fim não pode apagar as medições já feitas.
	log(
		`${row.label.padEnd(14)} ${row.task.padEnd(13)} ${(row.ok ? "PASS" : "FALHA").padEnd(6)} ${String(row.ttfbMs == null ? "-" : Math.round(row.ttfbMs)).padStart(6)} ${String(Math.round(row.totalMs)).padStart(7)} ${String(row.inTok).padStart(7)} ${String(row.outTok).padStart(8)}  ${row.note}`
	)
}

/**
 * Chat: mede time-to-first-token E total. O caminho é SSE para o browser, então o
 * que o usuário sente é o primeiro token — total é vazão, que ele não percebe.
 */
async function runChat(label: string, model: string) {
	const adapter = createBedrockAdapter(model, REGION)
	const started = performance.now()
	let ttfb: number | null = null
	let text = ""
	let usage = { promptTokens: 0, completionTokens: 0 }

	const drain = async () => {
		for await (const chunk of adapter.chatStream(
			opts({ messages: [{ role: "user", content: ORACLE_USER }], systemPrompts: [buildSystemPrompt(CONTEXT_SUMMARY)] })
		)) {
			const c = chunk as { type?: string; delta?: string; usage?: { promptTokens: number; completionTokens: number } }
			if (c.type === "TEXT_MESSAGE_CONTENT" && typeof c.delta === "string") {
				if (ttfb === null) ttfb = performance.now() - started
				text += c.delta
			}
			if (c.type === "RUN_FINISHED" && c.usage) usage = c.usage
		}
	}

	try {
		await withDeadline(drain(), `${label}/chat`)
		const cita = /120002/.test(text) && /R\$/.test(text)
		push({
			label,
			task: "chat",
			ok: text.length > 200 && cita,
			ttfbMs: ttfb,
			totalMs: performance.now() - started,
			inTok: usage.promptTokens,
			outTok: usage.completionTokens,
			note: text.length === 0 ? "SEM TEXTO (só reasoning?)" : cita ? `${text.length} chars` : `${text.length} chars, não citou UG/valor`,
		})
	} catch (err) {
		push({ label, task: "chat", ok: false, ttfbMs: ttfb, totalMs: performance.now() - started, inTok: 0, outTok: 0, note: String(err).slice(0, 80) })
	}
}

async function runJson(label: string, model: string, task: string, user: string, schema: { required: readonly string[] }) {
	const adapter = createBedrockAdapter(model, REGION)
	const started = performance.now()
	try {
		const r = await withDeadline(
			adapter.structuredOutput(opts({ chatOptions: { messages: [{ role: "user", content: user }], systemPrompts: [] }, outputSchema: schema })),
			`${label}/${task}`
		)
		const d = (r as { data: Record<string, unknown> }).data
		const usage = (r as { usage?: { promptTokens: number; completionTokens: number } }).usage ?? { promptTokens: 0, completionTokens: 0 }
		const faltando = schema.required.filter((k) => d?.[k] == null)
		push({
			label,
			task,
			ok: faltando.length === 0,
			ttfbMs: null,
			totalMs: performance.now() - started,
			inTok: usage.promptTokens,
			outTok: usage.completionTokens,
			note: faltando.length ? `faltou: ${faltando.join(",")}` : "schema completo",
		})
	} catch (err) {
		push({ label, task, ok: false, ttfbMs: null, totalMs: performance.now() - started, inTok: 0, outTok: 0, note: String(err).slice(0, 80) })
	}
}

log("modelo         tarefa           ok     ttfb   total   in_tok  out_tok  obs")
for (const c of CANDIDATES) {
	await runChat(c.label, c.id)
	await runJson(c.label, c.id, "json:analysis", JSON_ANALYSIS_USER, analysisSchema)
	await runJson(c.label, c.id, "json:fab", JSON_FAB_USER, fabSchema)
}

const falhas = rows.filter((r) => !r.ok)
log(`\n${rows.length - falhas.length}/${rows.length} PASS`)
if (falhas.length) log(`falhas: ${falhas.map((f) => `${f.label}/${f.task}`).join(", ")}`)
