import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import supabase from "@/lib/supabase"
import type { EvalConfig } from "@/types/domain/admin"

async function fetchEvalConfig(): Promise<EvalConfig> {
	const { data, error } = await supabase
		.from("super_admin_controller")
		.select("key, active, value")
		.eq("key", "evaluation")
		.maybeSingle()

	if (error) throw error

	return {
		active: !!data?.active,
		value:
			typeof data?.value === "string" ? data.value : data?.value == null ? "" : String(data.value),
	}
}

async function upsertEvalConfig(cfg: EvalConfig): Promise<EvalConfig> {
	const { data, error } = await supabase
		.from("super_admin_controller")
		.upsert({ key: "evaluation", active: cfg.active, value: cfg.value }, { onConflict: "key" })
		.select("key, active, value")
		.maybeSingle()

	if (error) throw error

	return {
		active: !!data?.active,
		value:
			typeof data?.value === "string" ? data.value : data?.value == null ? "" : String(data.value),
	}
}

export const evalConfigQueryOptions = queryOptions({
	queryKey: ["super-admin", "evaluation-config"],
	queryFn: fetchEvalConfig,
	staleTime: 60_000,
})

export function useEvalConfig() {
	const queryClient = useQueryClient()

	const query = useSuspenseQuery(evalConfigQueryOptions)

	const mutation = useMutation({
		mutationFn: upsertEvalConfig,
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
