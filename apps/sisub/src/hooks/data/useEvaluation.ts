import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchEvaluationForUserFn, submitEvaluationFn } from "@/server/evaluation.fn"
import type { EvaluationResult } from "@/types/domain/admin"

const QUERY_STALE_TIME = 5 * 60_000
const QUERY_GC_TIME = 10 * 60_000

export const evaluationKey = queryKeys.evaluation.user

export function useEvaluation(userId: string | null) {
	return useQuery({
		queryKey: queryKeys.evaluation.user(userId),
		queryFn: (): Promise<EvaluationResult> => fetchEvaluationForUserFn({ data: { userId: userId ?? "" } }),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	})
}

export function useSubmitEvaluation(userId: string | null) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (payload: { value: number; question: string }) => submitEvaluationFn({ data: payload }),
		onError: (_error) => {},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.evaluation.user(userId) })
		},
	})
}
