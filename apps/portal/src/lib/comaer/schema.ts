/**
 * @module comaer/schema
 * Schemas Zod do documento: fronteira entre o app e as duas coisas que não são código
 * nosso — o `jsonb` que volta do banco e o JSON que volta do modelo.
 *
 * O tipo TypeScript não sobrevive a nenhuma das duas travessias. Um payload gravado por
 * uma versão anterior do formulário e um objeto alucinado pelo modelo chegam aqui com a
 * mesma cara: `unknown`.
 */

import { z } from "zod"
import type { DocumentoInput } from "./tipos"

const GeneroSchema = z.enum(["m", "f"])

const ParteSchema = z.object({
	cargo: z.string(),
	genero: GeneroSchema.optional(),
	via: z.string().optional(),
})

const ParagrafoSchema = z.object({
	texto: z.string(),
	itens: z
		.array(
			z.object({
				texto: z.string(),
				alineas: z
					.array(
						z.object({
							texto: z.string(),
							subalineas: z.array(z.object({ texto: z.string() })).optional(),
						})
					)
					.optional(),
			})
		)
		.optional(),
})

/**
 * O payload gravado no `jsonb`. Igual ao `DocumentoInput`, com uma diferença: `data` é
 * string ISO. `Date` não sobrevive a `JSON.stringify` — volta string e quebraria
 * `dataPorExtenso` com "data.getDate is not a function" só ao ABRIR um documento salvo,
 * nunca ao salvar.
 */
export const DocumentoPayloadSchema = z.object({
	especie: z.string(),
	ambito: z.enum(["interno-om", "comaer", "externo"]),
	sigilo: z.enum(["ostensivo", "reservado", "secreto", "ultrassecreto"]),
	prioridade: z.enum(["rotina", "urgente"]).optional(),
	om: z.object({
		nome: z.string(),
		sigla: z.string().optional(),
		setor: z.string().optional(),
		endereco: z.string().optional(),
		telefone: z.string().optional(),
		email: z.string().optional(),
	}),
	numeracao: z.object({
		sequencial: z.number().nullable(),
		setor: z.string().optional(),
		ordemGeral: z.string().optional(),
		ano: z.number().optional(),
	}),
	nup: z.string().optional(),
	localidade: z.string(),
	data: z.iso.datetime(),
	remetente: ParteSchema.optional(),
	destinatarios: z.array(ParteSchema),
	difusao: z.enum(["circular", "difral"]).optional(),
	assunto: z.string().optional(),
	referencias: z.array(z.string()).optional(),
	anexos: z.array(z.string()).optional(),
	vocativo: z.string().optional(),
	enderecamento: z
		.object({
			tratamento: z.enum(["excelencia", "senhoria"]),
			genero: GeneroSchema,
			nome: z.string().optional(),
			cargo: z.string().optional(),
			linhasEndereco: z.array(z.string()).optional(),
		})
		.optional(),
	precedencia: z.enum(["superior", "igual", "inferior"]).optional(),
	paragrafos: z.array(ParagrafoSchema),
	signatario: z.object({
		nome: z.string(),
		posto: z.string().optional(),
		quadro: z.string().optional(),
		cargo: z.string().optional(),
		om: z.string().optional(),
		noImp: z.object({ nome: z.string(), posto: z.string().optional(), quadro: z.string().optional() }).optional(),
		porOrdemDe: z.string().optional(),
	}),
	processo: z.object({ nup: z.string().optional(), referencia: z.string().optional() }).optional(),
	ordemDespacho: z.number().optional(),
	decisao: z.enum(["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"]).optional(),
})

export type DocumentoPayload = z.infer<typeof DocumentoPayloadSchema>

export function paraPayload(input: DocumentoInput): DocumentoPayload {
	return DocumentoPayloadSchema.parse({ ...input, data: input.data.toISOString() })
}

export function dePayload(payload: unknown): DocumentoInput {
	const dados = DocumentoPayloadSchema.parse(payload)
	return { ...dados, data: new Date(dados.data) }
}

/**
 * Saída do modelo na redação assistida.
 *
 * `.nullish()` em TODO campo opcional aninhado em array não é preciosismo: modelo não
 * omite campo opcional, ele manda `null`, e um `null` dentro de array chega inteiro no
 * `.parse()` — a normalização de nulos do boundary não desce em array de propósito
 * (posição em array é significativa). Sem isso, a geração morre em erro de schema, que é
 * o que o CLAUDE.md registra como já tendo acontecido no chat do sisub.
 *
 * O modelo escreve TEXTO. Numeração, NUP, OM, datas e signatário não entram aqui: são a
 * identidade do documento, vêm do formulário, e um número de ofício inventado é o tipo de
 * erro que só aparece depois do despacho.
 */
export const RedacaoIaSchema = z
	.object({
		assunto: z.string().nullish(),
		paragrafos: z
			.array(
				z.object({
					texto: z.string(),
					itens: z
						.array(
							z.object({
								texto: z.string(),
								alineas: z
									.array(
										z.object({
											texto: z.string(),
											subalineas: z.array(z.object({ texto: z.string() })).nullish(),
										})
									)
									.nullish(),
							})
						)
						.nullish(),
				})
			)
			.min(1),
		referencias: z.array(z.string()).nullish(),
		anexos: z.array(z.string()).nullish(),
	})
	.transform((saida) => ({
		assunto: saida.assunto ?? undefined,
		referencias: saida.referencias ?? undefined,
		anexos: saida.anexos ?? undefined,
		paragrafos: saida.paragrafos.map((p) => ({
			texto: p.texto,
			itens: (p.itens ?? undefined)?.map((i) => ({
				texto: i.texto,
				alineas: (i.alineas ?? undefined)?.map((a) => ({
					texto: a.texto,
					subalineas: (a.subalineas ?? undefined)?.map((s) => ({ texto: s.texto })),
				})),
			})),
		})),
	}))

export type RedacaoIa = z.infer<typeof RedacaoIaSchema>
