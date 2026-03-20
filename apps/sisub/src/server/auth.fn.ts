import { createServerFn } from "@tanstack/react-start"
import { getSupabaseServerClient } from "@/lib/supabase.server"

export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getSupabaseServerClient()
	// getUser() valida o token no servidor Supabase — não usa localStorage
	const {
		data: { user },
	} = await supabase.auth.getUser()
	const {
		data: { session },
	} = await supabase.auth.getSession()

	return {
		user: user ?? null,
		session: session ?? null,
	}
})
