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
 * O modelo decide a FORMA e escreve o TEXTO: espécie, âmbito, destinatários, precedência,
 * vocativo e prioridade saem do próprio rascunho, e são exatamente as escolhas que o
 * redator ocasional erra — pedir prorrogação por Requerimento em vez de Ofício, ou marcar
 * fecho de cortesia num expediente que circula dentro do COMAER.
 *
 * O que continua FORA, e não por esquecimento: numeração, NUP, OM, localidade, data,
 * ordem do despacho e signatário. É a identidade do documento — vem do formulário, e um
 * número de ofício inventado é o tipo de erro que só aparece depois do despacho.
 */
/**
 * Marcador de preenchimento devolvido pelo modelo.
 *
 * Pedir "deixe ausente o que o rascunho não sustenta" não basta: o modelo prefere entregar
 * um espaço reservado a entregar nada, e `<UNKNOWN>` no lugar do nome do destinatário foi o
 * que ele mandou de fato num ofício a juiz federal. Ausente o usuário completa; um
 * `<UNKNOWN>` no endereçamento ele copia para o SIGADAER sem enxergar.
 */
const PLACEHOLDERS = /^\s*(<[^>]*>|\[[^\]]*\]|\{[^}]*\}|x{3,}|unknown|desconhecido|n\/?a|a definir|preencher)\s*$/i

function semPlaceholder(valor: string | null | undefined): string | undefined {
	if (valor == null) return undefined
	const limpo = valor.trim()
	if (limpo === "" || PLACEHOLDERS.test(limpo)) return undefined
	return limpo
}

export const RedacaoIaSchema = z
	.object({
		especie: z.string().nullish(),
		ambito: z.enum(["interno-om", "comaer", "externo"]).nullish(),
		prioridade: z.enum(["rotina", "urgente"]).nullish(),
		precedencia: z.enum(["superior", "igual", "inferior"]).nullish(),
		remetente: z.object({ cargo: z.string(), genero: GeneroSchema.nullish() }).nullish(),
		destinatarios: z.array(z.object({ cargo: z.string(), genero: GeneroSchema.nullish(), via: z.string().nullish() })).nullish(),
		enderecamento: z
			.object({
				tratamento: z.enum(["excelencia", "senhoria"]).nullish(),
				genero: GeneroSchema.nullish(),
				nome: z.string().nullish(),
				cargo: z.string().nullish(),
				linhasEndereco: z.array(z.string()).nullish(),
			})
			.nullish(),
		vocativo: z.string().nullish(),
		decisao: z.enum(["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"]).nullish(),
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
		especie: saida.especie ?? undefined,
		ambito: saida.ambito ?? undefined,
		prioridade: saida.prioridade ?? undefined,
		precedencia: saida.precedencia ?? undefined,
		remetente: semPlaceholder(saida.remetente?.cargo)
			? { cargo: semPlaceholder(saida.remetente?.cargo) as string, genero: saida.remetente?.genero ?? undefined }
			: undefined,
		destinatarios: (saida.destinatarios ?? undefined)?.flatMap((d) => {
			const cargo = semPlaceholder(d.cargo)
			return cargo ? [{ cargo, genero: d.genero ?? undefined, via: semPlaceholder(d.via) }] : []
		}),
		enderecamento: saida.enderecamento
			? {
					tratamento: saida.enderecamento.tratamento ?? undefined,
					genero: saida.enderecamento.genero ?? undefined,
					nome: semPlaceholder(saida.enderecamento.nome),
					cargo: semPlaceholder(saida.enderecamento.cargo),
					linhasEndereco: (saida.enderecamento.linhasEndereco ?? undefined)?.map(semPlaceholder).filter((l): l is string => l !== undefined),
				}
			: undefined,
		vocativo: semPlaceholder(saida.vocativo),
		decisao: saida.decisao ?? undefined,
		assunto: semPlaceholder(saida.assunto),
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
