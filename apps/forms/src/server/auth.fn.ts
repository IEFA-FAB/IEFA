import { createServerFn } from "@tanstack/react-start"
import { getIefaAuthClient } from "@/lib/supabase.server"

export const getServerSessionFn = createServerFn({ method: "GET" }).handler(async () => {
	const supabase = getIefaAuthClient()
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
