/**
 * @module server-options
 * Opções de auth comuns aos clients de servidor do kit que usam `createClient` direto.
 *
 * - `persistSession: false`: a sessão, quando existe, vive só na memória do client do request.
 * - `autoRefreshToken: false`: com a opção ligada (o default do supabase-js), fora do navegador o
 *   `initialize()` do GoTrueClient chama `startAutoRefresh()`, que arma um `setInterval` de 30 s
 *   e nunca é desarmado. Como o intervalo segura o client, um client por request vira um timer e
 *   um client vivos por request, para sempre (auth-js 2.117, `_handleVisibilityChange`).
 * - `detectSessionInUrl: false`: não há URL de callback no servidor.
 *
 * O `createServerClient` do `@supabase/ssr` já força os três (`autoRefreshToken`,
 * `detectSessionInUrl` e a persistência em cookie) depois de espalhar as opções do chamador;
 * por isso o client SSR não recebe esta constante.
 */
export const SERVER_AUTH_OPTIONS = {
	persistSession: false,
	autoRefreshToken: false,
	detectSessionInUrl: false,
} as const
