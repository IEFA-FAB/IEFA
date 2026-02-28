import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchEvaluationForUserFn, submitEvaluationFn } from "@/server/evaluation.fn"
import type { EvaluationResult } from "@/types/domain/admin"

const QUERY_STALE_TIME = 5 * 60_000
const QUERY_GC_TIME = 10 * 60_000

export const evaluationKey = (userId: string | null | undefined) => ["evaluation", userId] as const

export function useEvaluation(userId: string | null) {
	return useQuery({
		queryKey: evaluationKey(userId),
		queryFn: (): Promise<EvaluationResult> =>
			fetchEvaluationForUserFn({ data: { userId: userId ?? "" } }),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	})
}

export function useSubmitEvaluation() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (payload: { value: number; question: string; userId: string }) =>
			submitEvaluationFn({ data: payload }),
		onError: (error) => console.error("Erro ao registrar voto:", error),
		onSuccess: (_, { userId }) => {
			queryClient.invalidateQueries({ queryKey: evaluationKey(userId) })
		},
	})
}
