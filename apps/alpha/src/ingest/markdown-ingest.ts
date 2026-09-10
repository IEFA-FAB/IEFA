import { createHash } from "node:crypto"
import { supabase } from "../db/supabase.ts"
import { env } from "../env.ts"
import { embeddingModelId, getEmbeddings } from "../lib/embeddings.ts"
import { chunkByArticle } from "./chunk-markdown.ts"

interface FrontmatterData {
	source?: string
	document_type?: string
	title?: string
	year?: number
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

/**
 * Linhas por INSERT. Bem menor que o lote de embedding de propósito.
 *
 * Cada linha carrega um vetor de 1024 dimensões, e o índice HNSW é mantido a cada
 * gravação — o custo por linha CRESCE com o tamanho da tabela. Com 128 estourava o
 * `statement_timeout` nos módulos maiores; com 25 ainda estourava depois de a base passar
 * de 10 mil chunks. O embedding tinha ido bem nos dois casos: quem morria era a gravação.
 */
const INSERT_BATCH = 10

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
			.update({ title, year, raw_content: markdown, content_hash: null, updated_at: new Date().toISOString() })
			.eq("id", documentId)
		if (updateError) throw new Error(`Failed to update document: ${updateError.message}`)
	} else {
		const { data: doc, error } = await supabase
			.from("document")
			// Sem `content_hash` aqui de propósito: ele é gravado só depois que os chunks
			// entram. Gravá-lo junto marcava como concluída uma ingestão que ainda podia
			// falhar no embedding — e aí o curto-circuito por hash impedia a retentativa,
			// deixando o documento na base para sempre sem chunk nenhum.
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

		// Insert em lotes MENORES que o de embedding. Cada linha carrega um vetor de 1024
		// dimensões, e 128 delas de uma vez estouraram o `statement_timeout` do Postgres em
		// dois dos módulos maiores — o embedding tinha ido bem, e a gravação é que morria.
		for (let start = 0; start < rows.length; start += INSERT_BATCH) {
			const { error: insertError } = await supabase.from("document_chunk").insert(rows.slice(start, start + INSERT_BATCH))
			if (insertError) throw new Error(`Failed to insert chunks: ${insertError.message}`)
		}

		created += toCreate.length
		skipped += batch.length - toCreate.length
	}

	// Só agora o documento é dado por ingerido. Se qualquer lote acima tivesse lançado,
	// `content_hash` seguiria nulo e a próxima execução tentaria de novo.
	const { error: sealError } = await supabase.from("document").update({ content_hash: contentHash }).eq("id", documentId)
	if (sealError) throw new Error(`Failed to seal document: ${sealError.message}`)

	return { chunks_created: created, chunks_skipped: skipped }
}
