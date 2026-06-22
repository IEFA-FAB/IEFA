import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getIefaAuthClient } from "@/lib/supabase.server"

export const getServerSessionFn = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async () => {
		const supabase = getIefaAuthClient()
		const [
			{
				data: { user },
			},
			{
				data: { session },
			},
		] = await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()])
		return {
			user: user ?? null,
			session: session ?? null,
		}
	})
