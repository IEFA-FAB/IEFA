/**
 * Bench dos candidatos a modelo do oráculo SUCONT, pelo adapter real do repo.
 *
 * Roda os DOIS caminhos que o app usa de verdade:
 *   1. chatStream        → oráculo (system prompt grande com UG_INFO, análise em pt-BR)
 *   2. structuredOutput  → document-ai (JSON conforme schema, sem json-mode nativo)
 *
 * Só entram candidatos que a task role pode invocar (policy `-ecs-task-extra`):
 * `global.anthropic.*` e `openai.gpt-oss-*`.
 *
 * Uso: cd apps/sucont && AWS_PROFILE=iefa-prod bun model-bench.ts
 */
import { createBedrockAdapter } from "@iefa/ai-provider/bedrock"
import { UG_INFO } from "#/subitens/constants"

const REGION = "sa-east-1"

const CANDIDATES = [
	{ id: "openai.gpt-oss-120b-1:0", label: "gpt-oss-120b" },
	{ id: "openai.gpt-oss-20b-1:0", label: "gpt-oss-20b" },
	{ id: "global.anthropic.claude-haiku-4-5-20251001-v1:0", label: "haiku-4.5" },
	{ id: "global.anthropic.claude-sonnet-4-6", label: "sonnet-4.6" },
]

const ORACLE_SYSTEM = `Você é o Oráculo SUCONT, assistente técnico de Contabilidade Pública Federal do COMAER.
SETORIAL CONTÁBIL (SEFA): 120002, 120701, 120702, 121002. ÓRGÃO CENTRAL (STN): 120999.
BASE DE UNIDADES GESTORAS:
${JSON.stringify(UG_INFO, null, 2)}
Ao citar uma UG use: "UG [Código] ([Nome Reduzido]), subordinada ao [Órgão Superior] / [ODS]".
Aplique Pareto 80/20, priorize por volume financeiro e impacto patrimonial, cite a Macrofunção 02.03.18
ou o Módulo 7 do RADA-e quando fundamentar inconsistência. Rigor técnico do PCASP. Responda em português.`

const ORACLE_USER = `Dados: UG 120002 com 47 inconsistências e saldo alongado de R$ 3.412.880,55; UG 120701 com 12 e R$ 890.100,00;
UG 121002 com 31 e R$ 1.205.000,00. Qual ODS concentra o maior risco patrimonial e qual a ordem de atuação? Seja objetivo.`

const analysisSchema = {
	type: "object",
	properties: {
		title: { type: "string" },
		subtitle: { type: "string" },
		author: { type: "string" },
		date: { type: "string" },
		summary: { type: "string" },
		keyMetrics: {
			type: "array",
			items: {
				type: "object",
				properties: { label: { type: "string" }, value: { type: "string" }, trend: { type: "string", enum: ["up", "down", "neutral"] } },
				required: ["label", "value", "trend"],
			},
		},
		tableData: {
			type: "object",
			properties: { headers: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } } },
			required: ["headers", "rows"],
		},
		analysis: { type: "array", items: { type: "string" } },
		conclusion: { type: "string" },
		recommendations: { type: "array", items: { type: "string" } },
	},
	required: ["title", "subtitle", "author", "date", "summary", "keyMetrics", "tableData", "analysis", "conclusion", "recommendations"],
}

const JSON_USER = `Rascunho do analista: "Levantamento das inconsistências do 1º trimestre. A UG 120002 (DIREF) responde por 47 ocorrências
e R$ 3.412.880,55 em saldo alongado em conta de trânsito. A 121002 tem 31 ocorrências e R$ 1.205.000,00. A 120701 tem 12 e R$ 890.100,00.
Recomenda-se regularização por desincorporação e ajuste de exercícios anteriores, com lastro documental."
Produza o relatório de análise de dados estruturado a partir desse rascunho.`

// biome-ignore lint/suspicious/noExplicitAny: bench script — TextOptions exige campos que os adapters tratam como opcionais
const opts = (o: Record<string, unknown>) => o as any

type Row = { label: string; task: string; ok: boolean; ms: number; inTok: number; outTok: number; note: string }
const rows: Row[] = []

async function runChat(label: string, model: string) {
	const adapter = createBedrockAdapter(model, REGION)
	const started = performance.now()
	let text = ""
	let usage = { promptTokens: 0, completionTokens: 0 }
	try {
		for await (const chunk of adapter.chatStream(opts({ messages: [{ role: "user", content: ORACLE_USER }], systemPrompts: [ORACLE_SYSTEM] }))) {
			const c = chunk as { type?: string; delta?: string; usage?: { promptTokens: number; completionTokens: number } }
			if (c.type === "TEXT_MESSAGE_CONTENT" && typeof c.delta === "string") text += c.delta
			if (c.type === "RUN_FINISHED" && c.usage) usage = c.usage
		}
		const ms = performance.now() - started
		// Qualidade mínima: respondeu em português, citou UG e valor, e não devolveu vazio.
		const cita = /120002/.test(text) && /R\$/.test(text)
		rows.push({
			label,
			task: "chat",
			ok: text.length > 200 && cita,
			ms,
			inTok: usage.promptTokens,
			outTok: usage.completionTokens,
			note: text.length === 0 ? "SEM TEXTO (só reasoning?)" : cita ? `${text.length} chars` : `${text.length} chars, não citou UG/valor`,
		})
	} catch (err) {
		rows.push({ label, task: "chat", ok: false, ms: performance.now() - started, inTok: 0, outTok: 0, note: String(err).slice(0, 90) })
	}
}

async function runJson(label: string, model: string) {
	const adapter = createBedrockAdapter(model, REGION)
	const started = performance.now()
	try {
		const r = await adapter.structuredOutput(
			opts({ chatOptions: { messages: [{ role: "user", content: JSON_USER }], systemPrompts: [] }, outputSchema: analysisSchema })
		)
		const ms = performance.now() - started
		const d = (r as { data: Record<string, unknown>; usage?: { promptTokens: number; completionTokens: number } }).data
		const usage = (r as { usage?: { promptTokens: number; completionTokens: number } }).usage ?? { promptTokens: 0, completionTokens: 0 }
		const faltando = analysisSchema.required.filter((k) => d?.[k] == null)
		rows.push({
			label,
			task: "json",
			ok: faltando.length === 0,
			ms,
			inTok: usage.promptTokens,
			outTok: usage.completionTokens,
			note: faltando.length ? `faltou: ${faltando.join(",")}` : "schema completo",
		})
	} catch (err) {
		rows.push({ label, task: "json", ok: false, ms: performance.now() - started, inTok: 0, outTok: 0, note: String(err).slice(0, 90) })
	}
}

for (const c of CANDIDATES) {
	await runChat(c.label, c.id)
	await runJson(c.label, c.id)
}

// biome-ignore lint/suspicious/noConsole: script de bench
console.log("\nmodelo         tarefa  ok     ms      in_tok  out_tok  obs")
for (const r of rows) {
	// biome-ignore lint/suspicious/noConsole: script de bench
	console.log(
		`${r.label.padEnd(14)} ${r.task.padEnd(6)} ${(r.ok ? "PASS" : "FALHA").padEnd(6)} ${String(Math.round(r.ms)).padStart(6)} ${String(r.inTok).padStart(7)} ${String(r.outTok).padStart(8)}  ${r.note}`
	)
}
