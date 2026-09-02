/**
 * @module comaer/tools/server
 * As tools de remendo, do lado do servidor.
 *
 * O handler NÃO grava: ele valida o remendo contra o documento do turno e devolve ao
 * modelo a frase do que entrou. Quem aplica é o cliente, lendo as mesmas chamadas pelo
 * stream — com a mesma função pura (`applyPatch`), o que o modelo acha que escreveu e o
 * que aparece na tela não podem divergir.
 *
 * O documento é acumulado ao longo do turno para que a validação enxergue os remendos
 * anteriores: sem isso, inserir dois parágrafos seguidos recusaria o segundo por índice
 * fora do intervalo.
 */

import type { ServerTool } from "@tanstack/ai"
import { toolDefinition } from "@tanstack/ai"
import type { DocumentInput } from "../types"
import { CHAT_TOOLS, dropModelNulls } from "./definitions"
import { applyPatch, PatchError } from "./patch"

export function buildChatTools(initial: DocumentInput): ServerTool[] {
	let current = initial

	return CHAT_TOOLS.map((def) =>
		toolDefinition({
			name: def.name,
			description: def.description,
			// JSON Schema puro é aceito em runtime; o tipo do TanStack ainda não reflete isso.
			// biome-ignore lint/suspicious/noExplicitAny: SchemaInput não cobre JSONSchema puro
			inputSchema: def.parameters as any,
		}).server(async (args) => {
			// `null` do modelo é ausência — a poda não desce em array de propósito.
			const input = dropModelNulls((args ?? {}) as Record<string, unknown>)
			try {
				const patch = applyPatch(current, def.name, input)
				current = patch.document
				return { ok: true, summary: patch.summary, touched: patch.touched }
			} catch (error) {
				// Erro de remendo volta como erro de tool: o modelo lê a mensagem e corrige na
				// chamada seguinte, em vez de a run inteira morrer sem explicação.
				if (error instanceof PatchError) throw new Error(error.message)
				throw error
			}
		})
	)
}
