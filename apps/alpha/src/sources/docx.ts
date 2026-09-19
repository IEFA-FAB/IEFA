/**
 * Leitor de `.docx` (OOXML) sob medida para os modelos da AGU.
 *
 * Por que não `mammoth`: os modelos codificam a hierarquia em **estilos de
 * parágrafo próprios** (`Nivel01`, `Nvel02`, `Nvel2-Opcional`, `Nvel1-SemNumeracao`)
 * e as notas explicativas em **comentários do Word** (`word/comments.xml`,
 * ancorados por `w:commentRangeStart`). Converter para HTML antes de estruturar
 * joga fora exatamente esses dois sinais — que são o motivo de ler o `.docx`.
 *
 * O scanner é deliberadamente mínimo: `w:p` não aninha em OOXML, então varrer as
 * tags em ordem de documento é previsível. Tudo que ele produz é validado contra
 * os modelos reais em `__fixtures__/`.
 *
 * ## Entrada hostil
 *
 * O mesmo leitor serve ao `.docx` que o USUÁRIO envia ao α, então nada aqui pode
 * custar mais do que o tamanho da entrada:
 *
 * - **Zip bomb.** O `unzipSync` do fflate aloca o buffer de saída pelo tamanho
 *   descompactado DECLARADO no diretório central — um arquivo de 25 KB que declara
 *   4 GB derruba o processo antes de descompactar um byte. O filtro recusa entrada
 *   acima de {@link MAX_DOCX_XML_BYTES} e conta as entradas, porque o laço do fflate
 *   confia na contagem declarada (zip64 aceita bilhões).
 * - **Tempo quadrático.** A versão anterior casava `<w:p …>[\s\S]*?</w:p>` com
 *   expressão regular: cada `<w:p>` sem fechamento varria o resto do arquivo, e mil
 *   deles num XML de megabytes travavam o event loop por minutos. O scanner abaixo é
 *   um laço de `indexOf` que nunca volta atrás.
 */

import { unzipSync } from "fflate"
import { cleanText } from "../lib/text.ts"

export interface DocxParagraph {
	/** Nome do estilo declarado em `w:pStyle` (ex.: `Nvel2-Opcional`). */
	style: string | null
	text: string
	/** IDs dos comentários que começam neste parágrafo. */
	commentIds: string[]
}

export interface DocxComment {
	id: string
	author: string | null
	text: string
}

export interface DocxDocument {
	paragraphs: DocxParagraph[]
	comments: Map<string, DocxComment>
}

/**
 * Teto do XML descompactado, somando `document.xml` e `comments.xml`.
 *
 * Um ETP/TR real tem poucos megabytes de XML — o peso do `.docx` são as imagens,
 * que não são extraídas. O teto é folgado para o documento legítimo e pequeno para
 * a memória do processo.
 */
export const MAX_DOCX_XML_BYTES = 32 * 1024 * 1024

/** Teto de entradas no zip. Um `.docx` do Word tem dezenas; o fflate itera a contagem DECLARADA. */
export const MAX_DOCX_ENTRIES = 10_000

const WANTED_ENTRIES = new Set(["word/document.xml", "word/comments.xml"])

const XML_ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
}

/** Maior code point válido — acima disso `String.fromCodePoint` lança `RangeError`. */
const MAX_CODE_POINT = 0x10ffff

function decodeXml(value: string): string {
	return value
		.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity)
		.replace(/&#(\d{1,7});/g, (entity, code) => (Number(code) <= MAX_CODE_POINT ? String.fromCodePoint(Number(code)) : entity))
}

interface XmlTag {
	/** Nome qualificado, ex.: `w:p`, `w:pStyle`. */
	name: string
	/** Conteúdo entre `<` e `>`, sem os dois. */
	raw: string
	closing: boolean
	selfClosing: boolean
	/** Posição do `<`. */
	start: number
	/** Posição logo depois do `>`. */
	end: number
}

function isNameTerminator(char: string): boolean {
	return char === " " || char === "\t" || char === "\n" || char === "\r" || char === "/"
}

/**
 * Percorre as tags do XML em ordem, em tempo linear.
 *
 * Cada `<` é casado com o PRIMEIRO `>` seguinte — a mesma leitura que `[^>]*` fazia —,
 * e o cursor só anda para a frente. `<` sem `>` depois encerra a varredura: não há
 * mais tag possível no resto do texto.
 */
function forEachTag(xml: string, visit: (tag: XmlTag) => void): void {
	let cursor = 0
	while (cursor < xml.length) {
		const start = xml.indexOf("<", cursor)
		if (start === -1) return
		const close = xml.indexOf(">", start + 1)
		if (close === -1) return

		const raw = xml.slice(start + 1, close)
		const closing = raw.startsWith("/")
		const selfClosing = !closing && raw.endsWith("/")
		const nameStart = closing ? 1 : 0
		let nameEnd = nameStart
		while (nameEnd < raw.length && !isNameTerminator(raw[nameEnd])) nameEnd++

		visit({ name: raw.slice(nameStart, nameEnd), raw, closing, selfClosing, start, end: close + 1 })
		cursor = close + 1
	}
}

/** Valor de um atributo (`w:val="…"`) no conteúdo da tag, sem decodificar — como a leitura anterior. */
function attribute(raw: string, name: string): string | null {
	const needle = `${name}="`
	let from = 0
	while (from < raw.length) {
		const index = raw.indexOf(needle, from)
		if (index === -1) return null
		// O atributo tem de começar depois de espaço: `w:id` não pode casar dentro de `xw:id`.
		const before = raw[index - 1]
		if (before === " " || before === "\t" || before === "\n" || before === "\r") {
			const valueStart = index + needle.length
			const valueEnd = raw.indexOf('"', valueStart)
			return valueEnd === -1 ? null : raw.slice(valueStart, valueEnd)
		}
		from = index + needle.length
	}
	return null
}

/**
 * Acumula o texto dos `w:t` de um trecho (parágrafo ou comentário).
 *
 * `<w:tab/>` e `<w:br/>` ficam FORA do `w:t`, e a leitura anterior só aproveitava o que
 * estava dentro dele — a troca deles por espaço nunca chegava ao texto. O acumulador
 * mantém essa saída, para não mudar `title_norm` do corpus já ingerido.
 */
class TextCollector {
	private parts: string[] = []
	private textStart = -1

	/** Trata a tag se ela é de texto; devolve `true` se tratou. */
	visit(tag: XmlTag, xml: string): boolean {
		if (tag.name !== "w:t") return false
		if (tag.closing) {
			if (this.textStart !== -1) this.parts.push(decodeXml(xml.slice(this.textStart, tag.start)))
			this.textStart = -1
		} else if (!tag.selfClosing && this.textStart === -1) {
			this.textStart = tag.end
		}
		return true
	}

	finish(): string {
		const text = cleanText(this.parts.join(""))
		this.parts = []
		this.textStart = -1
		return text
	}
}

function parseParagraphs(xml: string): DocxParagraph[] {
	const paragraphs: DocxParagraph[] = []
	const collector = new TextCollector()
	let open = false
	let style: string | null = null
	let commentIds: string[] = []

	forEachTag(xml, (tag) => {
		if (tag.name === "w:p") {
			if (tag.closing) {
				if (!open) return
				paragraphs.push({ style, text: collector.finish(), commentIds })
				open = false
			} else if (tag.selfClosing) {
				// `<w:p/>`: parágrafo vazio. Dentro de um parágrafo aberto não abre outro — `w:p` não aninha.
				if (!open) paragraphs.push({ style: null, text: "", commentIds: [] })
			} else if (!open) {
				open = true
				style = null
				commentIds = []
				collector.finish()
			}
			return
		}
		if (!open) return
		if (collector.visit(tag, xml) || tag.closing) return
		if (tag.name === "w:pStyle") {
			if (style === null) style = attribute(tag.raw, "w:val")
		} else if (tag.name === "w:commentRangeStart") {
			const id = attribute(tag.raw, "w:id")
			if (id !== null) commentIds.push(id)
		}
	})

	// Parágrafo aberto e nunca fechado fica de fora, como na leitura por expressão regular.
	return paragraphs
}

function parseComments(xml: string | undefined): Map<string, DocxComment> {
	const comments = new Map<string, DocxComment>()
	if (!xml) return comments

	const collector = new TextCollector()
	let current: { id: string | null; author: string | null } | null = null

	forEachTag(xml, (tag) => {
		if (tag.name === "w:comment") {
			if (tag.closing) {
				if (!current) return
				const text = collector.finish()
				if (current.id) comments.set(current.id, { id: current.id, author: current.author, text })
				current = null
			} else if (!tag.selfClosing && !current) {
				current = { id: attribute(tag.raw, "w:id"), author: attribute(tag.raw, "w:author") }
				collector.finish()
			}
			return
		}
		if (current) collector.visit(tag, xml)
	})

	return comments
}

/**
 * Descompacta só as duas entradas lidas, recusando a declaração que estouraria a memória.
 *
 * O `size`/`originalSize` que o filtro recebe é o DECLARADO, e é por ele que o fflate
 * aloca — então conferir aqui é conferir antes da alocação. O `inflateSync` do fflate
 * não cresce o buffer quando o recebe pronto: um fluxo que descompacta mais que o
 * declarado é truncado, nunca realocado.
 */
function unzipDocxEntries(bytes: Uint8Array): Record<string, Uint8Array> {
	let entries = 0
	let declaredBytes = 0

	return unzipSync(bytes, {
		filter: (file) => {
			entries += 1
			if (entries > MAX_DOCX_ENTRIES) throw new Error("docx inválido: entradas demais no arquivo")
			if (!WANTED_ENTRIES.has(file.name)) return false

			declaredBytes += Math.max(file.size, file.originalSize)
			if (declaredBytes > MAX_DOCX_XML_BYTES) throw new Error("docx recusado: conteúdo descompactado acima do limite")
			return true
		},
	})
}

export function parseDocx(bytes: Uint8Array): DocxDocument {
	const entries = unzipDocxEntries(bytes)

	const documentXml = entries["word/document.xml"]
	if (!documentXml) throw new Error("docx inválido: word/document.xml ausente")

	const decoder = new TextDecoder()
	const body = decoder.decode(documentXml)
	const comments = parseComments(entries["word/comments.xml"] ? decoder.decode(entries["word/comments.xml"]) : undefined)

	return { paragraphs: parseParagraphs(body), comments }
}
