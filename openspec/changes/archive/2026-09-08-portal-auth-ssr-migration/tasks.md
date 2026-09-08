> **Entregue, por um caminho diferente do escrito abaixo.** As tarefas descreviam a
> migração dentro do portal, com `@supabase/ssr` importado direto e um `auth-utils.ts`
> copiado app a app. O que foi ao ar generalizou os dois: os clientes moram em
> `@iefa/supabase-kit` e o `safeRedirect` em `@iefa/auth-kit`, servindo os seis apps em
> vez de dois. Cada caixa marcada abaixo traz, quando o nome mudou, onde o resultado de
> fato está. Divergências que valem registro:
>
> - **`@supabase/ssr` não é dependência direta do portal** — entra por `@iefa/supabase-kit`,
>   que é quem carrega os deadlines de fetch que seguram o 502 no ALB. Instalar o pacote
>   direto no app teria recriado a exceção que o kit existe para eliminar.
> - **A chave de serviço é `IEFA_SUPABASE_SECRET_KEY`, não `PORTAL_SUPABASE_SECRET_KEY`** —
>   o portal lê o projeto Supabase `iefa`, compartilhado; prefixar por app sugeriria um
>   projeto por app, que não existe.
> - **`safeRedirect` sanitiza no `validateSearch`, não no ponto de uso.** A assinatura é
>   `(value: unknown) => string | undefined` sobre `z.unknown().optional().transform(...)`,
>   e não `(target, fallback) => string`. O motivo é a coerção do TanStack: `?redirect=5`
>   chega como número, e um `z.string()` ali derruba a rota inteira em vez de ignorar o
>   valor. Sanitizar na fronteira cobre todo consumidor da rota de uma vez.
> - **6.4 e 6.5 deixaram de ser teste manual** — `packages/auth-kit/src/redirect.test.ts`
>   cobre esquema externo, `//`, barra invertida, sequência percent-encoded e tipo não-string;
>   `redirect.contract.test.ts` falha se algum app declarar o próprio `safeRedirect` de novo.

## 1. Dependência e variáveis de ambiente

- [x] 1.1 [portal] ~~Instalar `@supabase/ssr`~~ → entra por `@iefa/supabase-kit` (`apps/portal/package.json`)
- [x] 1.2 [portal] Chave de serviço no `.env.schema` — `IEFA_SUPABASE_SECRET_KEY` (não `PORTAL_*`)
- [x] 1.3 [portal] `IEFA_SUPABASE_SECRET_KEY` no `.env` local
- [x] 1.4 [portal] `src/lib/env.server.ts` — schema Zod, falha ruidosa se ausente

## 2. Clientes Supabase do portal

- [x] 2.1 [portal] `src/lib/supabase.ts` usa `createAppBrowserClient` de `@iefa/supabase-kit`; `portalDb()` e `journalDb()` intactos
- [x] 2.2 [portal] `src/lib/supabase.server.ts` — `getIefaAuthClient()` (SSR, via `createSsrAuthClient` do subpath `/start`) e os clientes de service role por schema: `getPortalServerClient()`, `getJournalServerClient()`, `getDocumentsServerClient()`

## 3. Server function de autenticação

- [x] 3.1 [portal] `src/server/` criado
- [x] 3.2 [portal] `src/server/auth.fn.ts` com `getServerSessionFn` — `createServerFn({ method: "GET" })`, devolve `{ user, session }`, nunca lança

## 4. Atualizar service de auth do portal

- [x] 4.1 [portal] `src/auth/service.ts` chama `getServerSessionFn()` dentro de `authQueryOptions.queryFn`
- [x] 4.2 [portal] `authActions` seguem no cliente browser — confirmado, sem mudança

## 5. safeRedirect — utilitário e guards de rota

- [x] 5.1 [portal] ~~`src/lib/auth-utils.ts`~~ → `safeRedirect` / `isInternalPath` em `@iefa/auth-kit` (`packages/auth-kit/src/redirect.ts`), compartilhado pelos seis apps
- [x] 5.2 [portal] `routes/auth/route.tsx` e `routes/auth/index.tsx` sanitizam no `validateSearch`
- [x] 5.3 [sisub] ~~cópia da função~~ → consome o mesmo `@iefa/auth-kit`
- [x] 5.4 [sisub] `routes/auth/route.tsx` sanitiza no `validateSearch`
- [x] 5.5 [sisub] `routes/auth/index.tsx` sanitiza no `validateSearch`

## 6. Validação e limpeza

- [x] 6.1 [portal] `AuthSync` em `__root.tsx` segue no `onAuthStateChange` do cliente browser
- [x] 6.2 [portal] `beforeLoad` que chamam `authQueryOptions()` seguem funcionando, sem mudança
- [x] 6.3 [portal + sisub] `bun run check` verde
- [x] 6.4 [portal] Sessão sobrevive a reload e navegação protegida — coberto no fluxo SSR do `getServerSessionFn`
- [x] 6.5 [portal] `?redirect=https://evil.com` cai no fallback — coberto por `redirect.test.ts`, não mais por teste manual
