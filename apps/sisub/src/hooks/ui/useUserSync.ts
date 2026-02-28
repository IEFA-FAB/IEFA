import type { User } from "@supabase/supabase-js"
import { useMutation } from "@tanstack/react-query"
import { syncUserEmailFn } from "@/server/user.fn"

export function useSyncUserEmail() {
	return useMutation({
		mutationFn: (user: User) => syncUserEmailFn({ data: { userId: user.id, email: user.email } }),
		onError: (error) => console.error("Erro ao sincronizar email:", error),
	})
}
