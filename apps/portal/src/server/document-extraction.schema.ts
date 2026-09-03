/**
 * @module documents-ai.schema
 * JSON Schema da redação assistida — é ele que o Bedrock recebe pelo Converse.
 *
 * Módulo separado (sem `createServerFn`, sem client de dados) para poder ser importado
 * por teste sem arrastar `env.server`, que valida credencial na carga do módulo.
 *
 * O schema descreve a FORMA e o TEXTO: espécie, âmbito, partes, precedência, vocativo e
 * prioridade saem do rascunho. Numeração, NUP, OM, localidade, data, ordem do despacho e
 * signatário ficam de fora de propósito — são a identidade do documento e vêm do
 * formulário.
 *
 * A lista de espécies é derivada do catálogo (`ESPECIES`), nunca escrita à mão aqui:
 * espécie nova tem de chegar ao modelo no mesmo commit em que entra no catálogo.
 */

import { DOCUMENT_KINDS } from "@/lib/comaer/catalog"

const partySchema = {
	type: "object",
	properties: {
		position: { type: "string" },
		gender: { type: "string", enum: ["m", "f"], description: "concordância do artigo: m = Do/Ao, f = Da/À" },
		via: { type: "string", description: "autoridade intermediária, quando o documento tramita via cadeia de comando" },
	},
	required: ["cargo"],
} as const

const paragraphSchema = {
	type: "object",
	properties: {
		text: { type: "string" },
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					text: { type: "string" },
					alineas: {
						type: "array",
						items: {
							type: "object",
							properties: {
								text: { type: "string" },
								subalineas: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["texto"] } },
							},
							required: ["texto"],
						},
					},
				},
				required: ["texto"],
			},
		},
	},
	required: ["texto"],
} as const

export const aiProposalJsonSchema = {
	type: "object",
	properties: {
		kind: { type: "string", enum: DOCUMENT_KINDS.map((e) => e.id), description: "espécie de comunicação oficial adequada ao que o rascunho pede" },
		scope: { type: "string", enum: ["interno-om", "comaer", "externo"], description: "para onde o documento vai" },
		priority: { type: "string", enum: ["rotina", "urgente"] },
		precedence: {
			type: "string",
			enum: ["superior", "igual", "inferior"],
			description: "posição do destinatário em relação ao signatário; decide o fecho quando o destinatário é externo ao COMAER",
		},
		sender: partySchema,
		recipients: { type: "array", items: partySchema },
		addressing: {
			type: "object",
			properties: {
				formOfAddress: { type: "string", enum: ["excelencia", "senhoria"] },
				gender: { type: "string", enum: ["m", "f"] },
				name: { type: "string" },
				position: { type: "string" },
				addressLines: { type: "array", items: { type: "string" } },
			},
		},
		vocativo: { type: "string" },
		decision: { type: "string", enum: ["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"] },
		subject: { type: "string" },
		paragraphs: { type: "array", items: paragraphSchema },
		references: { type: "array", items: { type: "string" } },
		annexes: { type: "array", items: { type: "string" } },
	},
	required: ["paragrafos"],
} as const
