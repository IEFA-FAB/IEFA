/**
 * @module documents-ai.schema
 * JSON Schema da redação assistida — é ele que o Bedrock recebe pelo Converse.
 *
 * Módulo separado (sem `createServerFn`, sem client de dados) para poder ser importado
 * por teste sem arrastar `env.server`, que valida credencial na carga do módulo.
 *
 * O schema descreve só TEXTO. Numeração, NUP, OM, data e signatário ficam de fora de
 * propósito: são a identidade do documento e vêm do formulário.
 */

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
		assunto: { type: "string" },
		paragrafos: { type: "array", items: paragrafoSchema },
		referencias: { type: "array", items: { type: "string" } },
		anexos: { type: "array", items: { type: "string" } },
	},
	required: ["paragrafos"],
} as const
