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

import { ESPECIES } from "@/lib/comaer/especies"

const parteSchema = {
	type: "object",
	properties: {
		cargo: { type: "string" },
		genero: { type: "string", enum: ["m", "f"], description: "concordância do artigo: m = Do/Ao, f = Da/À" },
		via: { type: "string", description: "autoridade intermediária, quando o documento tramita via cadeia de comando" },
	},
	required: ["cargo"],
} as const

const paragrafoSchema = {
	type: "object",
	properties: {
		texto: { type: "string" },
		itens: {
			type: "array",
			items: {
				type: "object",
				properties: {
					texto: { type: "string" },
					alineas: {
						type: "array",
						items: {
							type: "object",
							properties: {
								texto: { type: "string" },
								subalineas: { type: "array", items: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] } },
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

export const redacaoJsonSchema = {
	type: "object",
	properties: {
		especie: { type: "string", enum: ESPECIES.map((e) => e.id), description: "espécie de comunicação oficial adequada ao que o rascunho pede" },
		ambito: { type: "string", enum: ["interno-om", "comaer", "externo"], description: "para onde o documento vai" },
		prioridade: { type: "string", enum: ["rotina", "urgente"] },
		precedencia: {
			type: "string",
			enum: ["superior", "igual", "inferior"],
			description: "posição do destinatário em relação ao signatário; decide o fecho quando o destinatário é externo ao COMAER",
		},
		remetente: parteSchema,
		destinatarios: { type: "array", items: parteSchema },
		enderecamento: {
			type: "object",
			properties: {
				tratamento: { type: "string", enum: ["excelencia", "senhoria"] },
				genero: { type: "string", enum: ["m", "f"] },
				nome: { type: "string" },
				cargo: { type: "string" },
				linhasEndereco: { type: "array", items: { type: "string" } },
			},
		},
		vocativo: { type: "string" },
		decisao: { type: "string", enum: ["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"] },
		assunto: { type: "string" },
		paragrafos: { type: "array", items: paragrafoSchema },
		referencias: { type: "array", items: { type: "string" } },
		anexos: { type: "array", items: { type: "string" } },
	},
	required: ["paragrafos"],
} as const
