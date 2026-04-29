## 1. Dependência e variáveis de ambiente

- [ ] 1.1 [portal] Instalar `@supabase/ssr` — `bun add @supabase/ssr --filter @iefa/portal`
- [ ] 1.2 [portal] Adicionar `PORTAL_SUPABASE_SECRET_KEY=` ao `apps/portal/.env.schema` com comentário `# @sensitive @required`
- [ ] 1.3 [portal] Adicionar `PORTAL_SUPABASE_SECRET_KEY` ao `apps/portal/.env` local (valor real da service role key do projeto Supabase IEFA)
- [ ] 1.4 [portal] Criar `src/lib/env.server.ts` — schema Zod com `process.env.PORTAL_SUPABASE_SECRET_KEY` + `process.env.VITE_IEFA_SUPABASE_URL`, falha ruidosa se ausente (espelhar `apps/sisub/src/lib/env.server.ts`)

## 2. Clientes Supabase do portal

- [ ] 2.1 [portal] Atualizar `src/lib/supabase.ts` — trocar `createClient` por `createBrowserClient` do `@supabase/ssr`; remover opções `auth.persistSession` e `auth.storageKey` (não usadas no `createBrowserClient`); manter `portalDb()` e `journalDb()` intactos
- [ ] 2.2 [portal] Criar `src/lib/supabase.server.ts` com dois exports:
  - `getSupabaseAuthClient()` — `createServerClient` com `cookies.getAll/setAll` via `getRequest()`/`setCookie` do `@tanstack/react-start/server`
  - `getSupabaseServerClient()` — `createClient` com `PORTAL_SUPABASE_SECRET_KEY` e `auth.persistSession: false` (service role, para queries futuras)

## 3. Server function de autenticação

- [ ] 3.1 [portal] Criar diretório `src/server/`
- [ ] 3.2 [portal] Criar `src/server/auth.fn.ts` com `getServerSessionFn` — `createServerFn({ method: "GET" }).handler(async () => { ... })` que chama `getSupabaseAuthClient().auth.getUser()` e `.auth.getSession()`, retorna `{ user, session }` (null se não autenticado, nunca lança)

## 4. Atualizar service de auth do portal

- [ ] 4.1 [portal] Atualizar `src/auth/service.ts` — substituir chamada a `supabase.auth.getUser()` + `supabase.auth.getSession()` dentro de `authQueryOptions.queryFn` pela chamada `getServerSessionFn()` (espelhar `apps/sisub/src/auth/service.ts`)
- [ ] 4.2 [portal] Verificar que `authActions` (signIn, signUp, signOut, etc.) ainda usam o cliente browser `supabase` de `@/lib/supabase` — sem mudança necessária ali

## 5. safeRedirect — utilitário e guards de rota

- [ ] 5.1 [portal] Criar `src/lib/auth-utils.ts` com `safeRedirect(target?: string | null, fallback?: string): string` — target válido = começa com `/` e não começa com `//`
- [ ] 5.2 [portal] Atualizar `src/routes/auth/route.tsx` — substituir `search.redirect || "/"` por `safeRedirect(search.redirect, "/")`
- [ ] 5.3 [sisub] Criar `src/lib/auth-utils.ts` com a mesma função `safeRedirect` (copiar de portal)
- [ ] 5.4 [sisub] Atualizar `src/routes/auth/route.tsx` linha 29 — substituir `search.redirect || "/hub"` por `safeRedirect(search.redirect, "/hub")`
- [ ] 5.5 [sisub] Atualizar `src/routes/auth/index.tsx` linha 111 (`handleSignIn`) — substituir `search.redirect || "/hub"` por `safeRedirect(search.redirect, "/hub")`

## 6. Validação e limpeza

- [ ] 6.1 [portal] Verificar que `AuthSync` em `__root.tsx` ainda funciona corretamente — `supabase.auth.onAuthStateChange` deve usar o `createBrowserClient` (importado de `@/lib/supabase`); nenhuma mudança necessária no componente
- [ ] 6.2 [portal] Verificar que `src/routes/journal/editorial/route.tsx` e demais `beforeLoad` que chamam `authQueryOptions()` continuam funcionando — sem mudança necessária neles
- [ ] 6.3 [portal + sisub] Rodar `bun run check` na raiz do monorepo — corrigir qualquer erro de Biome/typecheck
- [ ] 6.4 [portal] Teste manual: login → reload → navegar para rota protegida → logout → confirmar sem deslogout inesperado
- [ ] 6.5 [portal] Teste manual: tentar `?redirect=https://evil.com` na URL → confirmar redirect para `/`
