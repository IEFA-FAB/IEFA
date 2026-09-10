/**
 * @module auditor/services/report-schema
 * Contrato de saída da Nota Analítica Estratégica.
 *
 * O modelo devolve só PROSA. Nenhum campo aqui carrega valor monetário, código de
 * UG ou contagem: esses vêm do `ReportDataset` e são impressos pelo montador. Foi
 * a decisão que substituiu a instrução da versão de origem — "apresente uma tabela
 * Markdown CLARA… a tabela deve ser impecável" —, que pedia ao modelo justamente o
 * que ele erra sem avisar, num documento que sai assinado pela SUCONT-4.
 *
 * `structuredOutput` devolve `result.data` sem validar; quem confere é
 * `normalizeAnalyticNote`. Sem ele, seção ausente vira `undefined` e o montador
 * imprime um título com nada embaixo — uma nota institucional com um capítulo em
 * branco e nenhum sinal de que faltou algo.
 */

import { z } from "zod"

/** JSON Schema entregue ao Converse. Espelha o `rawNoteSchema` abaixo. */
export const analyticNoteJsonSchema = {
	type: "object",
	properties: {
		sumarioExecutivo: {
			type: "string",
			description:
				"Seção 1 — diagnóstico da situação da competência: gravidade da divergência total, o que a diferença entre o total dos módulos e o total líquido sugere, e o que a preponderância indica. 2 a 3 parágrafos. Não repita os números: eles já estão impressos acima da seção.",
		},
		leituraUnidadesCriticas: {
			type: "string",
			description:
				"Seção 2 — leitura da tabela das maiores divergências, que JÁ está impressa. Comente concentração, repetição de UG entre grupos e o que o sistema preponderante sugere em cada caso. 1 a 2 parágrafos. Nunca reescreva a tabela nem repita os valores linha a linha.",
		},
		destaquesDeAlerta: {
			type: "array",
			description: "Seção 3 — no mínimo 5 pontos sensíveis, cada um com análise e ação recomendada.",
			items: {
				type: "object",
				properties: {
					titulo: { type: "string", description: "Frase curta que nomeia o achado" },
					unidade: { type: "string", description: "UG ou grupo a que o ponto se refere; omita quando for sistêmico" },
					analise: { type: "string", description: "Por que este ponto é sensível, à luz dos dados fornecidos" },
					acaoRecomendada: { type: "string", description: "O que a Setorial ou a UG deve fazer" },
				},
				required: ["titulo", "analise", "acaoRecomendada"],
			},
		},
		leituraTendencias: {
			type: "string",
			description:
				"Seção 4 — leitura das tabelas de agravamento e melhoria dos três escopos, que JÁ estão impressas. Diga o que a comparação entre mensal, trimestral e semestral revela e reconheça as unidades que reduziram. 2 a 3 parágrafos.",
		},
		leituraGrupos: {
			type: "string",
			description: "Seção 5 — comparação entre BMP, Consumo e Intangível a partir da tabela já impressa: onde está o gargalo e por quê. 1 a 2 parágrafos.",
		},
		planoDeAcao: {
			type: "array",
			description: "Seção 6 — recomendações aos Ordenadores de Despesa, uma por item, na ordem de prioridade.",
			items: { type: "string" },
		},
		conclusao: { type: "string", description: "Seção 7 — nível de exposição ao risco e próximos passos. 1 parágrafo." },
	},
	required: ["sumarioExecutivo", "leituraUnidadesCriticas", "destaquesDeAlerta", "leituraTendencias", "leituraGrupos", "planoDeAcao", "conclusao"],
} as const

export interface AnalyticNoteHighlight {
	titulo: string
	unidade?: string
	analise: string
	acaoRecomendada: string
}

export interface AnalyticNote {
	sumarioExecutivo: string
	leituraUnidadesCriticas: string
	destaquesDeAlerta: AnalyticNoteHighlight[]
	leituraTendencias: string
	leituraGrupos: string
	planoDeAcao: string[]
	conclusao: string
}

const textSchema = z.string().trim().catch("")

/**
 * `unidade` é `.nullish()` porque está DENTRO de array.
 *
 * Modelo não omite campo opcional: manda `null`. O saneador que derruba `null` de
 * argumento de modelo não desce em array — posição em array é significativa —, e
 * um `null` aninhado aqui reprovaria o item inteiro, que sairia da lista sem
 * deixar rastro. Mesma regra do contrato de tools do sisub.
 */
const highlightSchema = z.object({
	// Sem `.catch`: alerta sem título não é achado, é um cartão em branco na nota.
	titulo: z.string().trim().min(1),
	unidade: z.string().trim().nullish(),
	analise: textSchema,
	acaoRecomendada: textSchema,
})

/**
 * Valida item a item e descarta só o que não passa.
 *
 * `z.array(schema).catch([])` derruba a lista INTEIRA por causa de um elemento
 * torto — um alerta sem título apagaria os outros seis, e a seção 3 sairia vazia
 * numa nota que afirma trazer no mínimo cinco pontos.
 */
function lenientArray<T extends z.ZodType>(item: T) {
	return z
		.array(z.unknown())
		.catch([])
		.transform((entries) => {
			const out: z.infer<T>[] = []
			for (const entry of entries) {
				const parsed = item.safeParse(entry)
				if (parsed.success) out.push(parsed.data)
			}
			return out
		})
}

const rawNoteSchema = z.object({
	sumarioExecutivo: textSchema.optional(),
	leituraUnidadesCriticas: textSchema.optional(),
	destaquesDeAlerta: lenientArray(highlightSchema),
	leituraTendencias: textSchema.optional(),
	leituraGrupos: textSchema.optional(),
	planoDeAcao: lenientArray(z.string().trim().min(1)),
	conclusao: textSchema.optional(),
})

export class AnalyticNoteShapeError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "AnalyticNoteShapeError"
	}
}

/**
 * Confere o retorno do modelo e o alinha ao contrato do montador.
 * @throws AnalyticNoteShapeError quando o retorno não tem sequer forma de objeto.
 */
export function normalizeAnalyticNote(raw: unknown): AnalyticNote {
	const parsed = rawNoteSchema.safeParse(raw)
	if (!parsed.success) {
		throw new AnalyticNoteShapeError("A resposta do modelo não seguiu o formato esperado da nota analítica.")
	}
	const data = parsed.data

	return {
		sumarioExecutivo: data.sumarioExecutivo ?? "",
		leituraUnidadesCriticas: data.leituraUnidadesCriticas ?? "",
		destaquesDeAlerta: data.destaquesDeAlerta.map((h) => ({
			titulo: h.titulo,
			// `null` e string vazia viram ausência: o montador decide entre imprimir o
			// escopo do alerta e omiti-lo, e "— " sozinho ao lado do título é lixo.
			unidade: h.unidade?.trim() ? h.unidade.trim() : undefined,
			analise: h.analise,
			acaoRecomendada: h.acaoRecomendada,
		})),
		leituraTendencias: data.leituraTendencias ?? "",
		leituraGrupos: data.leituraGrupos ?? "",
		planoDeAcao: data.planoDeAcao,
		conclusao: data.conclusao ?? "",
	}
}
