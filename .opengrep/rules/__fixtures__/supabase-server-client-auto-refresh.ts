// Casos de teste de `.opengrep/rules/supabase-server-client-auto-refresh.yaml`. Não é código do app:
// fica fora de `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/supabase-server-client-auto-refresh.yaml .opengrep/rules/__fixtures__/supabase-server-client-auto-refresh.ts
// No modo de teste o Opengrep ignora `paths`; que a regra alcança os arquivos certos é o
// `opengrep-rules.contract.test.ts` do sisub que garante.

import { SERVER_AUTH_OPTIONS } from "@iefa/supabase-kit"
import { createServerClient } from "@supabase/ssr"
import * as sb from "@supabase/supabase-js"
import { createClient, createClient as createSupabaseClient } from "@supabase/supabase-js"

declare const url: string
declare const key: string
declare const options: object
declare const cookies: { getAll(): { name: string; value: string }[]; setAll(): void }
declare const sanity: { createClient(options: { projectId: string }): unknown }

// Os clients da api antes do #645: `persistSession: false` sozinho não desliga o timer.
export function priceResearchClient() {
	// ruleid: supabase-server-client-auto-refresh
	return createClient(url, key, {
		db: { schema: "procurement" },
		auth: { persistSession: false },
	})
}
// Sem opções nenhuma.
// ruleid: supabase-server-client-auto-refresh
export const bare = createClient(url, key)
// Sem `auth`.
// ruleid: supabase-server-client-auto-refresh
export const noAuth = createClient(url, key, { db: { schema: "kitchen" } })
// Ligado de propósito também conta.
// ruleid: supabase-server-client-auto-refresh
export const explicitOn = createClient(url, key, { auth: { autoRefreshToken: true } })
// Opções por variável: a regra não segue o valor.
// ruleid: supabase-server-client-auto-refresh
export const viaVariable = createClient(url, key, options)
// ruleid: supabase-server-client-auto-refresh
export const aliased = createSupabaseClient(url, key, { auth: { persistSession: false } })
// ruleid: supabase-server-client-auto-refresh
export const namespaced = sb.createClient(url, key)

// ok: supabase-server-client-auto-refresh
export const fixed = createClient(url, key, { db: { schema: "procurement" }, auth: { persistSession: false, autoRefreshToken: false } })
// A constante do kit (#645).
// ok: supabase-server-client-auto-refresh
export const kitOptions = createClient(url, key, { db: { schema: "kitchen", retry: false }, auth: SERVER_AUTH_OPTIONS })
// ok: supabase-server-client-auto-refresh
export const spread = createClient(url, key, { auth: { ...SERVER_AUTH_OPTIONS, storageKey: "x" } })
// ok: supabase-server-client-auto-refresh
export const aliasedOk = createSupabaseClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
// ok: supabase-server-client-auto-refresh
export const namespacedOk = sb.createClient(url, key, { auth: SERVER_AUTH_OPTIONS })
// O client SSR força o auto-refresh desligado no servidor.
// ok: supabase-server-client-auto-refresh
export const ssr = createServerClient(url, key, { cookies })
// Mesmo nome, outra biblioteca.
// ok: supabase-server-client-auto-refresh
export const cms = sanity.createClient({ projectId: "x" })
