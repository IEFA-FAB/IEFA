// Casos de teste de `.opengrep/rules/supabase-client-outside-kit.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/supabase-client-outside-kit.yaml .opengrep/rules/__fixtures__/supabase-client-outside-kit.ts
// No modo de teste o Opengrep ignora `paths`; que a regra alcança os arquivos certos é o
// `opengrep-rules.contract.test.ts` do sisub que garante.

import type { Database } from "@iefa/database"
import { createServiceRoleClient, createSsrAuthClient } from "@iefa/supabase-kit"
import * as ssr from "@supabase/ssr"
import { createBrowserClient, createServerClient, createServerClient as makeServerClient } from "@supabase/ssr"
import * as sb from "@supabase/supabase-js"
import { createClient, createClient as createSupabaseClient } from "@supabase/supabase-js"

declare const envServer: {
	VITE_SISUB_SUPABASE_URL: string
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: string
	SISUB_SUPABASE_SECRET_KEY: string
	IEFA_SUPABASE_SECRET_KEY: string
	VITE_IEFA_SUPABASE_URL: string
}
declare function requireEnv(name: string): string
declare const cookies: { getAll(): { name: string; value: string }[]; setAll(): void }
declare const url: string
declare const serviceRoleKey: string
declare const secret: string
declare const sanity: { createClient(options: { projectId: string; token: string }): unknown }
declare const neutralName: string

// O client de sessão dos streams de chat do sisub antes do #625.
export function authClientFromEvent() {
	// ruleid: supabase-secret-client-outside-kit
	return createServerClient<Database, "sisub">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "sisub" },
		cookies,
	})
}

// O client de dados do module-chat antes do #625.
export function dataClient() {
	// ruleid: supabase-secret-client-outside-kit
	return createClient<Database, "kitchen">(envServer.VITE_SISUB_SUPABASE_URL, envServer.SISUB_SUPABASE_SECRET_KEY, {
		db: { schema: "kitchen" },
		auth: { persistSession: false },
	})
}

// `favorites.fn.ts` do portal antes do #628.
// ruleid: supabase-secret-client-outside-kit
export const favorites = createClient(envServer.VITE_IEFA_SUPABASE_URL, envServer.IEFA_SUPABASE_SECRET_KEY, { db: { schema: "iefa" } })
// ruleid: supabase-secret-client-outside-kit
export const fromEnv = createClient(requireEnv("VITE_SISUB_SUPABASE_URL"), requireEnv("SISUB_SUPABASE_SECRET_KEY"))
// ruleid: supabase-secret-client-outside-kit
export const fromProcess = createClient(url, process.env.API_SUPABASE_SERVICE_ROLE_KEY ?? "")
// ruleid: supabase-secret-client-outside-kit
export const camelCase = createClient(url, serviceRoleKey)

// Só um rename no import, e o defeito do #625 voltava sem achado.
// ruleid: supabase-secret-client-outside-kit
export const aliased = createSupabaseClient(url, envServer.SISUB_SUPABASE_SECRET_KEY)
// ruleid: supabase-secret-client-outside-kit
export const aliasedServer = makeServerClient(url, envServer.SISUB_SUPABASE_SECRET_KEY, { cookies })
// ruleid: supabase-secret-client-outside-kit
export const namespaced = sb.createClient(url, envServer.SISUB_SUPABASE_SECRET_KEY)
// ruleid: supabase-secret-client-outside-kit
export const namespacedBrowser = ssr.createBrowserClient(url, serviceRoleKey)
// No navegador, a chave vai para o bundle.
// ruleid: supabase-secret-client-outside-kit
export const browser = createBrowserClient(url, envServer.SISUB_SUPABASE_SECRET_KEY)
// `const secret = envServer.SISUB_SUPABASE_SECRET_KEY` (o `purge-test-fixtures.ts` do sucont).
// ruleid: supabase-secret-client-outside-kit
export const plainSecret = createClient(url, secret)

// ok: supabase-secret-client-outside-kit
export const kitData = createServiceRoleClient({ url: envServer.VITE_SISUB_SUPABASE_URL, secretKey: envServer.SISUB_SUPABASE_SECRET_KEY, schema: "kitchen" })
// ok: supabase-secret-client-outside-kit
export const kitAuth = createSsrAuthClient({ url: envServer.VITE_SISUB_SUPABASE_URL, key: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY })
// Publishable/anon não bypassa RLS: fora do escopo desta regra.
// ok: supabase-secret-client-outside-kit
export const anon = createClient(envServer.VITE_SISUB_SUPABASE_URL, envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY)
// ok: supabase-secret-client-outside-kit
export const ssrAnon = createServerClient(envServer.VITE_SISUB_SUPABASE_URL, envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY, { cookies })
// ok: supabase-secret-client-outside-kit
export const browserAnon = createBrowserClient(url, envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY)
// Mesmo nome, outra biblioteca (Sanity): o import é que ancora.
// ok: supabase-secret-client-outside-kit
export const cms = sanity.createClient({ projectId: "x", token: secret })
// Limite conhecido: a regra lê o NOME da chave, não segue o valor.
// ok: supabase-secret-client-outside-kit
export const neutral = createClient(url, neutralName)
