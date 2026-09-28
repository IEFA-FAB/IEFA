import type { User } from "@supabase/supabase-js"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import { fetchUserSaramFn, syncUserSaramFn } from "@/server/user.fn"

const QUERY_STALE_TIME = 5 * 60_000
const QUERY_GC_TIME = 10 * 60_000

export const userSaramKey = queryKeys.user.saram

export function useUserSaram(userId: string | null) {
	return useQuery({
		queryKey: queryKeys.user.saram(userId),
		queryFn: () => fetchUserSaramFn({ data: { userId: userId as string } }),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	})
}

export function useUpdateSaram() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ user, saram }: { user: User; saram: string }) => syncUserSaramFn({ data: { userId: user.id, email: user.email ?? "", saram } }),
		onMutate: async ({ user, saram }) => {
			const queryKey = queryKeys.user.saram(user.id)
			await queryClient.cancelQueries({ queryKey })
			const previous = queryClient.getQueryData(queryKey)
			queryClient.setQueryData(queryKey, saram)
			return { previous, queryKey }
		},
		onError: (_error, _, context) => {
			if (context?.previous) {
				queryClient.setQueryData(context.queryKey, context.previous)
			}
		},
		onSuccess: (_, { user }) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.user.saram(user.id) })
		},
	})
}
