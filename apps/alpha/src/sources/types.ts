/**
 * Contratos da camada de fontes normativas.
 *
 * Cada fonte externa (modelos da AGU, legislação federal) implementa
 * `NormativeSourceAdapter`. O que acontece depois do `parse` é idêntico para
 * todas — hash, dedup, supersede, chunk, embed, upsert — e vive em `pipeline.ts`.
 */

import type { LegalRef } from "../lib/legal-ref.ts"

export type FederalDocumentType = "MODELO_AGU" | "LEI" | "DECRETO" | "IN_SEGES"

/** Item descoberto numa fonte, ainda não baixado. */
export interface SourceItem {
	/**
	 * Identidade estável do item, **sem** a versão. Para a AGU é a URL sem o
	 * sufixo de mês/ano, senão cada revisão do modelo viraria um documento novo
	 * em vez de uma versão nova do mesmo documento.
	 */
	external_id: string
	title: string
	version_label: string
	/** Primeiro dia do mês da versão, quando derivável (`2026-05-01`). */
	effective_from?: string
	fetch_url: string
	category?: string
}

export interface ExplanatoryNoteDraft {
	content: string
	cited_refs: LegalRef[]
}

export interface PlaceholderDraft {
	token: string
}

export interface StructureNodeDraft {
	/** Caminho ltree, ex.: `1.3.2`. */
	path: string
	ordinal: number
	level: number
	title: string
	title_norm: string
	/** Rótulo do dispositivo, preenchido só para norma articulada (PR D). */
	ref_label?: string
	is_required: boolean
	body: string
	notes: ExplanatoryNoteDraft[]
	placeholders: PlaceholderDraft[]
}

export interface StructuredDoc {
	document_type: FederalDocumentType
	title: string
	version_label: string
	effective_from?: string
	content_hash: string
	nodes: StructureNodeDraft[]
}

export interface NormativeSourceAdapter {
	id: string
	discover(): Promise<SourceItem[]>
	fetch(item: SourceItem): Promise<Uint8Array>
	parse(raw: Uint8Array, item: SourceItem): Promise<StructuredDoc>
}

/** Linha de `alpha.normative_source`. */
export interface NormativeSourceRow {
	id: string
	authority: string
	kind: string
	base_url: string
	cadence: string
	enabled: boolean
	last_checked_at: string | null
	last_error: string | null
}
