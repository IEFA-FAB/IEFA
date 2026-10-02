import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { getIefaAuthClient } from "@/lib/supabase.server"

// Público por contrato: valida o JWT do request e devolve { user: null } sem sessão.
// nosemgrep: server-fn-missing-auth-guard
export const getServerSessionFn = createServerFn({ method: "GET" })
	.validator(z.object({}))
	.handler(async () => {
		const supabase = getIefaAuthClient()
		// Só getUser(): valida o JWT contra o Supabase. A sessão (access/refresh token) NÃO volta
		// daqui: ia serializada no HTML do SSR e no cache do React Query, ao alcance de qualquer
		// script da página. O navegador mantém a própria sessão pelo supabase-js
		// (onAuthStateChange). Mesmo desenho do sucont.
		const {
			data: { user },
		} = await supabase.auth.getUser()
		return { user: user ?? null }
	})
