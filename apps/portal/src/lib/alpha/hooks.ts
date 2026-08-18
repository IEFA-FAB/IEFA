/**
 * Acesso ao Projeto α a partir do portal.
 *
 * O alpha valida o JWT do Supabase por request, então o cliente RPC é criado
 * sob demanda com o token da sessão corrente — nunca memoizado, porque token
 * expira (ver `getAlphaClient` em `@/lib/hono`).
 */

import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { alphaRequest } from "./client"

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

export function sourcesQueryOptions(token: string | undefined) {
	return queryOptions({
		queryKey: ["alpha", "sources"],
		queryFn: async () => (await alphaRequest<{ sources: NormativeSource[] }>("/api/v1/sources", token)).sources,
		staleTime: 30_000,
	})
}

export function sourceDocumentsQueryOptions(token: string | undefined, sourceId: string, includeSuperseded = false) {
	return queryOptions({
		queryKey: ["alpha", "sources", sourceId, "documents", includeSuperseded],
		queryFn: async () =>
			(await alphaRequest<{ documents: AlphaDocument[] }>(`/api/v1/sources/${sourceId}/documents?include_superseded=${includeSuperseded}`, token)).documents,
	})
}

export function documentStructureQueryOptions(token: string | undefined, documentId: string) {
	return queryOptions({
		queryKey: ["alpha", "documents", documentId, "structure"],
		queryFn: () => alphaRequest<DocumentStructure>(`/api/v1/documents/${documentId}/structure`, token),
	})
}

export function useRefreshSource() {
	const queryClient = useQueryClient()
	const { session } = useAuth()

	return useMutation({
		mutationFn: (sourceId: string) =>
			// Coleta a partir do console é sempre simulação: gravar é decisão de
			// operação, feita pela CLI ou pelo job agendado, não por clique na tela.
			alphaRequest<{ source_id: string; discovered: number; items: Array<{ outcome: string }> }>(`/api/v1/sources/${sourceId}/refresh`, session?.access_token, {
				method: "POST",
				body: JSON.stringify({ apply: false }),
			}),
		onSuccess: (_result, sourceId) => {
			queryClient.invalidateQueries({ queryKey: ["alpha", "sources"] })
			queryClient.invalidateQueries({ queryKey: ["alpha", "sources", sourceId] })
		},
	})
}
