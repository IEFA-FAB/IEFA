/**
 * O laço do agente do chat sobre documento.
 *
 * Um turno é: sistema (regras + fontes) → histórico → pergunta, e até {@link MAX_TOOL_ROUNDS}
 * rodadas em que o modelo pode chamar ferramenta. Na última rodada as ferramentas saem, e o
 * modelo tem de responder com o que já tem — o teto não vira resposta vazia.
 *
 * Todas as ferramentas são de LEITURA. Não existe caminho do agente até achado, triagem,
 * parecer, submissão ou anexo: a garantia de que o chat "não altera nada" é estrutural,
 * não uma instrução de prompt que um documento hostil poderia contornar.
 *
 * O texto é transmitido enquanto sai (`onDelta`). A reserva só entra em falha transitória e
 * ANTES do primeiro pedaço de texto do turno — a regra do repo: trocar de modelo depois de
 * a tela já mostrar metade de uma resposta emendaria duas respostas diferentes.
 *
 * Sem banco e sem Bedrock aqui: modelo e busca chegam por {@link ChatAgentDeps}, e o teste
 * roda o laço com modelo falso.
 */

import { AIMessage, type AIMessageChunk, type BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages"
import { messageText } from "../lib/message-text.ts"
import type { NormaEntry } from "./citations.ts"
import { CHAT_CORPORA, type ChatCorpus, type NormHit } from "./corpus.ts"
import { readSection, searchDocument } from "./doc-tools.ts"
import type { DocumentSource } from "./sources.ts"

export const MAX_TOOL_ROUNDS = 4

/** Definição de ferramenta no formato OpenAI — o `ChatBedrockConverse` também a converte. */
export interface ToolDefinition {
	type: "function"
	function: { name: string; description: string; parameters: Record<string, unknown> }
}

/** O que o laço precisa de um modelo: transmitir uma rodada, com ou sem ferramentas. */
export interface ChatModel {
	/** Id do modelo, gravado na mensagem. */
	id: string
	/** Aceita `cachePoint` na mensagem de sistema (só o Bedrock Converse). */
	supportsCachePoint: boolean
	stream(messages: BaseMessage[], tools: ToolDefinition[] | null, signal: AbortSignal): Promise<AsyncIterable<AIMessageChunk>>
}

export interface ChatAgentDeps {
	primary: ChatModel
	fallback: ChatModel | null
	isTransient: (error: unknown) => boolean
	searchNorms: (query: string, corpus: ChatCorpus) => Promise<{ hits: NormHit[]; unavailable: boolean }>
}

export type ChatPhase = "buscando_norma" | "lendo_secao" | "buscando_no_documento" | "escrevendo"

export interface ChatTurnInput {
	rules: string
	sources: string
	history: Array<{ role: "user" | "assistant"; content: string }>
	question: string
	documents: readonly DocumentSource[]
	/** Só com fonte em sumário: `ler_secao` e `buscar_no_documento` existem. */
	documentTools: boolean
	signal: AbortSignal
	onPhase: (phase: ChatPhase) => void
	onDelta: (text: string) => void
}

export interface ChatTurnResult {
	text: string
	/** Trechos de norma entregues ao modelo neste turno, por rótulo `N…`. */
	normas: Map<string, NormaEntry>
	model: string
	usage: { input_tokens: number; output_tokens: number }
}

export const CORPUS_NAMES = Object.keys(CHAT_CORPORA) as ChatCorpus[]

const SEARCH_NORMS_TOOL: ToolDefinition = {
	type: "function",
	function: {
		name: "buscar_norma",
		description:
			"Busca trechos no corpus normativo. Use antes de citar qualquer norma. Devolve trechos rotulados [N1], [N2]…, citáveis na resposta. legislacao = Lei 14.133, decretos e IN SEGES; modelos_agu = modelos de ETP/TR/edital da AGU; aeronautico = RADA-e e normas do COMAER.",
		parameters: {
			type: "object",
			properties: {
				consulta: { type: "string", description: "O que buscar, em linguagem natural ou pelos termos da norma." },
				corpus: { type: "string", enum: CORPUS_NAMES },
			},
			required: ["consulta", "corpus"],
		},
	},
}

const READ_SECTION_TOOL: ToolDefinition = {
	type: "function",
	function: {
		name: "ler_secao",
		description: "Lê o texto de uma seção (e das subseções) de um documento que veio como sumário. Citável como [D1:caminho].",
		parameters: {
			type: "object",
			properties: {
				documento: { type: "string", description: "Rótulo do documento, ex.: D1." },
				caminho: { type: "string", description: "Caminho da seção como aparece no sumário, ex.: 3.2." },
			},
			required: ["documento", "caminho"],
		},
	},
}

const SEARCH_DOCUMENT_TOOL: ToolDefinition = {
	type: "function",
	function: {
		name: "buscar_no_documento",
		description:
			"Procura um termo literal (sem distinguir acento nem caixa) num documento que veio como sumário. Devolve as ocorrências com o trecho em volta e a seção.",
		parameters: {
			type: "object",
			properties: {
				documento: { type: "string", description: "Rótulo do documento, ex.: D1." },
				termo: { type: "string" },
			},
			required: ["documento", "termo"],
		},
	},
}

/** Erro de ferramenta vai ao modelo como texto — ele lê e corrige, a run não morre. */
function toolError(message: string): string {
	return JSON.stringify({ erro: message })
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : ""
}

/**
 * Executa uma chamada de ferramenta do modelo. Argumento inválido é erro legível para o
 * modelo, nunca exceção: o modelo manda `null`, esquece campo e inventa rótulo.
 */
async function runTool(
	call: { name: string; args: Record<string, unknown> },
	input: ChatTurnInput,
	deps: ChatAgentDeps,
	normas: Map<string, NormaEntry>
): Promise<string> {
	if (call.name === "buscar_norma") {
		const query = asString(call.args.consulta).trim()
		const corpus = asString(call.args.corpus) as ChatCorpus
		if (!query) return toolError("informe `consulta`")
		if (!CORPUS_NAMES.includes(corpus)) return toolError(`corpus deve ser um de: ${CORPUS_NAMES.join(", ")}`)

		input.onPhase("buscando_norma")
		let found: { hits: NormHit[]; unavailable: boolean }
		try {
			found = await deps.searchNorms(query, corpus)
		} catch (error) {
			// Queda da busca não pode virar resposta de memória apresentada como fundamentada:
			// o modelo recebe o aviso e tem de dizer que não conseguiu conferir a norma.
			console.error("[chat] buscar_norma falhou:", error)
			return toolError("a busca no corpus normativo está fora do ar; não afirme nada sobre a norma e diga ao usuário que não foi possível conferir")
		}
		const { hits, unavailable } = found
		if (hits.length === 0) {
			return JSON.stringify({
				trechos: [],
				aviso: unavailable ? "a busca está parcialmente fora do ar; não afirme nada sobre a norma sem trecho" : "nenhum trecho encontrado",
			})
		}

		const byChunk = new Map([...normas.values()].map((entry) => [entry.chunk_id, entry.label]))
		const trechos = hits.map((hit) => {
			// O mesmo trecho em duas buscas do turno mantém o rótulo: o modelo não cita duas
			// vezes a mesma coisa com números diferentes.
			let label = byChunk.get(hit.chunk_id)
			if (!label) {
				label = `N${normas.size + 1}`
				normas.set(label, { label, chunk_id: hit.chunk_id, source: hit.source })
				byChunk.set(hit.chunk_id, label)
			}
			return { rotulo: label, documento: hit.source, localizacao: hit.locator || null, texto: hit.content }
		})
		return JSON.stringify({ trechos })
	}

	if (!input.documentTools) return toolError(`ferramenta ${call.name} não está disponível: todos os documentos vieram com o texto integral`)

	const doc = input.documents.find((candidate) => candidate.label === asString(call.args.documento).trim())
	if (!doc) return toolError(`documento inexistente; use um de: ${input.documents.map((candidate) => candidate.label).join(", ")}`)

	if (call.name === "ler_secao") {
		input.onPhase("lendo_secao")
		const section = readSection(doc.nodes, asString(call.args.caminho))
		if (!section) return toolError("seção inexistente neste documento; confira o caminho no sumário")
		return JSON.stringify({ rotulo: `${doc.label}:${section.path}`, titulo: section.title, texto: section.text, cortado: section.truncated })
	}

	if (call.name === "buscar_no_documento") {
		input.onPhase("buscando_no_documento")
		const result = searchDocument(doc, asString(call.args.termo))
		return JSON.stringify({
			total: result.total,
			ocorrencias: result.hits.map((hit) => ({ secao: hit.section ? `${doc.label}:${hit.section}` : null, trecho: hit.excerpt })),
		})
	}

	return toolError(`ferramenta desconhecida: ${call.name}`)
}

function systemMessage(input: ChatTurnInput, model: ChatModel): SystemMessage {
	if (!model.supportsCachePoint) return new SystemMessage(`${input.rules}\n\n${input.sources}`)
	// As regras e as fontes antes do cache point: é o prefixo que se repete entre turnos.
	return new SystemMessage({
		content: [{ type: "text", text: input.rules }, { type: "text", text: input.sources }, { cachePoint: { type: "default" } }] as never,
	})
}

/**
 * Uma rodada no modelo dado. Devolve a mensagem inteira; o texto sai por `onDelta` enquanto
 * chega. `emitted` diz se algum texto já foi para a tela — é o que proíbe a troca de modelo.
 */
async function streamRound(
	model: ChatModel,
	messages: BaseMessage[],
	tools: ToolDefinition[] | null,
	input: ChatTurnInput,
	state: { emitted: boolean; pendingSeparator: boolean }
): Promise<AIMessageChunk | null> {
	let full: AIMessageChunk | null = null
	for await (const chunk of await model.stream(messages, tools, input.signal)) {
		full = full ? full.concat(chunk) : chunk
		const text = messageText(chunk.content)
		if (!text) continue
		if (state.pendingSeparator) {
			input.onDelta("\n\n")
			state.pendingSeparator = false
		}
		state.emitted = true
		input.onPhase("escrevendo")
		input.onDelta(text)
	}
	return full
}

export async function runChatTurn(input: ChatTurnInput, deps: ChatAgentDeps): Promise<ChatTurnResult> {
	const normas = new Map<string, NormaEntry>()
	const usage = { input_tokens: 0, output_tokens: 0 }
	const state = { emitted: false, pendingSeparator: false }
	const texts: string[] = []
	let model = deps.primary

	const tools = input.documentTools ? [SEARCH_NORMS_TOOL, READ_SECTION_TOOL, SEARCH_DOCUMENT_TOOL] : [SEARCH_NORMS_TOOL]
	const conversation: BaseMessage[] = [
		...input.history.map((message) => (message.role === "user" ? new HumanMessage(message.content) : new AIMessage(message.content))),
		new HumanMessage(input.question),
	]

	for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
		const offerTools = round < MAX_TOOL_ROUNDS ? tools : null

		let reply: AIMessageChunk | null
		try {
			reply = await streamRound(model, [systemMessage(input, model), ...conversation], offerTools, input, state)
		} catch (error) {
			if (input.signal.aborted || state.emitted || !deps.fallback || model === deps.fallback || !deps.isTransient(error)) throw error
			console.warn(
				`[chat] ${model.id} falhou de forma transitória antes do primeiro texto, tentando a reserva (${deps.fallback.id}): ${error instanceof Error ? error.message : String(error)}`
			)
			model = deps.fallback
			reply = await streamRound(model, [systemMessage(input, model), ...conversation], offerTools, input, state)
		}

		if (!reply) break
		usage.input_tokens += reply.usage_metadata?.input_tokens ?? 0
		usage.output_tokens += reply.usage_metadata?.output_tokens ?? 0

		const text = messageText(reply.content)
		if (text) texts.push(text)

		const calls = offerTools ? (reply.tool_calls ?? []) : []
		if (calls.length === 0) break

		// Texto antes de uma chamada de ferramenta ("vou conferir na Lei 14.133…") já foi
		// para a tela; o da rodada seguinte entra depois de um parágrafo.
		if (text) state.pendingSeparator = true
		conversation.push(new AIMessage({ content: text, tool_calls: calls }))
		for (const call of calls) {
			const output = await runTool({ name: call.name, args: (call.args ?? {}) as Record<string, unknown> }, input, deps, normas)
			conversation.push(new ToolMessage({ tool_call_id: call.id ?? call.name, content: output }))
		}
	}

	return { text: texts.join("\n\n"), normas, model: model.id, usage }
}
