import { OpenAIEmbeddings } from "@langchain/openai"
import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"

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

const embeddings = new OpenAIEmbeddings({
	model: env.EMB_MODEL,
	configuration: {
		baseURL: env.NVIDIA_BASE_URL,
		apiKey: env.NVIDIA_API_KEY,
	},
	dimensions: 1024,
})

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

	const { data: existing } = await supabase.from("documents").select("id").eq("source", source).single()

	let documentId: string

	if (existing) {
		documentId = existing.id
	} else {
		const { data: doc, error } = await supabase
			.from("documents")
			.insert({ source, document_type: documentType, title, year, raw_content: markdown })
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
			.from("document_chunks")
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
			metadata: { source, document_type: documentType, year },
		}))

		const { error: insertError } = await supabase.from("document_chunks").insert(rows)
		if (insertError) throw new Error(`Failed to insert chunks: ${insertError.message}`)

		created += toCreate.length
		skipped += batch.length - toCreate.length
	}

	return { chunks_created: created, chunks_skipped: skipped }
}
