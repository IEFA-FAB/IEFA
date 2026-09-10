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
 * Piso para fechar chunk numa fronteira de dispositivo.
 *
 * Sem ele, cada linha do índice do manual (`3.2. ARRECADAÇÃO DE VALORES…`) viraria um
 * chunk de 60 caracteres: um vetor por linha de sumário, que casa com a consulta e não
 * responde nada. Abaixo do piso a fronteira é ignorada e o acúmulo continua — o chunk
 * sai rotulado com o dispositivo que o ABRIU, que é onde a citação deve apontar.
 *
 * O valor sai de uma restrição a jusante: `RERANK_TOP_N` entrega **cinco** chunks ao
 * modelo, e mais nada. Medido sobre o acervo, o piso decide o tamanho da evidência por
 * resposta — 400 dá mediana de 595 caracteres (≈3 KB para o modelo, contra os ≈10 KB de
 * hoje), 1000 dá 1216 (≈6 KB) e mantém 77% dos chunks rotulados com dispositivo. Cortar
 * mais fino melhora a precisão do vetor e estreita a resposta; este é o meio-termo.
 */
const MIN_CHUNK_CHARS = 1000

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

/** Numeração decimal já marcada como heading: `### 14.1`, `#### 10.2.10.1.3 Os militares…`. */
const DECIMAL_DEVICE = /^#{1,4}\s+(\d+(?:\.\d+)*)[.)]?(?:\s|$)/

export function chunkByArticle(rawContent: string): Chunk[] {
	const content = stripCommentLines(rawContent)
	const chunks: Chunk[] = []
	let currentChapter = ""
	let currentArticle = ""
	let currentSection = ""
	let buffer: string[] = []
	let chunkIndex = 0

	/** Onde cada dispositivo começa DENTRO do buffer, para rotular por posição. */
	interface DeviceMark {
		offset: number
		chapter: string
		article: string
		section: string
	}
	let marks: DeviceMark[] = []

	const append = (line: string) => {
		// Buffer só com linha em branco conta como VAZIO: o markdown gerado abre com uma
		// linha em branco antes do título, e um teste por `length` deixava os primeiros
		// chunks do documento sem rótulo mesmo com o dispositivo dentro deles.
		const empty = buffer.every((buffered) => buffered.trim() === "")
		const offset = empty ? 0 : buffer.join("\n").length + 1
		if (empty) marks = []
		if (empty || marks.length === 0 || marks.at(-1)?.offset !== offset) {
			marks.push({ offset, chapter: currentChapter, article: currentArticle, section: currentSection })
		}
		buffer.push(line)
	}

	/**
	 * O dispositivo vigente NA POSIÇÃO do trecho, e não o que abriu o buffer.
	 *
	 * Com o piso de tamanho um buffer atravessa várias fronteiras, e quando ele passa do
	 * teto de caracteres é fatiado: a segunda janela pode cair inteira dentro do terceiro
	 * dispositivo e ainda assim ser citada como o primeiro — que é exatamente o erro de
	 * rótulo que este trabalho existe para tirar da base.
	 */
	const isLabelled = (mark: DeviceMark) => Boolean(mark.chapter || mark.section || mark.article)

	const deviceAt = (start: number, end: number): DeviceMark => {
		let found: DeviceMark = { offset: 0, chapter: "", article: "", section: "" }
		for (const mark of marks) {
			if (mark.offset > start) break
			found = mark
		}
		// Trecho que abre ANTES de qualquer dispositivo — o primeiro chunk de todo
		// documento, que começa no título — herda o primeiro dispositivo que começa DENTRO
		// dele. Não é mislabel: o dispositivo está no texto do chunk. Vazio ali seria
		// honesto e inútil, e era o que a base recebia.
		if (!isLabelled(found)) {
			const inner = marks.find((mark) => mark.offset > start && mark.offset < end && isLabelled(mark))
			if (inner) return inner
		}
		return found
	}

	const flushBuffer = () => {
		const raw = buffer.join("\n")
		const text = raw.trim()
		// `trim()` corta o começo, e as marcas foram gravadas em coordenada do texto CRU.
		const shift = raw.length - raw.trimStart().length
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
					const device = deviceAt(offset + shift, offset + shift + slice.length)
					chunks.push({
						content: slice,
						chapter: device.chapter,
						article: device.article,
						section: device.section,
						chunk_index: chunkIndex++,
					})
				}
			} else {
				const device = deviceAt(shift, shift + text.length)
				chunks.push({
					content: text,
					chapter: device.chapter,
					article: device.article,
					section: device.section,
					chunk_index: chunkIndex++,
				})
			}
		}
		buffer = []
		marks = []
	}

	/** Fecha o chunk só quando já há texto suficiente para ele valer um vetor. */
	const flushAtDevice = () => {
		if (buffer.join("\n").trim().length >= MIN_CHUNK_CHARS) flushBuffer()
	}

	for (const line of content.split("\n")) {
		const chapterMatch = line.match(/^#{1,3}\s+(Cap[íi]tulo\s+[IVXLCDM\d]+)/i)
		// Sem `\s*` antes do ordinal, e com o ordinal preso ao número: `#### Art. 3 o texto
		// segue` rendia `article: "Art. 3 o"`, e `#### Art. 12 do Decreto` rendia
		// `"Art. 12 "` — rótulo com espaço no fim não casa em `.eq("article", …)` nenhum.
		const articleMatch = line.match(/^#{1,4}\s+(Art\.?\s*\d+[ºo°]?)/i)
		const sectionMatch = line.match(/^#{1,4}\s+(Se[çc][ãa]o\s+[IVXLCDM\d]+)/i)
		const decimalMatch = line.match(DECIMAL_DEVICE)

		if (chapterMatch) {
			flushAtDevice()
			currentChapter = chapterMatch[1]
			currentSection = ""
			currentArticle = ""
			append(line)
		} else if (articleMatch) {
			flushAtDevice()
			currentArticle = articleMatch[1]
			append(line)
		} else if (sectionMatch) {
			flushAtDevice()
			currentSection = sectionMatch[1]
			currentArticle = ""
			append(line)
		} else if (decimalMatch) {
			// Manual administrativo numera por decimal, não por artigo. A PROFUNDIDADE diz
			// o que a numeração é: `14` é o módulo, `14.1` a seção, `14.1.1` o dispositivo.
			flushAtDevice()
			const depth = decimalMatch[1].split(".").length
			if (depth <= 1) {
				currentChapter = decimalMatch[1]
				currentSection = ""
				currentArticle = ""
			} else if (depth === 2) {
				currentSection = decimalMatch[1]
				currentArticle = ""
			} else {
				currentArticle = decimalMatch[1]
			}
			append(line)
		} else {
			append(line)
		}
	}
	flushBuffer()
	return chunks
}
