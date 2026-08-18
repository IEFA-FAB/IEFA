/**
 * @module sacdgc/schema
 * Contrato de saída do SAC-DGC: o JSON Schema que instrui o modelo e o
 * normalizador que confere o que voltou.
 *
 * `generateJson` devolve `result.data as T` — um cast, não uma validação. Sem o
 * `normalizeDgcAnalysis` abaixo, três coisas passavam direto para a tela:
 *
 *  1. checklist incompleto (o modelo devolvia 11 das 20 perguntas e a tela mostrava
 *     "11 itens avaliados", como se o resto tivesse sido dispensado);
 *  2. indicadores contados pelo próprio modelo — pedir para um LLM contar 20 itens
 *     é pedir um número plausível, não o certo. Aqui eles são recalculados;
 *  3. identificação da UG escolhida pelo modelo, que às vezes copiava a UG
 *     beneficiada de uma linha do Painel 4. Quem sabe qual UG foi analisada é o
 *     recorte, então codigoUg/nomeUg são sobrescritos pelo dataset.
 */

import { z } from "zod"
import { CHECKLIST_BY_ID, CHECKLIST_QUESTIONS } from "#/sacdgc/checklist"
import type { ChecklistItem, DgcAnalysis } from "#/sacdgc/types"

// ── JSON Schema (instrui o modelo via Converse/structuredOutput) ──
export const dgcAnalysisSchema = {
	type: "object",
	properties: {
		identificacao: {
			type: "object",
			properties: {
				codigoUg: { type: "string", description: "Código da UG analisada, exatamente como informado no prompt" },
				nomeUg: { type: "string", description: "Nome da UG analisada, exatamente como informado no prompt" },
				anoReferencia: { type: "string", description: "Ano extraído dos dados" },
				mesReferencia: { type: "string", description: "Mês ou período de referência identificado nos dados" },
			},
			required: ["codigoUg", "nomeUg", "anoReferencia", "mesReferencia"],
		},
		analisePainel1: { type: "string", description: "Raciocínio sobre a distribuição dos custos (1 a 2 parágrafos)" },
		analisePainel2: { type: "string", description: "Raciocínio sobre efetivo e comportamento temporal (1 a 2 parágrafos)" },
		analisePainel3: { type: "string", description: "Raciocínio sobre NDD × Sistema e comparação institucional (1 a 2 parágrafos)" },
		analisePainel4: { type: "string", description: "Raciocínio sobre consistência contábil dos itens de custo (1 a 2 parágrafos)" },
		alertasDeCriticidade: {
			type: "array",
			items: {
				type: "object",
				properties: {
					titulo: { type: "string" },
					origemAnalise: { type: "array", items: { type: "string" } },
					evidencia: { type: "string" },
					acaoRecomendada: { type: "string" },
				},
				required: ["titulo", "origemAnalise", "evidencia", "acaoRecomendada"],
			},
		},
		checklistAec: {
			type: "object",
			properties: {
				perguntas: {
					type: "array",
					description: "As 20 perguntas do checklist, na íntegra",
					items: {
						type: "object",
						properties: {
							id: { type: "integer" },
							pergunta: { type: "string" },
							resposta: { type: "string", enum: ["SIM", "NÃO"] },
							fundamentacaoTecnica: { type: "string", description: "Somente quando resposta = SIM" },
							evidenciasEncontradas: { type: "array", items: { type: "string" }, description: "Somente quando resposta = SIM" },
							recomendacao: { type: "string", description: "Somente quando resposta = SIM" },
						},
						required: ["id", "pergunta", "resposta"],
					},
				},
			},
			required: ["perguntas"],
		},
	},
	required: ["identificacao", "analisePainel1", "analisePainel2", "analisePainel3", "analisePainel4", "alertasDeCriticidade", "checklistAec"],
} as const

// ── Validação do que voltou ──────────────────────────────────

const textSchema = z.string().trim().catch("")

const respostaSchema = z
	.string()
	// O modelo escreve "SIM", "Sim", "NAO", "NÃO", "Não". Só o S inicial distingue.
	.transform((value) => (value.trim().toUpperCase().startsWith("S") ? "SIM" : "NÃO"))
	.catch("NÃO")

const rawItemSchema = z.object({
	id: z.coerce.number().int(),
	pergunta: textSchema.optional(),
	resposta: respostaSchema,
	fundamentacaoTecnica: textSchema.optional(),
	evidenciasEncontradas: z.array(textSchema).catch([]).optional(),
	recomendacao: textSchema.optional(),
})

const rawAnalysisSchema = z.object({
	identificacao: z
		.object({
			codigoUg: textSchema.optional(),
			nomeUg: textSchema.optional(),
			anoReferencia: textSchema.optional(),
			mesReferencia: textSchema.optional(),
		})
		.catch({}),
	analisePainel1: textSchema.optional(),
	analisePainel2: textSchema.optional(),
	analisePainel3: textSchema.optional(),
	analisePainel4: textSchema.optional(),
	alertasDeCriticidade: z
		.array(
			z.object({
				titulo: textSchema,
				origemAnalise: z.array(textSchema).catch([]),
				evidencia: textSchema,
				acaoRecomendada: textSchema,
			})
		)
		.catch([]),
	checklistAec: z.object({ perguntas: z.array(rawItemSchema).catch([]) }).catch({ perguntas: [] }),
})

export class DgcAnalysisShapeError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "DgcAnalysisShapeError"
	}
}

export interface NormalizeContext {
	ugCode: string
	ugName: string
	/** Competência da carga — usada quando o modelo não identifica mês/ano. */
	competence?: string
}

/**
 * Valida a resposta do modelo e a alinha ao contrato da tela.
 * @throws DgcAnalysisShapeError quando o retorno não tem sequer a forma de objeto.
 */
export function normalizeDgcAnalysis(raw: unknown, ctx: NormalizeContext): DgcAnalysis {
	const parsed = rawAnalysisSchema.safeParse(raw)
	if (!parsed.success) {
		throw new DgcAnalysisShapeError("A resposta do modelo não seguiu o formato esperado da análise DGC.")
	}
	const data = parsed.data

	const byId = new Map<number, ChecklistItem>()
	for (const item of data.checklistAec.perguntas) {
		const canonical = CHECKLIST_BY_ID.get(item.id)
		if (!canonical || byId.has(item.id)) continue
		const isFinding = item.resposta === "SIM"
		byId.set(item.id, {
			id: item.id,
			// O enunciado é da SUCONT, não do modelo.
			pergunta: canonical.pergunta,
			resposta: item.resposta,
			// "NÃO" não carrega justificativa: o texto que o modelo às vezes anexa a um
			// "NÃO" descreve o que NÃO foi encontrado e a tela o exibiria como achado.
			fundamentacaoTecnica: isFinding ? item.fundamentacaoTecnica || undefined : undefined,
			evidenciasEncontradas: isFinding ? (item.evidenciasEncontradas?.filter(Boolean) ?? undefined) : undefined,
			recomendacao: isFinding ? item.recomendacao || undefined : undefined,
		})
	}

	// Pergunta não respondida é "sem apontamento" — nunca some da lista, senão o
	// total exibido passa a depender de quanto o modelo conseguiu escrever.
	const perguntas: ChecklistItem[] = CHECKLIST_QUESTIONS.map((q) => byId.get(q.id) ?? { id: q.id, pergunta: q.pergunta, resposta: "NÃO" as const })

	const comApontamento = perguntas.filter((p) => p.resposta === "SIM").length

	const competenceMonth = ctx.competence?.split("/")[0]?.trim() ?? ""
	const competenceYear = ctx.competence?.split("/")[1]?.trim() ?? ""

	return {
		identificacao: {
			codigoUg: ctx.ugCode,
			nomeUg: ctx.ugName,
			anoReferencia: data.identificacao.anoReferencia || competenceYear,
			mesReferencia: data.identificacao.mesReferencia || competenceMonth,
		},
		analisePainel1: data.analisePainel1 ?? "",
		analisePainel2: data.analisePainel2 ?? "",
		analisePainel3: data.analisePainel3 ?? "",
		analisePainel4: data.analisePainel4 ?? "",
		alertasDeCriticidade: data.alertasDeCriticidade,
		checklistAec: {
			indicadores: {
				total: perguntas.length,
				comApontamento,
				semApontamento: perguntas.length - comApontamento,
			},
			perguntas,
		},
	}
}
