import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { fetchEvalConfigFn, upsertEvalConfigFn } from "@/server/evaluation.fn"
import type { EvalConfig } from "@/types/domain/admin"

export const evalConfigQueryOptions = queryOptions({
	queryKey: ["super-admin", "evaluation-config"],
	queryFn: () => fetchEvalConfigFn(),
	staleTime: 60_000,
})

export function useEvalConfig() {
	const queryClient = useQueryClient()

	const query = useSuspenseQuery(evalConfigQueryOptions)

	const mutation = useMutation({
		mutationFn: (cfg: EvalConfig) => upsertEvalConfigFn({ data: cfg }),
		onSuccess: (saved) => {
			queryClient.setQueryData(["super-admin", "evaluation-config"], saved)
		},
	})

	return {
		config: query.data,
		isLoading: false, // Suspense handles loading
		isFetching: query.isFetching,
		isSaving: mutation.isPending,
		saveError: mutation.error,
		saveSuccess: mutation.isSuccess,
		updateConfig: mutation.mutateAsync,
	}
}
