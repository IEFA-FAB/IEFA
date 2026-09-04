/**
 * @module comaer/tools/patch
 * Remendos que a conversa aplica ao documento.
 *
 * Puro e compartilhado entre servidor e cliente de propósito. O servidor usa para VALIDAR
 * o que o modelo pediu (índice de parágrafo que não existe, espécie fora do catálogo) e o
 * cliente usa para APLICAR. Se fossem duas implementações, a validação passaria a aprovar
 * o que a aplicação não faz — e o documento na tela deixaria de ser o documento que o
 * modelo acha que escreveu.
 *
 * Nenhum remendo toca a identidade do documento: numeração, NUP, OM, localidade, data,
 * ordem do despacho e signatário não têm tool. É a mesma fronteira da geração de um tiro.
 */

import { reconcileKindAndScope } from "../catalog"
import type { DocumentInput, Paragraph } from "../types"

export type PatchName = "set_form" | "set_parties" | "set_ementa" | "write_body" | "replace_paragraph" | "insert_paragraph" | "remove_paragraph"

export interface PatchResult {
	document: DocumentInput
	/** Frase curta que volta ao modelo — é como ele sabe o que de fato entrou. */
	summary: string
	/** Blocos afetados, para o preview destacar o que mudou no turno. */
	touched: string[]
}

/** Erro de remendo: o modelo lê a mensagem e corrige na chamada seguinte. */
export class PatchError extends Error {}

function asParagraphs(value: unknown): Paragraph[] {
	if (!Array.isArray(value)) throw new PatchError("O campo `paragraphs` precisa ser uma lista de parágrafos.")
	return value.map((p) => {
		const item = p as { text?: unknown; items?: unknown }
		if (typeof item.text !== "string") throw new PatchError("Cada parágrafo precisa de `text`.")
		return {
			text: item.text,
			items: Array.isArray(item.items)
				? item.items.map((i) => {
						const sub = i as { text?: unknown; alineas?: unknown }
						if (typeof sub.text !== "string") throw new PatchError("Cada item precisa de `text`.")
						return {
							text: sub.text,
							alineas: Array.isArray(sub.alineas)
								? sub.alineas.map((a) => {
										const alinea = a as { text?: unknown }
										if (typeof alinea.text !== "string") throw new PatchError("Cada alínea precisa de `text`.")
										return { text: alinea.text }
									})
								: undefined,
						}
					})
				: undefined,
		}
	})
}

/** Índice de parágrafo é 1-based na conversa: é o número que o usuário vê no papel. */
function paragraphIndex(document: DocumentInput, raw: unknown, allowEnd = false): number {
	const number = typeof raw === "number" ? raw : Number.NaN
	const limit = document.paragraphs.length + (allowEnd ? 1 : 0)
	if (!Number.isInteger(number) || number < 1 || number > limit) {
		throw new PatchError(`Parágrafo ${String(raw)} não existe. O documento tem ${document.paragraphs.length} parágrafo(s).`)
	}
	return number - 1
}

export function applyPatch(document: DocumentInput, name: string, args: Record<string, unknown>): PatchResult {
	switch (name) {
		case "set_form": {
			// Espécie e âmbito viajam juntos: o par não é livre e quem concilia é o catálogo.
			const { kind, scope } = reconcileKindAndScope(
				{ kind: document.kind, scope: document.scope },
				{ kind: args.kind as string | undefined, scope: args.scope as DocumentInput["scope"] | undefined }
			)
			const next: DocumentInput = {
				...document,
				kind,
				scope,
				classification: (args.classification as DocumentInput["classification"]) ?? document.classification,
				priority: (args.priority as DocumentInput["priority"]) ?? document.priority,
				precedence: (args.precedence as DocumentInput["precedence"]) ?? document.precedence,
				decision: (args.decision as DocumentInput["decision"]) ?? document.decision,
			}
			return { document: next, summary: `Forma: ${kind}, âmbito ${scope}.`, touched: ["epigrafe", "numeracao", "fecho"] }
		}

		case "set_parties": {
			const asGender = (value: unknown): "m" | "f" | undefined => (value === "m" || value === "f" ? value : undefined)
			// `null` de dentro de array chega INTEIRO: a poda do boundary não desce em array, de
			// propósito (posição em array é significativa). Copiar `gender`/`via` como vieram
			// gravava `null` num campo `.optional()` — o documento parava de serializar, o salvar
			// falhava, o rascunho local parava em silêncio e todo turno seguinte ia sem contexto.
			const recipients = Array.isArray(args.recipients)
				? (args.recipients as { position?: unknown; gender?: unknown; via?: unknown }[])
						.filter((r) => typeof r.position === "string" && r.position.trim() !== "")
						.map((r) => ({
							position: r.position as string,
							gender: asGender(r.gender),
							via: typeof r.via === "string" && r.via.trim() !== "" ? r.via : undefined,
						}))
				: undefined
			const rawSender = args.sender as { position?: unknown; gender?: unknown } | null | undefined
			const sender = rawSender
				? { position: typeof rawSender.position === "string" ? rawSender.position : undefined, gender: asGender(rawSender.gender) }
				: undefined
			const addressing = args.addressing as DocumentInput["addressing"] | undefined
			const next: DocumentInput = {
				...document,
				sender: sender?.position?.trim() ? { position: sender.position, gender: sender.gender ?? document.sender?.gender } : document.sender,
				recipients: recipients?.length ? recipients : document.recipients,
				addressing: addressing
					? {
							formOfAddress: addressing.formOfAddress ?? document.addressing?.formOfAddress ?? "senhoria",
							gender: addressing.gender ?? document.addressing?.gender ?? "m",
							name: addressing.name ?? document.addressing?.name,
							position: addressing.position ?? document.addressing?.position,
							addressLines: addressing.addressLines ?? document.addressing?.addressLines,
						}
					: document.addressing,
				vocativo: (args.vocativo as string | undefined) ?? document.vocativo,
				distribution: (args.distribution as DocumentInput["distribution"]) ?? document.distribution,
			}
			return { document: next, summary: "Partes atualizadas.", touched: ["preambulo", "enderecamento", "vocativo"] }
		}

		case "set_ementa": {
			const next: DocumentInput = {
				...document,
				subject: (args.subject as string | undefined) ?? document.subject,
				references: (args.references as string[] | undefined) ?? document.references,
				annexes: (args.annexes as string[] | undefined) ?? document.annexes,
			}
			return { document: next, summary: "Ementa atualizada.", touched: ["ementa"] }
		}

		case "write_body": {
			const paragraphs = asParagraphs(args.paragraphs)
			if (paragraphs.length === 0) throw new PatchError("O texto precisa de ao menos um parágrafo.")
			return { document: { ...document, paragraphs }, summary: `Texto reescrito com ${paragraphs.length} parágrafo(s).`, touched: ["texto"] }
		}

		case "replace_paragraph": {
			const index = paragraphIndex(document, args.number)
			const [replacement] = asParagraphs([{ text: args.text, items: args.items }])
			const paragraphs = document.paragraphs.map((p, i) => (i === index ? replacement : p))
			return { document: { ...document, paragraphs }, summary: `Parágrafo ${index + 1} substituído.`, touched: ["texto"] }
		}

		case "insert_paragraph": {
			const index = paragraphIndex(document, args.number, true)
			const [added] = asParagraphs([{ text: args.text, items: args.items }])
			const paragraphs = [...document.paragraphs.slice(0, index), added, ...document.paragraphs.slice(index)]
			return { document: { ...document, paragraphs }, summary: `Parágrafo inserido na posição ${index + 1}.`, touched: ["texto"] }
		}

		case "remove_paragraph": {
			const index = paragraphIndex(document, args.number)
			if (document.paragraphs.length === 1) throw new PatchError("O documento ficaria sem texto; substitua o parágrafo em vez de removê-lo.")
			const paragraphs = document.paragraphs.filter((_, i) => i !== index)
			return { document: { ...document, paragraphs }, summary: `Parágrafo ${index + 1} removido.`, touched: ["texto"] }
		}

		default:
			throw new PatchError(`Remendo desconhecido: ${name}`)
	}
}
