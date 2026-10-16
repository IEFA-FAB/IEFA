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

import { reconcileKindAndScope, resolveKind } from "../catalog"
import { renderDivisions } from "../format"
import { findForbiddenTreatmentInParagraph, forbiddenTreatmentMessage } from "../treatment"
import type { DocumentInput, Paragraph } from "../types"

export type PatchName = "set_form" | "set_parties" | "set_ementa" | "write_body" | "replace_paragraph" | "insert_paragraph" | "remove_paragraph"

export interface PatchResult {
	document: DocumentInput
	/** Frase curta que volta ao modelo — é como ele sabe o que de fato entrou. */
	summary: string
	/** Blocos afetados, para o preview destacar o que mudou no turno. */
	touched: string[]
}

/**
 * Numeração que a folha vai imprimir, no formato "1; 2 (2.1, 2.2); 3 (3.1 [a), b)])".
 *
 * Volta ao modelo junto do resumo de toda mudança de texto: a numeração é calculada pela
 * montagem, não escrita por ele, e sem isto ele remetia a "alíneas a e b" num texto que
 * imprimia os itens 3.1 a 3.3 — ou mantinha "item 3.1" depois de inserir um parágrafo antes.
 */
export function printedOutline(document: DocumentInput): string {
	const lines = renderDivisions(document.paragraphs, resolveKind(document.kind).numberedParagraphs)
	const paragraphs: { label: string; items: { label: string; alineas: string[] }[] }[] = []
	for (const line of lines) {
		const target = line.edit?.target
		const label = line.text.split(" ")[0]
		if (target?.field === "paragraph") paragraphs.push({ label: line.marker ?? "(sem número)", items: [] })
		else if (target?.field === "item") paragraphs.at(-1)?.items.push({ label, alineas: [] })
		else if (target?.field === "alinea") paragraphs.at(-1)?.items.at(-1)?.alineas.push(label)
	}
	return paragraphs
		.map((p) => {
			const items = p.items.map((i) => (i.alineas.length > 0 ? `${i.label} [${i.alineas.join(", ")}]` : i.label))
			return items.length > 0 ? `${p.label.replace(/\.$/, "")} (${items.join(", ")})` : p.label.replace(/\.$/, "")
		})
		.join("; ")
}

function textSummary(document: DocumentInput, change: string): string {
	return `${change} Numeração impressa agora: ${printedOutline(document)}.`
}

/** Erro de remendo: o modelo lê a mensagem e corrige na chamada seguinte. */
export class PatchError extends Error {}

/**
 * Entrada de lista (parágrafo, item ou alínea) com `text` string. `null` dentro de array chega
 * inteiro (a poda do boundary não desce em array): sem esta checagem, ler `.text` de `null`
 * lançava `TypeError`, que não é erro de remendo e o modelo não sabia corrigir.
 */
function readTextEntry<T extends { text: string }>(value: unknown, message: string): T {
	if (typeof value !== "object" || value === null || typeof (value as { text?: unknown }).text !== "string") throw new PatchError(message)
	return value as T
}

function asParagraphs(value: unknown): Paragraph[] {
	if (!Array.isArray(value)) throw new PatchError("O campo `paragraphs` precisa ser uma lista de parágrafos.")
	return value.map((p) => {
		const item = readTextEntry<{ text: string; items?: unknown }>(p, "Cada parágrafo precisa de `text`.")
		return {
			text: item.text,
			items: Array.isArray(item.items)
				? item.items.map((i) => {
						const sub = readTextEntry<{ text: string; alineas?: unknown }>(i, "Cada item precisa de `text`.")
						return {
							text: sub.text,
							alineas: Array.isArray(sub.alineas)
								? sub.alineas.map((a) => ({ text: readTextEntry<{ text: string }>(a, "Cada alínea precisa de `text`.").text }))
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

/**
 * Tratamento proibido volta como erro de tool — o modelo lê a mensagem e reescreve.
 *
 * Recusar a escrita inteira, e não limpar a expressão em silêncio, é deliberado: trocar
 * "Vossa Senhoria" por "Senhor" no meio da frase produz concordância quebrada ("solicito a
 * Senhor que"), e o modelo nunca saberia que errou.
 */
function assertTreatment(document: DocumentInput, paragraphs: Paragraph[]): void {
	for (const paragraph of paragraphs) {
		const found = findForbiddenTreatmentInParagraph(paragraph, document.scope)
		if (found) throw new PatchError(forbiddenTreatmentMessage(found))
	}
}

type PatchHandler = (document: DocumentInput, args: Record<string, unknown>) => PatchResult

function applySetForm(document: DocumentInput, args: Record<string, unknown>): PatchResult {
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
		precedence: (args.precedence as DocumentInput["precedence"]) ?? document.precedence,
		decision: (args.decision as DocumentInput["decision"]) ?? document.decision,
	}
	// Trocar a espécie pode ligar ou desligar a numeração dos parágrafos (carta × ofício).
	const form = `Forma: ${kind}, âmbito ${scope}.`
	const hasText = next.paragraphs.some((p) => p.text.trim() !== "")
	return { document: next, summary: hasText ? textSummary(next, form) : form, touched: ["epigrafe", "numeracao", "fecho"] }
}

function asGender(value: unknown): "m" | "f" | undefined {
	return value === "m" || value === "f" ? value : undefined
}

/**
 * Campo opcional de texto: ausente fica `undefined`; presente precisa ser string. O cast direto
 * gravava no documento o que viesse (número, objeto), e o documento parava de serializar.
 */
function readOptionalString(value: unknown, field: string): string | undefined {
	if (value === undefined) return undefined
	if (typeof value !== "string") throw new PatchError(`O campo \`${field}\` precisa ser texto.`)
	return value
}

/**
 * Lista de textos (referências, anexos, linhas de endereço). `null` de dentro de array escapa da
 * poda do boundary, então cada entrada é conferida: `[null]` ou texto solto no lugar da lista
 * entravam no documento como vieram.
 */
function readOptionalStringList(value: unknown, field: string): string[] | undefined {
	if (value === undefined) return undefined
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw new PatchError(`O campo \`${field}\` precisa ser uma lista de textos.`)
	}
	return value as string[]
}

/** Valor de enum: ausente fica `undefined`; fora da lista é erro de remendo. */
function readOptionalEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
	if (value === undefined) return undefined
	if (!allowed.includes(value as T)) throw new PatchError(`O campo \`${field}\` aceita só: ${allowed.join(", ")}.`)
	return value as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

// `null` de dentro de array chega INTEIRO: a poda do boundary não desce em array, de
// propósito (posição em array é significativa). Copiar `gender`/`via` como vieram
// gravava `null` num campo `.optional()` — o documento parava de serializar, o salvar
// falhava, o rascunho local parava em silêncio e todo turno seguinte ia sem contexto.
// Destinatário que não é objeto (`[null]`) é erro de remendo: ler `.position` dele lançava
// TypeError, que o modelo não sabe corrigir.
function parseRecipients(raw: unknown): DocumentInput["recipients"] | undefined {
	if (raw === undefined) return undefined
	if (!Array.isArray(raw)) throw new PatchError("O campo `recipients` precisa ser uma lista de destinatários.")
	if (!raw.every(isPlainObject)) throw new PatchError("Cada destinatário precisa ser um objeto com `position`.")
	return raw
		.filter((r) => typeof r.position === "string" && r.position.trim() !== "")
		.map((r) => ({
			position: r.position as string,
			gender: asGender(r.gender),
			via: typeof r.via === "string" && r.via.trim() !== "" ? r.via : undefined,
		}))
}

function parseSender(raw: unknown): { position: string | undefined; gender: "m" | "f" | undefined } | undefined {
	const rawSender = raw as { position?: unknown; gender?: unknown } | null | undefined
	return rawSender ? { position: typeof rawSender.position === "string" ? rawSender.position : undefined, gender: asGender(rawSender.gender) } : undefined
}

type AddressingPatch = Partial<NonNullable<DocumentInput["addressing"]>>

/** Endereçamento do modelo, campo a campo conferido: o que vier fora do tipo é erro de remendo. */
function parseAddressing(raw: unknown): AddressingPatch | undefined {
	if (raw === undefined) return undefined
	if (!isPlainObject(raw)) throw new PatchError("O campo `addressing` precisa ser um objeto.")
	return {
		formOfAddress: readOptionalEnum(raw.formOfAddress, ["excelencia", "senhoria"] as const, "addressing.formOfAddress"),
		gender: readOptionalEnum(raw.gender, ["m", "f"] as const, "addressing.gender"),
		name: readOptionalString(raw.name, "addressing.name"),
		position: readOptionalString(raw.position, "addressing.position"),
		addressLines: readOptionalStringList(raw.addressLines, "addressing.addressLines"),
	}
}

/** Campo a campo: o que veio do modelo vence, o que não veio fica como estava. */
function mergeAddressing(addressing: AddressingPatch | undefined, current: DocumentInput["addressing"]): DocumentInput["addressing"] {
	if (!addressing) return current
	return {
		formOfAddress: addressing.formOfAddress ?? current?.formOfAddress ?? "senhoria",
		gender: addressing.gender ?? current?.gender ?? "m",
		name: addressing.name ?? current?.name,
		position: addressing.position ?? current?.position,
		addressLines: addressing.addressLines ?? current?.addressLines,
	}
}

function applySetParties(document: DocumentInput, args: Record<string, unknown>): PatchResult {
	const recipients = parseRecipients(args.recipients)
	const sender = parseSender(args.sender)
	const addressing = parseAddressing(args.addressing)
	const next: DocumentInput = {
		...document,
		sender: sender?.position?.trim() ? { position: sender.position, gender: sender.gender ?? document.sender?.gender } : document.sender,
		recipients: recipients?.length ? recipients : document.recipients,
		addressing: mergeAddressing(addressing, document.addressing),
		vocativo: readOptionalString(args.vocativo, "vocativo") ?? document.vocativo,
		distribution: readOptionalEnum(args.distribution, ["circular", "difral"] as const, "distribution") ?? document.distribution,
	}
	return { document: next, summary: "Partes atualizadas.", touched: ["preambulo", "enderecamento", "vocativo"] }
}

function applySetEmenta(document: DocumentInput, args: Record<string, unknown>): PatchResult {
	const next: DocumentInput = {
		...document,
		subject: readOptionalString(args.subject, "subject") ?? document.subject,
		references: readOptionalStringList(args.references, "references") ?? document.references,
		annexes: readOptionalStringList(args.annexes, "annexes") ?? document.annexes,
	}
	return { document: next, summary: "Ementa atualizada.", touched: ["ementa"] }
}

function applyWriteBody(document: DocumentInput, args: Record<string, unknown>): PatchResult {
	const paragraphs = asParagraphs(args.paragraphs)
	if (paragraphs.length === 0) throw new PatchError("O texto precisa de ao menos um parágrafo.")
	assertTreatment(document, paragraphs)
	const next = { ...document, paragraphs }
	return { document: next, summary: textSummary(next, `Texto reescrito com ${paragraphs.length} parágrafo(s).`), touched: ["texto"] }
}

function applyReplaceParagraph(document: DocumentInput, args: Record<string, unknown>): PatchResult {
	const index = paragraphIndex(document, args.number)
	const [replacement] = asParagraphs([{ text: args.text, items: args.items }])
	assertTreatment(document, [replacement])
	const paragraphs = document.paragraphs.map((p, i) => (i === index ? replacement : p))
	const next = { ...document, paragraphs }
	return { document: next, summary: textSummary(next, `Parágrafo ${index + 1} substituído.`), touched: ["texto"] }
}

function applyInsertParagraph(document: DocumentInput, args: Record<string, unknown>): PatchResult {
	const index = paragraphIndex(document, args.number, true)
	const [added] = asParagraphs([{ text: args.text, items: args.items }])
	assertTreatment(document, [added])
	const paragraphs = [...document.paragraphs.slice(0, index), added, ...document.paragraphs.slice(index)]
	const next = { ...document, paragraphs }
	return { document: next, summary: textSummary(next, `Parágrafo inserido na posição ${index + 1}.`), touched: ["texto"] }
}

function applyRemoveParagraph(document: DocumentInput, args: Record<string, unknown>): PatchResult {
	const index = paragraphIndex(document, args.number)
	if (document.paragraphs.length === 1) throw new PatchError("O documento ficaria sem texto; substitua o parágrafo em vez de removê-lo.")
	const paragraphs = document.paragraphs.filter((_, i) => i !== index)
	const next = { ...document, paragraphs }
	return { document: next, summary: textSummary(next, `Parágrafo ${index + 1} removido.`), touched: ["texto"] }
}

const PATCH_HANDLERS: Record<PatchName, PatchHandler> = {
	set_form: applySetForm,
	set_parties: applySetParties,
	set_ementa: applySetEmenta,
	write_body: applyWriteBody,
	replace_paragraph: applyReplaceParagraph,
	insert_paragraph: applyInsertParagraph,
	remove_paragraph: applyRemoveParagraph,
}

function isPatchName(name: string): name is PatchName {
	// `Object.hasOwn`: nome vindo do modelo não pode alcançar `Object.prototype` (`toString`).
	return Object.hasOwn(PATCH_HANDLERS, name)
}

export function applyPatch(document: DocumentInput, name: string, args: Record<string, unknown>): PatchResult {
	if (!isPatchName(name)) throw new PatchError(`Remendo desconhecido: ${name}`)
	return PATCH_HANDLERS[name](document, args)
}
