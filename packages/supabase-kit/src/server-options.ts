/**
 * @module server-options
 * Opções de auth de todo client de servidor montado com `createClient` do supabase-js: os do kit
 * e os que os apps ainda montam direto (exportada na raiz do pacote).
 *
 * - `persistSession: false`: a sessão, quando existe, vive só na memória do client do request.
 * - `autoRefreshToken: false`: com a opção ligada (o default do supabase-js), fora do navegador o
 *   `initialize()` do GoTrueClient chama `startAutoRefresh()`, que arma um `setInterval` de 30 s
 *   e nunca é desarmado. Como o intervalo segura o client, um client por request vira um timer e
 *   um client vivos por request, para sempre (auth-js 2.117, `_handleVisibilityChange`).
 * - `detectSessionInUrl: false`: não há URL de callback no servidor.
 *
 * O `createServerClient` do `@supabase/ssr` (0.12) já força `autoRefreshToken` e
 * `detectSessionInUrl` em `false` (e a sessão em cookie) DEPOIS de espalhar as opções do
 * chamador, e ainda passa `skipAutoInitialize: true`; por isso os clients SSR do kit
 * (`createSsrAuthClient`, `createCookieAuthClient`) não recebem esta constante.
 */
export const SERVER_AUTH_OPTIONS = {
	persistSession: false,
	autoRefreshToken: false,
	detectSessionInUrl: false,
} as const
