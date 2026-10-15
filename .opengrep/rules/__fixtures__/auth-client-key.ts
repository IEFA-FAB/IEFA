// Casos de teste de `.opengrep/rules/auth-client-key.yaml`. Não é código do app: fica fora de
// `apps`/`packages` (o `scan:rules` não o lê) e o Biome ignora `__fixtures__`.
//
// Rodar: opengrep test --config .opengrep/rules/auth-client-key.yaml .opengrep/rules/__fixtures__/auth-client-key.ts

import { createAppBrowserClient, createCookieAuthClient, createSsrAuthClient, createStatelessAuthClient, resolveCookieSessionUser } from "@iefa/supabase-kit"

declare const envServer: {
	VITE_SISUB_SUPABASE_URL: string
	VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: string
	SISUB_SUPABASE_SECRET_KEY: string
}
declare const env: { VITE_SISUB_SUPABASE_URL: string; VITE_SISUB_SUPABASE_PUBLISHABLE_KEY: string }
declare const cookieHeader: string | undefined
declare const serviceRoleKey: string
declare const cookies: { getAll(): { name: string; value: string }[]; setAll(): void }

// ruleid: auth-client-secret-key
export const ssr = createSsrAuthClient({ url: envServer.VITE_SISUB_SUPABASE_URL, key: envServer.SISUB_SUPABASE_SECRET_KEY })
// ruleid: auth-client-secret-key
export const cookie = createCookieAuthClient({ url: envServer.VITE_SISUB_SUPABASE_URL, key: envServer.SISUB_SUPABASE_SECRET_KEY, cookies })
// ruleid: auth-client-secret-key
export const session = resolveCookieSessionUser({ url: envServer.VITE_SISUB_SUPABASE_URL, publishableKey: envServer.SISUB_SUPABASE_SECRET_KEY, cookieHeader })
// ruleid: auth-client-secret-key
export const stateless = createStatelessAuthClient({ url: envServer.VITE_SISUB_SUPABASE_URL, publishableKey: process.env.API_SUPABASE_SERVICE_ROLE_KEY ?? "" })
// ruleid: auth-client-secret-key
export const camelCase = resolveCookieSessionUser({ publishableKey: serviceRoleKey, url: "", cookieHeader })
// ruleid: auth-client-secret-key
export const browser = createAppBrowserClient({ url: env.VITE_SISUB_SUPABASE_URL, publishableKey: envServer.SISUB_SUPABASE_SECRET_KEY, schema: "sisub" })

// ok: auth-client-secret-key
export const ssrOk = createSsrAuthClient({ url: envServer.VITE_SISUB_SUPABASE_URL, key: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY })
// ok: auth-client-secret-key
export const sessionOk = resolveCookieSessionUser({ url: envServer.VITE_SISUB_SUPABASE_URL, publishableKey: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY, cookieHeader })
// ok: auth-client-secret-key
export const statelessOk = createStatelessAuthClient({ url: envServer.VITE_SISUB_SUPABASE_URL, publishableKey: envServer.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY })
// ok: auth-client-secret-key
export const browserOk = createAppBrowserClient({ url: env.VITE_SISUB_SUPABASE_URL, publishableKey: env.VITE_SISUB_SUPABASE_PUBLISHABLE_KEY, schema: "sisub" })
