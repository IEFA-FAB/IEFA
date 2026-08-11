/**
 * Pipeline comum de ingestão de fonte normativa.
 *
 * Escrito uma vez e reusado por todos os adapters: o que muda entre a AGU e a
 * legislação federal é `discover`/`fetch`/`parse`; daí para frente é sempre
 * hash → dedup → supersede → persistir estrutura → chunk → embed → upsert.
 *
 * Invariantes:
 *  - reingestão de conteúdo idêntico é no-op, sem gastar chamada de embedding
 *  - versão nova nunca sobrescreve a anterior; a anterior recebe `superseded_at`
 *  - regra semeada de nota explicativa nasce em `draft`, nunca ativa
 */

import { supabase } from "../db/supabase.ts"
import { estimateTokens } from "../lib/text.ts"
import { buildChunks } from "./chunking.ts"
import type { NormativeSourceAdapter, SourceItem, StructuredDoc } from "./types.ts"

export type EmbedFn = (texts: string[]) => Promise<number[][]>

export interface IngestOptions {
	sourceId: string
	adapter: NormativeSourceAdapter
	embed: EmbedFn
	/** Sem `apply`, nada é escrito — só relata o que aconteceria. */
	apply?: boolean
	/** Limita quantos itens processar (uso em teste manual e calibração). */
	limit?: number
	/**
	 * Grava os chunks sem gerar vetor.
	 *
	 * Os chunks continuam existindo e indexados por full-text — a busca híbrida
	 * degrada para keyword-only em vez de sumir. É o que mantém a verificação
	 * funcionando quando o provedor de embedding está indisponível, sem fingir
	 * que o corpus está completo.
	 */
	skipEmbeddings?: boolean
}

export type ItemOutcome = "unchanged" | "created" | "superseded" | "failed"

export interface ItemResult {
	external_id: string
	title: string
	version_label: string
	outcome: ItemOutcome
	nodes: number
	notes: number
	seeded_rules: number
	chunks: number
	error?: string
}

export interface IngestReport {
	source_id: string
	applied: boolean
	discovered: number
	items: ItemResult[]
}

function ruleCode(externalId: string, path: string, position: number): string {
	const slug =
		externalId
			.split("/")
			.pop()
			?.replace(/\.docx$/i, "") ?? externalId
	return `agu:${slug}:${path}:${position}`
}

/**
 * Versão vigente **concluída** de um item.
 *
 * `ingested_at is not null` é o que impede tratar como "sem mudança" um
 * documento que ficou pela metade numa execução interrompida.
 */
async function findCurrentDocument(sourceId: string, externalId: string) {
	const { data, error } = await supabase
		.from("document")
		.select("id, content_hash, version_label")
		.eq("source_id", sourceId)
		.eq("external_id", externalId)
		.is("superseded_at", null)
		.not("ingested_at", "is", null)
		.maybeSingle()

	if (error) throw new Error(`consulta da versão vigente falhou: ${error.message}`)
	return data
}

/** Apaga restos de execução interrompida (FK em cascata leva seções e chunks). */
async function discardIncomplete(sourceId: string, externalId: string): Promise<void> {
	const { error } = await supabase.from("document").delete().eq("source_id", sourceId).eq("external_id", externalId).is("ingested_at", null)

	if (error) throw new Error(`limpeza de ingestão interrompida falhou: ${error.message}`)
}

async function persist(
	sourceId: string,
	item: SourceItem,
	doc: StructuredDoc,
	embed: EmbedFn,
	currentId: string | null,
	skipEmbeddings: boolean
): Promise<Omit<ItemResult, "external_id" | "title" | "version_label" | "outcome">> {
	const { data: inserted, error: insertError } = await supabase
		.from("document")
		.insert({
			title: doc.title,
			document_type: doc.document_type,
			source: item.category ?? null,
			source_id: sourceId,
			external_id: item.external_id,
			version_label: doc.version_label,
			effective_from: doc.effective_from ?? null,
			content_hash: doc.content_hash,
		})
		.select("id")
		.single()

	if (insertError || !inserted) throw new Error(`insert de document falhou: ${insertError?.message}`)
	const documentId = inserted.id as string

	const { data: nodeRows, error: nodeError } = await supabase
		.from("structure_node")
		.insert(
			doc.nodes.map((node) => ({
				document_id: documentId,
				path: node.path,
				ordinal: node.ordinal,
				level: node.level,
				title: node.title,
				title_norm: node.title_norm,
				ref_label: node.ref_label ?? null,
				is_required: node.is_required,
				body: node.body || null,
			}))
		)
		.select("id, path")

	if (nodeError || !nodeRows) throw new Error(`insert de structure_node falhou: ${nodeError?.message}`)
	const nodeIdByPath = new Map(nodeRows.map((row: { id: string; path: string }) => [row.path, row.id]))

	// Cada nota carrega o nó de origem para que a semente de regra saia da nota
	// certa — um nó pode ter mais de uma nota, e só as que citam dispositivo viram regra.
	const noteDrafts = doc.nodes.flatMap((node) => node.notes.map((note) => ({ node, note })))
	const noteRows = noteDrafts.map(({ node, note }) => ({
		node_id: nodeIdByPath.get(node.path) as string,
		content: note.content,
		cited_refs: note.cited_refs,
	}))
	const placeholderRows = doc.nodes.flatMap((node) =>
		node.placeholders.map((placeholder) => ({ node_id: nodeIdByPath.get(node.path) as string, token: placeholder.token }))
	)

	let insertedNotes: Array<{ id: string }> = []
	if (noteRows.length > 0) {
		const { data, error } = await supabase.from("explanatory_note").insert(noteRows).select("id")
		if (error) throw new Error(`insert de explanatory_note falhou: ${error.message}`)
		insertedNotes = (data ?? []) as Array<{ id: string }>

		if (insertedNotes.length !== noteRows.length) {
			throw new Error(
				`explanatory_note: ${insertedNotes.length} linhas retornadas para ${noteRows.length} enviadas — correlação com a nota de origem não é confiável`
			)
		}
	}
	if (placeholderRows.length > 0) {
		const { error } = await supabase.from("placeholder").insert(placeholderRows)
		if (error) throw new Error(`insert de placeholder falhou: ${error.message}`)
	}

	// Semente de regra: uma por nota que cita dispositivo. Sempre em `draft` —
	// promoção só acontece por revisão humana na bancada. A correlação é
	// posicional: `insertedNotes[i]` é a persistência de `noteDrafts[i]`.
	const ruleRows = insertedNotes
		.map((inserted, position) => {
			const { node, note } = noteDrafts[position]
			if (note.cited_refs.length === 0) return null

			return {
				code: ruleCode(item.external_id, node.path, position),
				kind: "CONTEUDO" as const,
				severity: "MEDIA" as const,
				status: "draft" as const,
				origin: "agu_note" as const,
				origin_document_id: documentId,
				origin_note_id: inserted.id,
				legal_ref: note.cited_refs,
				applicability: {},
				target_field: null,
				statement: note.content,
			}
		})
		.filter((row): row is NonNullable<typeof row> => row !== null)

	if (ruleRows.length > 0) {
		const { error } = await supabase.from("checklist_rule").upsert(ruleRows, { onConflict: "code", ignoreDuplicates: true })
		if (error) throw new Error(`insert de checklist_rule falhou: ${error.message}`)
	}

	const chunks = buildChunks(doc.nodes)
	if (chunks.length > 0) {
		// Sem vetor o chunk ainda entra: `document_chunk.fts` é coluna gerada do
		// próprio conteúdo, então a busca por palavra-chave continua valendo.
		const vectors = skipEmbeddings ? [] : await embed(chunks.map((chunk) => chunk.content))
		const { error } = await supabase.from("document_chunk").insert(
			chunks.map((chunk, position) => ({
				document_id: documentId,
				content: chunk.content,
				chapter: chunk.chapter,
				article: chunk.article,
				section: chunk.section,
				chunk_index: chunk.chunk_index,
				token_count: estimateTokens(chunk.content),
				metadata: { source_id: sourceId, version_label: doc.version_label },
				embedding: vectors[position],
			}))
		)
		if (error) throw new Error(`insert de document_chunk falhou: ${error.message}`)
	}

	// Marca de conclusão antes do supersede: só documento completo pode
	// substituir o anterior ou ser considerado vigente na próxima execução.
	const { error: completeError } = await supabase.from("document").update({ ingested_at: new Date().toISOString() }).eq("id", documentId)
	if (completeError) throw new Error(`marcação de ingestão concluída falhou: ${completeError.message}`)

	// Supersede por último: até aqui, qualquer falha deixa a versão vigente intacta.
	if (currentId) {
		const { error } = await supabase.from("document").update({ superseded_at: new Date().toISOString() }).eq("id", currentId)
		if (error) throw new Error(`supersede da versão anterior falhou: ${error.message}`)
	}

	return {
		nodes: doc.nodes.length,
		notes: noteRows.length,
		seeded_rules: ruleRows.length,
		chunks: chunks.length,
	}
}

export async function ingestSource({ sourceId, adapter, embed, apply = false, limit, skipEmbeddings = false }: IngestOptions): Promise<IngestReport> {
	const discovered = await adapter.discover()
	const items = typeof limit === "number" ? discovered.slice(0, limit) : discovered
	const results: ItemResult[] = []

	for (const item of items) {
		const base = { external_id: item.external_id, title: item.title, version_label: item.version_label }

		try {
			const raw = await adapter.fetch(item)
			const doc = await adapter.parse(raw, item)
			const current = await findCurrentDocument(sourceId, item.external_id)

			if (current?.content_hash === doc.content_hash) {
				results.push({ ...base, outcome: "unchanged", nodes: doc.nodes.length, notes: 0, seeded_rules: 0, chunks: 0 })
				continue
			}

			if (!apply) {
				results.push({
					...base,
					outcome: current ? "superseded" : "created",
					nodes: doc.nodes.length,
					notes: doc.nodes.reduce((total, node) => total + node.notes.length, 0),
					seeded_rules: 0,
					chunks: buildChunks(doc.nodes).length,
				})
				continue
			}

			await discardIncomplete(sourceId, item.external_id)
			const counts = await persist(sourceId, item, doc, embed, current?.id ?? null, skipEmbeddings)
			results.push({ ...base, outcome: current ? "superseded" : "created", ...counts })
		} catch (error) {
			results.push({
				...base,
				outcome: "failed",
				nodes: 0,
				notes: 0,
				seeded_rules: 0,
				chunks: 0,
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	if (apply) {
		const failures = results.filter((result) => result.outcome === "failed")
		await supabase
			.from("normative_source")
			.update({
				last_checked_at: new Date().toISOString(),
				last_error: failures.length > 0 ? `${failures.length} item(ns) com erro: ${failures[0]?.error ?? ""}`.slice(0, 500) : null,
			})
			.eq("id", sourceId)
	}

	return { source_id: sourceId, applied: apply, discovered: discovered.length, items: results }
}
