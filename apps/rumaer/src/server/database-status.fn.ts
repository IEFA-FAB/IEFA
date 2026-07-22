import { createServerFn } from "@tanstack/react-start"
import { getRumaerServerClient } from "@/lib/supabase.server"

const DATABASE_HEALTH_TIMEOUT_MS = 3500

// Público por contrato: health check booleano, sem dado de negócio.
// nosemgrep: server-fn-missing-auth-guard
export const checkDatabaseStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<{ status: "ok" }> => {
	const supabase = getRumaerServerClient()
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), DATABASE_HEALTH_TIMEOUT_MS)

	try {
		const { error } = await supabase.from("uniform").select("id").limit(1).abortSignal(controller.signal)

		if (error) {
			throw new Error(error.message)
		}

		return { status: "ok" }
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("database_timeout")
		}

		throw error
	} finally {
		clearTimeout(timeout)
	}
})
