import { createHash } from "node:crypto"
import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"
import { embeddingModelId, getEmbeddings } from "../lib/embeddings.ts"

interface FrontmatterData {
	source?: string
	document_type?: string
	title?: string
	year?: number
}

interface Chunk {
	content: string
	chapter: string
	article: string
	section: string
	chunk_index: number
}

/**
 * Fábrica compartilhada, e não um cliente próprio.
 *
 * Este módulo montava o seu `OpenAIEmbeddings` contra a NVIDIA e inseria o chunk SEM
 * `embedding_model`. As duas coisas juntas tornavam invisível tudo que passava por aqui:
 * a RPC `alpha.match_chunks_cosine` filtra `c.embedding_model = embedding_model_filter`,
 * e nulo não é igual a nada — o chunk tinha vetor e mesmo assim só era alcançável por
 * full-text. Pior, o vetor vinha de um modelo diferente do que a consulta usa, o que dá
 * distância sem significado, que é a falha que a coluna foi criada para impedir.
 */
const embeddings = getEmbeddings()

function parseFrontmatter(markdown: string): { data: FrontmatterData; content: string } {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
	if (!match) return { data: {}, content: markdown }

	const data: FrontmatterData = {}
	for (const line of match[1].split("\n")) {
		const [key, ...vals] = line.split(":")
		if (key && vals.length) data[key.trim() as keyof FrontmatterData] = vals.join(":").trim() as any
	}
	return { data, content: match[2] }
}

function chunkByArticle(content: string): Chunk[] {
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
			if (tokenEstimate > 512) {
				const halfLen = Math.ceil(text.length / 2)
				chunks.push({
					content: text.slice(0, halfLen),
					chapter: currentChapter,
					article: currentArticle,
					section: currentSection,
					chunk_index: chunkIndex++,
				})
				chunks.push({
					content: text.slice(halfLen - 50),
					chapter: currentChapter,
					article: currentArticle,
					section: currentSection,
					chunk_index: chunkIndex++,
				})
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

export async function ingestMarkdown(filePath: string): Promise<{ chunks_created: number; chunks_skipped: number }> {
	const fs = await import("node:fs")
	const markdown = fs.readFileSync(filePath, "utf-8")

	const { data: frontmatter, content } = parseFrontmatter(markdown)

	const source = frontmatter.source ?? filePath.split("/").pop() ?? filePath
	const documentType = frontmatter.document_type ?? "RADA"
	const title = frontmatter.title ?? source
	const year = frontmatter.year ?? new Date().getFullYear()

	// O hash do markdown decide se há trabalho a fazer. Antes, um documento já existente
	// era reaproveitado e todo `chunk_index` já gravado era pulado: módulo revisto entrava
	// como "0 criados, N pulados" e a base seguia servindo o texto SUPERSEDIDO, com a
	// ingestão relatando sucesso. Para uma norma isso é o pior desfecho possível.
	const contentHash = createHash("sha256").update(markdown).digest("hex")

	const { data: existing } = await supabase.from("document").select("id, content_hash").eq("source", source).single()

	let documentId: string

	if (existing) {
		documentId = existing.id

		if (existing.content_hash === contentHash) return { chunks_created: 0, chunks_skipped: 0 }

		// Conteúdo mudou. Este caminho é deliberadamente SEM versionamento — a coluna
		// `version_label` do schema é nula "para o corpus legado da FAB, ingerido por
		// markdown", e quem versiona é `sources/pipeline.ts`. Então os chunks antigos são
		// substituídos, não superseditados: manter os dois lados sem rótulo de versão
		// devolveria as duas redações na mesma busca, sem como distingui-las.
		const { error: deleteError } = await supabase.from("document_chunk").delete().eq("document_id", documentId)
		if (deleteError) throw new Error(`Failed to clear previous chunks: ${deleteError.message}`)

		const { error: updateError } = await supabase
			.from("document")
			.update({ title, year, raw_content: markdown, content_hash: contentHash, updated_at: new Date().toISOString() })
			.eq("id", documentId)
		if (updateError) throw new Error(`Failed to update document: ${updateError.message}`)
	} else {
		const { data: doc, error } = await supabase
			.from("document")
			.insert({ source, document_type: documentType, title, year, raw_content: markdown, content_hash: contentHash })
			.select("id")
			.single()
		if (error || !doc) throw new Error(`Failed to insert document: ${error?.message}`)
		documentId = doc.id
	}

	const chunks = chunkByArticle(content)
	let created = 0
	let skipped = 0

	const BATCH = env.EMB_BATCH_SIZE
	for (let i = 0; i < chunks.length; i += BATCH) {
		const batch = chunks.slice(i, i + BATCH)

		const { data: existingChunks } = await supabase
			.from("document_chunk")
			.select("chunk_index")
			.eq("document_id", documentId)
			.in(
				"chunk_index",
				batch.map((c) => c.chunk_index)
			)

		const existingIndexes = new Set((existingChunks ?? []).map((c: any) => c.chunk_index))
		const toCreate = batch.filter((c) => !existingIndexes.has(c.chunk_index))

		if (toCreate.length === 0) {
			skipped += batch.length
			continue
		}

		const vectors = await embeddings.embedDocuments(toCreate.map((c) => c.content))

		const rows = toCreate.map((chunk, idx) => ({
			document_id: documentId,
			content: chunk.content,
			embedding: vectors[idx],
			chapter: chunk.chapter || null,
			article: chunk.article || null,
			section: chunk.section || null,
			chunk_index: chunk.chunk_index,
			token_count: Math.ceil(chunk.content.length / 4),
			// Quem gerou o vetor viaja com ele: é o que permite trocar de modelo sem
			// comparar vetores de espaços diferentes em silêncio.
			embedding_model: embeddingModelId(),
			metadata: { source, document_type: documentType, year },
		}))

		const { error: insertError } = await supabase.from("document_chunk").insert(rows)
		if (insertError) throw new Error(`Failed to insert chunks: ${insertError.message}`)

		created += toCreate.length
		skipped += batch.length - toCreate.length
	}

	return { chunks_created: created, chunks_skipped: skipped }
}
