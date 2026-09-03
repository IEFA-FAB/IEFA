/**
 * @module comaer/tools/definitions
 * As tools que o modelo enxerga na conversa: nome, descrição e JSON Schema.
 *
 * Módulo sem dependência de servidor para que o teste de argumentos do modelo possa
 * varrê-lo sem arrastar `env.server`, que valida credencial na carga.
 *
 * Todo campo opcional aceita `null` explicitamente. Modelo não omite campo opcional: ele
 * manda `null`. Onde o schema diz apenas `"string"`, um `null` vira erro de validação que
 * mata a run sem mensagem — foi assim no chat do sisub, e está registrado no CLAUDE.md.
 */

import { DOCUMENT_KINDS } from "../catalog"

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, "null"], ...extra })

const partySchema = {
	type: ["object", "null"],
	properties: {
		position: { type: "string", description: "cargo, nunca o nome da pessoa (art. 36)" },
		gender: nullable("string", { enum: ["m", "f", null], description: "concordância: m = Do/Ao, f = Da/À" }),
		via: nullable("string", { description: "autoridade intermediária, quando tramita via cadeia de comando" }),
	},
	required: ["position"],
} as const

const paragraphSchema = {
	type: "object",
	properties: {
		text: { type: "string" },
		items: {
			type: ["array", "null"],
			items: {
				type: "object",
				properties: {
					text: { type: "string" },
					alineas: { type: ["array", "null"], items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
				},
				required: ["text"],
			},
		},
	},
	required: ["text"],
} as const

export interface ChatToolDefinition {
	name: string
	description: string
	parameters: Record<string, unknown>
}

export const CHAT_TOOLS: readonly ChatToolDefinition[] = [
	{
		name: "set_form",
		description:
			"Define a forma do documento: espécie, âmbito, grau de sigilo, prioridade, precedência do destinatário e, no despacho decisório, a decisão. Espécie e âmbito são conciliados pelo catálogo — par impossível é corrigido, não recusado.",
		parameters: {
			type: "object",
			properties: {
				kind: nullable("string", { enum: [...DOCUMENT_KINDS.map((k) => k.id), null] }),
				scope: nullable("string", { enum: ["interno-om", "comaer", "externo", null] }),
				classification: nullable("string", { enum: ["ostensivo", "reservado", "secreto", "ultrassecreto", null] }),
				priority: nullable("string", { enum: ["rotina", "urgente", null] }),
				precedence: nullable("string", { enum: ["superior", "igual", "inferior", null], description: "posição do destinatário em relação ao signatário" }),
				decision: nullable("string", { enum: ["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE", null] }),
			},
		},
	},
	{
		name: "set_parties",
		description: "Define remetente, destinatários, endereçamento externo, vocativo e caráter de difusão (circular ou DIFRAL).",
		parameters: {
			type: "object",
			properties: {
				sender: partySchema,
				recipients: { type: ["array", "null"], items: { ...partySchema, type: "object" } },
				addressing: {
					type: ["object", "null"],
					properties: {
						formOfAddress: nullable("string", { enum: ["excelencia", "senhoria", null] }),
						gender: nullable("string", { enum: ["m", "f", null] }),
						name: nullable("string"),
						position: nullable("string"),
						addressLines: { type: ["array", "null"], items: { type: "string" } },
					},
				},
				vocativo: nullable("string"),
				distribution: nullable("string", { enum: ["circular", "difral", null] }),
			},
		},
	},
	{
		name: "set_ementa",
		description: "Define a ementa: assunto (expressão substantiva sucinta, art. 37 § 2º, II), referências e anexos.",
		parameters: {
			type: "object",
			properties: {
				subject: nullable("string"),
				references: { type: ["array", "null"], items: { type: "string" } },
				annexes: { type: ["array", "null"], items: { type: "string" } },
			},
		},
	},
	{
		name: "write_body",
		description: "Escreve o texto inteiro, substituindo o que houver. Use ao redigir do zero; para ajuste pontual, prefira replace_paragraph.",
		parameters: { type: "object", properties: { paragraphs: { type: "array", items: paragraphSchema } }, required: ["paragraphs"] },
	},
	{
		name: "replace_paragraph",
		description: "Substitui um parágrafo pelo número que ele tem no documento (1 é o primeiro).",
		parameters: {
			type: "object",
			properties: { number: { type: "integer" }, text: { type: "string" }, items: paragraphSchema.properties.items },
			required: ["number", "text"],
		},
	},
	{
		name: "insert_paragraph",
		description: "Insere um parágrafo na posição indicada, empurrando os seguintes. Para acrescentar ao final, use o número seguinte ao último.",
		parameters: {
			type: "object",
			properties: { number: { type: "integer" }, text: { type: "string" }, items: paragraphSchema.properties.items },
			required: ["number", "text"],
		},
	},
	{
		name: "remove_paragraph",
		description: "Remove o parágrafo do número indicado.",
		parameters: { type: "object", properties: { number: { type: "integer" } }, required: ["number"] },
	},
]

/**
 * Poda o `null` que o modelo manda no lugar de omitir campo opcional.
 *
 * Não desce em array de propósito: posição em array é significativa, e apagar item
 * deslocaria os demais. Por isso todo opcional DENTRO de array já aceita `null` no schema
 * acima — é a mesma divisão de trabalho do chat do sisub.
 */
export function dropModelNulls(args: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(args)) {
		if (value === null) continue
		if (value && typeof value === "object" && !Array.isArray(value)) {
			out[key] = dropModelNulls(value as Record<string, unknown>)
			continue
		}
		out[key] = value
	}
	return out
}
