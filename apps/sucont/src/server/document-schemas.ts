/**
 * @module document-schemas
 * JSON Schemas dos documentos gerados por IA.
 *
 * Módulo separado (sem `createServerFn`, sem client de dados) para que o bench de
 * modelos possa importar os schemas REAIS em vez de manter uma cópia — cópia que
 * silenciosamente deixa de cobrir o schema quando um campo obrigatório é adicionado.
 */
// ── JSON Schemas (instruem o modelo Bedrock via Converse; substituem o Type.* do Gemini) ──
export const fabSchema = {
	type: "object",
	properties: {
		organization: { type: "string" },
		subOrganization: { type: "string" },
		documentNumber: { type: "string" },
		acronym: { type: "string" },
		year: { type: "string" },
		city: { type: "string" },
		date: { type: "string" },
		protocol: { type: "string" },
		sender: { type: "string" },
		recipient: { type: "string" },
		subject: { type: "string" },
		references: { type: "array", items: { type: "string" } },
		annexes: { type: "array", items: { type: "string" } },
		paragraphs: { type: "array", items: { type: "string" } },
		signerName: { type: "string" },
		signerRank: { type: "string" },
		signerPosition: { type: "string" },
		urgency: { type: "boolean" },
	},
	required: [
		"organization",
		"documentNumber",
		"acronym",
		"year",
		"city",
		"date",
		"protocol",
		"sender",
		"recipient",
		"subject",
		"paragraphs",
		"signerName",
		"signerRank",
		"signerPosition",
	],
} as const

export const analysisSchema = {
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
				properties: {
					label: { type: "string" },
					value: { type: "string" },
					trend: { type: "string", enum: ["up", "down", "neutral"] },
				},
				required: ["label", "value", "trend"],
			},
		},
		tableData: {
			type: "object",
			properties: {
				headers: { type: "array", items: { type: "string" } },
				rows: { type: "array", items: { type: "array", items: { type: "string" } } },
			},
			required: ["headers", "rows"],
		},
		analysis: { type: "array", items: { type: "string" } },
		conclusion: { type: "string" },
		recommendations: { type: "array", items: { type: "string" } },
	},
	required: ["title", "subtitle", "author", "date", "summary", "keyMetrics", "tableData", "analysis", "conclusion", "recommendations"],
} as const
