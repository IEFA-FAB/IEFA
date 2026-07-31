/**
 * Acesso ao Projeto α a partir do portal.
 *
 * O alpha valida o JWT do Supabase por request, então o cliente RPC é criado
 * sob demanda com o token da sessão corrente — nunca memoizado, porque token
 * expira (ver `getAlphaClient` em `@/lib/hono`).
 */

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { authQueryOptions } from "@/auth/service"
import { getAlphaClient } from "@/lib/hono"

export interface NormativeSource {
	id: string
	authority: string
	kind: string
	base_url: string
	cadence: string
	enabled: boolean
	last_checked_at: string | null
	last_error: string | null
	has_adapter: boolean
}

export interface AlphaDocument {
	id: string
	title: string
	document_type: string
	version_label: string | null
	effective_from: string | null
	superseded_at: string | null
	content_hash: string | null
	external_id: string | null
	source: string | null
}

export interface StructureNode {
	id: string
	path: string
	ordinal: number
	level: number
	title: string
	title_norm: string
	ref_label: string | null
	is_required: boolean
	body: string | null
	explanatory_note: Array<{ id: string; content: string; cited_refs: Array<{ norma: string; dispositivo: string }> }>
	placeholder: Array<{ id: string; token: string }>
}

export interface DocumentStructure {
	document: Pick<AlphaDocument, "id" | "title" | "document_type" | "version_label" | "effective_from" | "superseded_at">
	nodes: StructureNode[]
}

async function authorizedClient(queryClient: ReturnType<typeof useQueryClient>) {
	const auth = await queryClient.ensureQueryData(authQueryOptions())
	return getAlphaClient(auth.session?.access_token)
}

async function fetchJson<T>(response: Response, context: string): Promise<T> {
	if (!response.ok) throw new Error(`${context}: ${response.status}`)
	return (await response.json()) as T
}

export function sourcesQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "sources"],
		queryFn: async () => {
			const client = getAlphaClient(token)
			const response = await client.api.v1.sources.$get()
			const body = await fetchJson<{ sources: NormativeSource[] }>(response, "fontes")
			return body.sources
		},
		staleTime: 30_000,
	})
}

export function sourceDocumentsQueryOptions(token: string | undefined, sourceId: string, includeSuperseded = false) {
	return queryOptions({
		queryKey: ["alpha", "sources", sourceId, "documents", includeSuperseded],
		queryFn: async () => {
			const client = getAlphaClient(token)
			const response = await client.api.v1.sources[":id"].documents.$get({
				param: { id: sourceId },
				query: { include_superseded: includeSuperseded ? ("true" as const) : ("false" as const) },
			})
			const body = await fetchJson<{ documents: AlphaDocument[] }>(response, "documentos da fonte")
			return body.documents
		},
	})
}

export function documentStructureQueryOptions(token: string | undefined, documentId: string) {
	return queryOptions({
		queryKey: ["alpha", "documents", documentId, "structure"],
		queryFn: async () => {
			const client = getAlphaClient(token)
			const response = await client.api.v1.documents[":id"].structure.$get({ param: { id: documentId } })
			return fetchJson<DocumentStructure>(response, "estrutura do documento")
		},
	})
}

export function useRefreshSource() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (sourceId: string) => {
			const client = await authorizedClient(queryClient)
			// Coleta a partir do console é sempre simulação: gravar é decisão de
			// operação, feita pela CLI ou pelo job agendado, não por clique na tela.
			const response = await client.api.v1.sources[":id"].refresh.$post({ param: { id: sourceId }, json: { apply: false } })
			return fetchJson<{ source_id: string; discovered: number; items: Array<{ outcome: string }> }>(response, "coleta da fonte")
		},
		onSuccess: (_result, sourceId) => {
			queryClient.invalidateQueries({ queryKey: ["alpha", "sources"] })
			queryClient.invalidateQueries({ queryKey: ["alpha", "sources", sourceId] })
		},
	})
}
