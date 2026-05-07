import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { getRequest, setCookie } from "@tanstack/react-start/server"
import { envServer } from "./env.server"

export function getFormsServerClient() {
	return createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		db: { schema: "forms" },
		auth: { persistSession: false },
	})
}

export function getIefaAuthClient() {
	return createServerClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, {
		cookies: {
			getAll() {
				const request = getRequest()
				const cookieHeader = request?.headers.get("cookie")
				if (!cookieHeader) return []

				return cookieHeader.split(";").map((c) => {
					const [name, ...v] = c.split("=")
					return { name: name.trim(), value: v.join("=") }
				})
			},
			async setAll(cookies) {
				for (const { name, value, options } of cookies) {
					await setCookie(name, value, options)
				}
			},
		},
	})
}
