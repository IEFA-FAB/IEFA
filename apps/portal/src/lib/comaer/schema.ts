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
import type { DocumentInput } from "./types"

const GeneroSchema = z.enum(["m", "f"])

const ParteSchema = z.object({
	position: z.string(),
	gender: GeneroSchema.optional(),
	via: z.string().optional(),
})

const ParagrafoSchema = z.object({
	text: z.string(),
	items: z
		.array(
			z.object({
				text: z.string(),
				alineas: z
					.array(
						z.object({
							text: z.string(),
							subalineas: z.array(z.object({ text: z.string() })).optional(),
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
export const DocumentPayloadSchema = z.object({
	kind: z.string(),
	scope: z.enum(["interno-om", "comaer", "externo"]),
	classification: z.enum(["ostensivo", "reservado", "secreto", "ultrassecreto"]),
	priority: z.enum(["rotina", "urgente"]).optional(),
	om: z.object({
		name: z.string(),
		acronym: z.string().optional(),
		sector: z.string().optional(),
		address: z.string().optional(),
		phone: z.string().optional(),
		email: z.string().optional(),
	}),
	numbering: z.object({
		sequence: z.number().nullable(),
		sector: z.string().optional(),
		organizationNumber: z.string().optional(),
		year: z.number().optional(),
	}),
	nup: z.string().optional(),
	city: z.string(),
	date: z.iso.datetime(),
	sender: ParteSchema.optional(),
	recipients: z.array(ParteSchema),
	distribution: z.enum(["circular", "difral"]).optional(),
	subject: z.string().optional(),
	references: z.array(z.string()).optional(),
	annexes: z.array(z.string()).optional(),
	vocativo: z.string().optional(),
	addressing: z
		.object({
			formOfAddress: z.enum(["excelencia", "senhoria"]),
			gender: GeneroSchema,
			name: z.string().optional(),
			position: z.string().optional(),
			addressLines: z.array(z.string()).optional(),
		})
		.optional(),
	precedence: z.enum(["superior", "igual", "inferior"]).optional(),
	paragraphs: z.array(ParagrafoSchema),
	signer: z.object({
		name: z.string(),
		rank: z.string().optional(),
		quadro: z.string().optional(),
		position: z.string().optional(),
		om: z.string().optional(),
		noImp: z.object({ name: z.string(), rank: z.string().optional(), quadro: z.string().optional() }).optional(),
		byOrderOf: z.string().optional(),
	}),
	process: z.object({ nup: z.string().optional(), reference: z.string().optional() }).optional(),
	despachoOrder: z.number().optional(),
	decision: z.enum(["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"]).optional(),
})

export type DocumentPayload = z.infer<typeof DocumentPayloadSchema>

export function toPayload(input: DocumentInput): DocumentPayload {
	return DocumentPayloadSchema.parse({ ...input, date: input.date.toISOString() })
}

export function fromPayload(payload: unknown): DocumentInput {
	const parsed = DocumentPayloadSchema.parse(payload)
	return { ...parsed, date: new Date(parsed.date) }
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

function withoutPlaceholder(value: string | null | undefined): string | undefined {
	if (value == null) return undefined
	const limpo = value.trim()
	if (limpo === "" || PLACEHOLDERS.test(limpo)) return undefined
	return limpo
}

export const AiProposalSchema = z
	.object({
		kind: z.string().nullish(),
		scope: z.enum(["interno-om", "comaer", "externo"]).nullish(),
		priority: z.enum(["rotina", "urgente"]).nullish(),
		precedence: z.enum(["superior", "igual", "inferior"]).nullish(),
		sender: z.object({ position: z.string(), gender: GeneroSchema.nullish() }).nullish(),
		recipients: z.array(z.object({ position: z.string(), gender: GeneroSchema.nullish(), via: z.string().nullish() })).nullish(),
		addressing: z
			.object({
				formOfAddress: z.enum(["excelencia", "senhoria"]).nullish(),
				gender: GeneroSchema.nullish(),
				name: z.string().nullish(),
				position: z.string().nullish(),
				addressLines: z.array(z.string()).nullish(),
			})
			.nullish(),
		vocativo: z.string().nullish(),
		decision: z.enum(["DEFERIDO", "DEFERIDA", "INDEFERIDO", "INDEFERIDA", "ARQUIVE-SE"]).nullish(),
		subject: z.string().nullish(),
		paragraphs: z
			.array(
				z.object({
					text: z.string(),
					items: z
						.array(
							z.object({
								text: z.string(),
								alineas: z
									.array(
										z.object({
											text: z.string(),
											subalineas: z.array(z.object({ text: z.string() })).nullish(),
										})
									)
									.nullish(),
							})
						)
						.nullish(),
				})
			)
			.min(1),
		references: z.array(z.string()).nullish(),
		annexes: z.array(z.string()).nullish(),
	})
	.transform((output) => ({
		kind: output.kind ?? undefined,
		scope: output.scope ?? undefined,
		priority: output.priority ?? undefined,
		precedence: output.precedence ?? undefined,
		sender: withoutPlaceholder(output.sender?.position)
			? { position: withoutPlaceholder(output.sender?.position) as string, gender: output.sender?.gender ?? undefined }
			: undefined,
		recipients: (output.recipients ?? undefined)?.flatMap((d) => {
			const position = withoutPlaceholder(d.position)
			return position ? [{ position, gender: d.gender ?? undefined, via: withoutPlaceholder(d.via) }] : []
		}),
		addressing: output.addressing
			? {
					formOfAddress: output.addressing.formOfAddress ?? undefined,
					gender: output.addressing.gender ?? undefined,
					name: withoutPlaceholder(output.addressing.name),
					position: withoutPlaceholder(output.addressing.position),
					addressLines: (output.addressing.addressLines ?? undefined)?.map(withoutPlaceholder).filter((l): l is string => l !== undefined),
				}
			: undefined,
		vocativo: withoutPlaceholder(output.vocativo),
		decision: output.decision ?? undefined,
		subject: withoutPlaceholder(output.subject),
		references: output.references ?? undefined,
		annexes: output.annexes ?? undefined,
		paragraphs: output.paragraphs.map((p) => ({
			text: p.text,
			items: (p.items ?? undefined)?.map((i) => ({
				text: i.text,
				alineas: (i.alineas ?? undefined)?.map((a) => ({
					text: a.text,
					subalineas: (a.subalineas ?? undefined)?.map((s) => ({ text: s.text })),
				})),
			})),
		})),
	}))

export type AiProposal = z.infer<typeof AiProposalSchema>
