/**
 * @module chunk-markdown
 * Fatiamento de markdown normativo em chunks para embedding.
 *
 * Módulo PURO de propósito: nada de `env.ts` nem de supabase aqui. Importar
 * `markdown-ingest.ts` num teste dispara a validação de ambiente na carga e derruba a
 * suíte — a mesma armadilha que o CLAUDE.md descreve. O corte é a parte que erra, então
 * é a parte que precisa de teste.
 */

/** Um pedaço do documento, com o dispositivo de onde veio. */
export interface Chunk {
	content: string
	chapter: string
	article: string
	section: string
	chunk_index: number
}

/** Teto por chunk, o mesmo do outro caminho de ingestão (`sources/chunking.ts`). */
const MAX_CHUNK_TOKENS = 512
/** ~4 caracteres por token é a estimativa usada em todo o app. */
const CHUNK_CHARS = MAX_CHUNK_TOKENS * 4
/** Sobreposição para não cortar dispositivo ao meio na fronteira entre chunks. */
const CHUNK_OVERLAP_CHARS = 200

/**
 * Descarta as linhas de comentário HTML.
 *
 * Por LINHA, e não por regex de `<!--…-->`: o corpo dos documentos é markdown gerado pelo
 * coletor, onde o comentário sempre ocupa a linha inteira. Uma expressão que casa o par de
 * delimitadores é um filtro de tag — e filtro de tag por regex erra nas formas exóticas
 * (`<!-->`, aninhamento), além de deixar delimitador órfão quando a captura não-gulosa
 * fecha cedo demais. Aqui não há nada a sanitizar: há metadado de geração a remover antes
 * do embedding, para não virar ruído na citação.
 */
function stripCommentLines(text: string): string {
	return text
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim()
			return !trimmed.startsWith("<!--") && trimmed !== "-->"
		})
		.join("\n")
}

export function chunkByArticle(rawContent: string): Chunk[] {
	const content = stripCommentLines(rawContent)
	const chunks: Chunk[] = []
	let currentChapter = ""
	let currentArticle = ""
	let currentSection = ""
	let buffer: string[] = []
	let chunkIndex = 0

	const flushBuffer = () => {
		const text = buffer.join("\n").trim()
		if (text.length > 20) {
			const tokenEstimate = Math.ceil(text.length / 4)
			if (tokenEstimate > MAX_CHUNK_TOKENS) {
				// Fatiar em QUANTOS pedaços forem necessários. Antes partia em exatamente
				// dois, qualquer que fosse o tamanho: um manual de 102 KB virava dois chunks
				// de 51 KB (~12.700 tokens), acima do teto de 8.192 do titan-embed-v2 — o
				// embedding falhava, o documento ficava na base SEM chunk nenhum, e o
				// `ingest-all.sh` (com `set -e`) abortava o lote inteiro ali. E quando cabia,
				// como no Módulo C, um vetor único para 25 KB de texto não recupera nada com
				// precisão: a busca semântica passa a apontar "o manual", não o dispositivo.
				for (let offset = 0; offset < text.length; offset += CHUNK_CHARS - CHUNK_OVERLAP_CHARS) {
					const slice = text.slice(offset, offset + CHUNK_CHARS).trim()
					if (slice.length <= 20) continue
					chunks.push({
						content: slice,
						chapter: currentChapter,
						article: currentArticle,
						section: currentSection,
						chunk_index: chunkIndex++,
					})
				}
			} else {
				chunks.push({
					content: text,
					chapter: currentChapter,
					article: currentArticle,
					section: currentSection,
					chunk_index: chunkIndex++,
				})
			}
		}
		buffer = []
	}

	for (const line of content.split("\n")) {
		const chapterMatch = line.match(/^#{1,3}\s+(Cap[íi]tulo\s+[IVXLCDM\d]+)/i)
		const articleMatch = line.match(/^#{1,4}\s+(Art\.\s*\d+[ºo°]?)/i)
		const sectionMatch = line.match(/^#{1,4}\s+(Se[çc][ãa]o\s+[IVXLCDM\d]+)/i)

		if (chapterMatch) {
			flushBuffer()
			currentChapter = chapterMatch[1]
			currentArticle = ""
			buffer.push(line)
		} else if (articleMatch) {
			flushBuffer()
			currentArticle = articleMatch[1]
			buffer.push(line)
		} else if (sectionMatch) {
			flushBuffer()
			currentSection = sectionMatch[1]
			buffer.push(line)
		} else {
			buffer.push(line)
		}
	}
	flushBuffer()
	return chunks
}
