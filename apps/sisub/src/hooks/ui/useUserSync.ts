import type { User } from "@supabase/supabase-js"
import { useMutation } from "@tanstack/react-query"
import { syncUserEmailFn } from "@/server/user.fn"

export function useSyncUserEmail() {
	return useMutation({
		// O `user` é mantido no contrato do mutate (chamadores já o têm em mãos), mas o
		// servidor lê id/email do JWT — ver AUTH em user.fn.
		mutationFn: (_user: User) => syncUserEmailFn(),
		onError: (_error) => {},
	})
}
