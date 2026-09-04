/**
 * @module database-status.fn
 * Sonda de saúde do banco, consumida pelo banner do `__root`.
 *
 * @domain external
 * @migration n-a — NÃO migrar para Drizzle. Este fn é o único que existe PARA exercitar o
 * caminho PostgREST: é ele que sustenta o login (GoTrue) e a leitura de permissões PBAC
 * (`getAccessControlClient`), e o banner renderiza inclusive na tela de login, onde nenhuma
 * query Drizzle acontece. Trocar por `getDb()` faria a sonda reportar a saúde do pooler —
 * justamente o caminho que a tela de login não usa — e uma queda do PostgREST (ou um cache
 * de schema não recarregado) passaria despercebida com o usuário travado num login que não
 * tem como funcionar. O deadline também não sobrevive à troca: `abortSignal` corta a
 * requisição REST em 3,5 s, enquanto o postgres-js só oferece `connect_timeout` (5 s em
 * produção, 30 s em dev), que cobre a AQUISIÇÃO da conexão e não uma query lenta.
 *
 * O caminho Drizzle segue sem sonda própria — se ele merecer uma, é um fn NOVO ao lado
 * deste, não a conversão deste.
 */

import { createServerFn } from "@tanstack/react-start"
import { getCoreClient } from "@/lib/supabase.server"

const DATABASE_HEALTH_TIMEOUT_MS = 3500

// Público por contrato: health check booleano, sem dado nenhum. O banner que o consome
// renderiza no __root, inclusive na tela de login.
// nosemgrep: server-fn-missing-auth-guard
export const checkDatabaseStatusFn = createServerFn({ method: "GET" }).handler(async (): Promise<{ status: "ok" }> => {
	const supabase = getCoreClient()
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), DATABASE_HEALTH_TIMEOUT_MS)

	try {
		const { error } = await supabase.from("units").select("id").limit(1).abortSignal(controller.signal)

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
