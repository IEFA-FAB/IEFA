/**
 * Demanda do requisitante no α: lista, rascunho, gravação e envio do ETP/TR à ACI.
 *
 * A estrutura e as regras (conferências, enquadramento, peças) vêm de
 * `@iefa/alpha-client/demand`, as mesmas que o α usa ao gerar o que vai à ACI.
 */

import type { DemandPayload } from "@iefa/alpha-client/demand"
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { alphaPath, alphaRequest } from "./client"

export type DemandStatus = "rascunho" | "enviada"

export interface DemandSummary {
	id: string
	user_id: string
	unit_id: number
	title: string
	status: DemandStatus
	submitted_at: string | null
	created_at: string
	updated_at: string
}

export interface DemandSubmission {
	id: string
	doc_kind: "ETP" | "TR"
	filename: string
	created_at: string
}

export interface DemandDetail extends DemandSummary {
	payload: DemandPayload
	/** O rascunho gravado não passou no schema atual: a tela abre vazia e avisa. */
	payload_invalid: boolean
	updated_by: string | null
	can_edit: boolean
	submissions: DemandSubmission[]
}

/** Teto da lista no α (`DEMAND_LIST_LIMIT`). */
export const DEMAND_LIST_LIMIT = 100

export function demandsQueryOptions(token: string | undefined, scope: { kind: "unit" | "all" | "personal"; unitId: number | null }) {
	const path =
		scope.kind === "personal" ? "/api/v1/demands?mine=true" : scope.unitId === null ? "/api/v1/demands" : alphaPath`/api/v1/demands?unit_id=${scope.unitId}`
	return queryOptions({
		queryKey: ["alpha", "demands", "list", scope.kind, scope.unitId ?? "all"],
		queryFn: async () => (await alphaRequest<{ demands: DemandSummary[] }>(path, token)).demands,
		staleTime: 15_000,
	})
}

export function demandQueryOptions(token: string | undefined, demandId: string) {
	return queryOptions({
		queryKey: ["alpha", "demands", demandId],
		queryFn: () => alphaRequest<DemandDetail>(alphaPath`/api/v1/demands/${demandId}`, token),
		// O editor é dono do estado enquanto está aberto; refetch em foco sobrescreveria o que
		// ainda não foi gravado.
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	})
}

export function useCreateDemand() {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { unit_id: number; title: string }) =>
			alphaRequest<DemandDetail>("/api/v1/demands", session?.access_token, { method: "POST", body: JSON.stringify(input) }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alpha", "demands", "list"] }),
	})
}

export function useSaveDemand(demandId: string) {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { payload: DemandPayload; title?: string; expected_updated_at?: string }) =>
			alphaRequest<DemandSummary>(alphaPath`/api/v1/demands/${demandId}`, session?.access_token, { method: "PATCH", body: JSON.stringify(input) }),
		// O detalhe tem `staleTime` infinito (o editor é dono do estado enquanto aberto): sem
		// atualizar o cache, reabrir a demanda mostraria o rascunho de antes da gravação, com o
		// `updated_at` velho, e a primeira edição daria um falso 409.
		onSuccess: (saved, input) => {
			queryClient.setQueryData<DemandDetail>(["alpha", "demands", demandId], (current) =>
				current ? { ...current, ...saved, payload: input.payload } : current
			)
			queryClient.invalidateQueries({ queryKey: ["alpha", "demands", "list"] })
		},
	})
}

export function useDeleteDemand() {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (demandId: string) => alphaRequest<void>(alphaPath`/api/v1/demands/${demandId}`, session?.access_token, { method: "DELETE" }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alpha", "demands", "list"] }),
	})
}

export function useSubmitDemand(demandId: string) {
	const { session } = useAuth()
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { expected_updated_at: string }) =>
			alphaRequest<{ demand_id: string; updated_at: string; submissions: DemandSubmission[] }>(
				alphaPath`/api/v1/demands/${demandId}/submissions`,
				session?.access_token,
				{ method: "POST", body: JSON.stringify(input) }
			),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["alpha", "demands"] })
			queryClient.invalidateQueries({ queryKey: ["alpha", "submissions"] })
			queryClient.invalidateQueries({ queryKey: ["alpha", "aci", "queue"], refetchType: "none" })
		},
	})
}
