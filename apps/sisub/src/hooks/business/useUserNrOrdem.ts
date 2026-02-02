import type { User } from "@supabase/supabase-js"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import supabase from "@/lib/supabase"

const QUERY_STALE_TIME = 5 * 60_000
const QUERY_GC_TIME = 10 * 60_000

export const userNrOrdemKey = (userId: string | null | undefined) =>
	["user", userId, "nrOrdem"] as const

export async function fetchUserNrOrdem(userId: User["id"]): Promise<string | null> {
	const { data, error } = await supabase
		.from("user_data")
		.select("nrOrdem")
		.eq("id", userId)
		.maybeSingle()

	if (error) throw error

	const value = data?.nrOrdem as string | number | null | undefined
	const asString = value != null ? String(value) : null
	return asString && asString.trim().length > 0 ? asString : null
}

export async function syncIdNrOrdem(user: User, nrOrdem: string) {
	const { error } = await supabase
		.from("user_data")
		.upsert({ id: user.id, email: user.email, nrOrdem }, { onConflict: "id" })
	if (error) throw error
}

export function useUserNrOrdem(userId: string | null) {
	return useQuery({
		queryKey: userNrOrdemKey(userId),
		queryFn: () => fetchUserNrOrdem(userId as string),
		enabled: !!userId,
		staleTime: QUERY_STALE_TIME,
		gcTime: QUERY_GC_TIME,
	})
}

export function useUpdateNrOrdem() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: ({ user, nrOrdem }: { user: User; nrOrdem: string }) =>
			syncIdNrOrdem(user, nrOrdem),
		onMutate: async ({ user, nrOrdem }) => {
			const queryKey = userNrOrdemKey(user.id)
			await queryClient.cancelQueries({ queryKey })
			const previous = queryClient.getQueryData(queryKey)
			queryClient.setQueryData(queryKey, nrOrdem)
			return { previous, queryKey }
		},
		onError: (error, _, context) => {
			console.error("Erro ao salvar nrOrdem:", error)
			if (context?.previous) {
				queryClient.setQueryData(context.queryKey, context.previous)
			}
		},
		onSuccess: (_, { user }) => {
			// Keep invalidation to ensure sync with server
			queryClient.invalidateQueries({ queryKey: userNrOrdemKey(user.id) })
		},
	})
}
