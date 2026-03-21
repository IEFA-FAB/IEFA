import type { User } from "@supabase/supabase-js"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchUserNrOrdemFn, syncUserNrOrdemFn } from "@/server/user.fn"

const QUERY_STALE_TIME = 5 * 60_000
const QUERY_GC_TIME = 10 * 60_000

export const userNrOrdemKey = (userId: string | null | undefined) => ["user", userId, "nrOrdem"] as const

export function useUserNrOrdem(userId: string | null) {
	return useQuery({
		queryKey: userNrOrdemKey(userId),
		queryFn: () => fetchUserNrOrdemFn({ data: { userId: userId as string } }),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	})
}

export function useUpdateNrOrdem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ user, nrOrdem }: { user: User; nrOrdem: string }) => syncUserNrOrdemFn({ data: { userId: user.id, email: user.email ?? "", nrOrdem } }),
		onMutate: async ({ user, nrOrdem }) => {
			const queryKey = userNrOrdemKey(user.id)
			await queryClient.cancelQueries({ queryKey })
			const previous = queryClient.getQueryData(queryKey)
			queryClient.setQueryData(queryKey, nrOrdem)
			return { previous, queryKey }
		},
		onError: (_error, _, context) => {
			if (context?.previous) {
				queryClient.setQueryData(context.queryKey, context.previous)
			}
		},
		onSuccess: (_, { user }) => {
			queryClient.invalidateQueries({ queryKey: userNrOrdemKey(user.id) })
		},
	})
}
