/**
 * Smoke do provider de IA — a pergunta é só uma: **a IA responde?**
 *
 * Fala com o provider configurado de verdade (`MODULE_CHAT_AI_*`), com o system prompt e os
 * schemas de tool que o chat usa em produção. Os handlers são falsos: o que está sob teste é
 * o caminho modelo → tool → modelo, não o banco.
 *
 * Fica em skip por padrão, como a suíte de integração — custa tokens e depende de rede.
 * Rodar com:
 *
 *   SISUB_RUN_AI_SMOKE=true bun run test:ai
 *
 * O que ele pega e nenhum teste offline pega: id de modelo inválido, região sem acesso
 * liberado, credencial da task role faltando, provider que recusa a chamada de tool
 * (`tool_use_failed`), modelo que ignora o schema.
 *
 * O que ele NÃO garante: regressão de contrato. O que o modelo manda varia de run para run —
 * verificado: com o bug do `null` reintroduzido, este smoke passou porque naquela execução o
 * modelo não mandou `null`. A garantia determinística é o teste offline
 * `src/lib/module-chat/tools/model-args.test.ts`, que varre todas as tools com o payload que
 * o modelo manda de verdade. Este arquivo responde "o provider está de pé e a IA responde?".
 */

import { createAdapterFromEnv, maxIterationsMiddleware } from "@iefa/ai-provider"
import { chat } from "@tanstack/ai"
import { describe, expect, test } from "vitest"
import { GLOBAL_SYSTEM_PROMPT } from "@/lib/module-chat/prompts/global"
import { globalTools } from "@/lib/module-chat/tools/global"
import { type ModuleToolDefinition, type ToolContext, toolOk, wrapTool } from "@/lib/module-chat/tools/shared"

const enabled = process.env.SISUB_RUN_AI_SMOKE === "true"
const describeAiSmoke = enabled ? describe : describe.skip

/** Resposta canônica das tools no smoke — pequena, previsível e com o envelope de contagem. */
const FAKE_RESULTS: Record<string, unknown> = {
	list_recipes: {
		recipes: [
			{ id: "11111111-1111-4111-8111-111111111111", name: "Arroz branco" },
			{ id: "22222222-2222-4222-8222-222222222222", name: "Feijão preto" },
		],
		returned: 2,
		total: 2083,
		limit: 30,
	},
	list_ingredients: { ingredients: [{ id: "33333333-3333-4333-8333-333333333333", description: "ARROZ TIPO 1" }], returned: 1, total: 1204, limit: 30 },
	list_preparations: { preparations: [], returned: 0, total: 0, limit: 30 },
	list_menu_templates: { templates: [], returned: 0, total: 0, limit: 30 },
}

interface ToolCallRecord {
	name: string
	/** Argumentos EXATAMENTE como o modelo mandou — antes da normalização do wrapTool. */
	args: Record<string, unknown>
}

function stubContext(): ToolContext {
	return {
		userId: "smoke-user",
		module: "global",
		permissions: [{ module: "global", level: 3, mess_hall_id: null, kitchen_id: null, unit_id: null }],
		supabase: {} as ToolContext["supabase"],
		db: {} as ToolContext["db"],
	}
}

/** Tools reais (nome, descrição e schema) com handler falso — sem banco, sem permissão. */
function smokeTools() {
	const ctx = stubContext()
	return globalTools
		.filter((def) => def.requiredLevel === 1)
		.map((def) => {
			const stub: ModuleToolDefinition = { ...def, handler: async () => toolOk(FAKE_RESULTS[def.name] ?? { ok: true }) }
			return wrapTool(stub, ctx)
		})
}

interface RunOutcome {
	text: string
	errors: string[]
	finished: boolean
	calls: ToolCallRecord[]
}

async function run(prompt: string, options: { withTools: boolean }): Promise<RunOutcome> {
	const outcome: RunOutcome = { text: "", errors: [], finished: false, calls: [] }

	const stream = chat({
		adapter: createAdapterFromEnv("MODULE_CHAT", { rateLimitKey: "smoke" }),
		messages: [{ id: "smoke-1", role: "user", content: prompt }] as never,
		tools: options.withTools ? smokeTools() : [],
		systemPrompts: [GLOBAL_SYSTEM_PROMPT],
		middleware: [maxIterationsMiddleware(4)],
	})

	for await (const event of stream) {
		const e = event as { type?: string; delta?: string; message?: string; toolCallName?: string; input?: unknown }
		if (e.type === "TEXT_MESSAGE_CONTENT" && typeof e.delta === "string") outcome.text += e.delta
		if (e.type === "RUN_ERROR") outcome.errors.push(e.message ?? "erro sem mensagem")
		if (e.type === "RUN_FINISHED") outcome.finished = true
		// TOOL_CALL_END traz o input como o provider entregou — antes de qualquer
		// normalização nossa. É esse payload que precisa passar no schema.
		if (e.type === "TOOL_CALL_END" && e.toolCallName) {
			outcome.calls.push({ name: e.toolCallName, args: (e.input ?? {}) as Record<string, unknown> })
		}
	}

	return outcome
}

describeAiSmoke("smoke do provider de IA", () => {
	test("responde uma pergunta simples, sem tool", async () => {
		const outcome = await run("Responda apenas com a palavra: pronto.", { withTools: false })

		expect(outcome.errors).toEqual([])
		expect(outcome.finished).toBe(true)
		expect(outcome.text.trim().length).toBeGreaterThan(0)
	}, 60_000)

	test("chama uma tool do catálogo e responde em cima do resultado", async () => {
		// A pergunta é deliberadamente do tipo que exige a tool: o modelo não tem como
		// saber o total do catálogo sem chamar list_recipes.
		const outcome = await run("Quantas receitas existem no catálogo global? Liste as duas primeiras pelo nome.", { withTools: true })

		expect(outcome.errors).toEqual([])
		expect(outcome.finished).toBe(true)
		expect(outcome.calls.map((c) => c.name)).toContain("list_recipes")
		expect(outcome.text.trim().length).toBeGreaterThan(0)
	}, 120_000)

	test("os argumentos que o modelo mandou passam pelo schema da própria tool", async () => {
		// Confere o contrato contra o que o modelo mandou NESTA execução. Não substitui o
		// teste offline (o modelo pode não exercitar o caso hoje e exercitar amanhã), mas é
		// o único lugar onde o payload é real em vez de simulado.
		const outcome = await run("Busque receitas com 'arroz' no nome, no máximo 3.", { withTools: true })

		expect(outcome.errors).toEqual([])
		expect(outcome.calls.length).toBeGreaterThan(0)

		for (const call of outcome.calls) {
			const def = globalTools.find((t) => t.name === call.name)
			expect(def, `tool desconhecida: ${call.name}`).toBeDefined()

			const schema = wrapTool(def as ModuleToolDefinition, stubContext()).inputSchema as {
				"~standard"?: { validate: (value: unknown) => { issues?: { message: string }[] } | Promise<{ issues?: { message: string }[] }> }
			}
			const standard = schema?.["~standard"]
			if (!standard) continue

			const result = await standard.validate(call.args)
			expect(`${call.name}: ${result.issues?.map((i) => i.message).join("; ") ?? "ok"}`).toBe(`${call.name}: ok`)
		}
	}, 120_000)
})
