## Context

O portal atualmente usa `createClient` do `@supabase/supabase-js` com `persistSession: true` e `storageKey: "auth_iefa"`, armazenando o JWT em `localStorage`. Isso cria dois problemas:

1. **Deslogouts inesperados**: O token expira silenciosamente no servidor sem ser renovado — `getUser()` e `getSession()` são chamados no browser, não no servidor. Quando o Nitro SSR renderiza uma rota protegida, não há cookie de sessão para validar, então o SSR retorna estado "não autenticado" e o cliente tenta reconciliar, resultando em flash ou redirect inesperado.

2. **Sem validação server-side real**: O `authQueryOptions` atual chama `supabase.auth.getUser()` no browser. Durante SSR, esse código executa no Nitro sem acesso ao `localStorage` do usuário — retorna `user: null` sempre, forçando o router a tratar o usuário como anônimo no primeiro render.

O sisub resolve isso com `@supabase/ssr`: o JWT fica em cookies HttpOnly, o `createServerFn` lê os cookies via `getRequest()`, valida com `auth.getUser()` no servidor Supabase, e retorna a sessão real. O browser e o servidor chegam ao mesmo estado na primeira renderização.

## Goals / Non-Goals

**Goals:**
- Portal usa cookies HttpOnly (via `@supabase/ssr`) para sessão — sem `localStorage`
- `authQueryOptions` chama `getServerSessionFn()` — validação JWT real no servidor
- Cookies renovados automaticamente pelo `setAll` do `createServerClient` — sem expiração silenciosa
- `safeRedirect()` em todos os guards de rota (`/auth route.tsx`) do portal e sisub
- Paridade de padrões de código entre portal e sisub (mesmas convenções de arquivo)

**Non-Goals:**
- Não migrar PBAC para o portal
- Não alterar o visual de login do portal
- Não alterar schema de banco
- Não unificar os dois Supabase projects (sisub usa `VITE_SISUB_SUPABASE_*`, portal usa `VITE_IEFA_SUPABASE_*`)

## Decisions

### 1. `@supabase/ssr` em vez de `@supabase/supabase-js` puro

**Decisão**: Adicionar `@supabase/ssr` ao portal e usar `createBrowserClient` no cliente e `createServerClient` no servidor.

**Alternativa considerada**: Implementar renovação manual de token via `onAuthStateChange` + refresh periódico com `createClient`. Descartado: frágil, não resolve o SSR mismatch, aumenta complexidade sem garantias.

**Razão**: `@supabase/ssr` foi projetado exatamente para este caso — isomorfismo cookie/localStorage entre cliente e servidor. Já é a solução usada no sisub com sucesso.

---

### 2. `createServerFn` para validação server-side

**Decisão**: `getServerSessionFn` no portal segue o mesmo padrão do sisub — `createServerFn({ method: "GET" }).handler(...)` sem `.inputValidator()` (não há input).

**Alternativa considerada**: Chamar `supabase.auth.getUser()` diretamente dentro de `beforeLoad` (sem server function). Descartado: `beforeLoad` no TanStack Router executa tanto no cliente quanto no servidor; sem `createServerFn`, não há garantia de que o código de cookie handling rode apenas no servidor.

**Razão**: `createServerFn` garante execução server-only, acesso correto a `getRequest()` do Nitro, e cache automático do TanStack Query no SSR via `setupRouterSsrQueryIntegration` (já configurado em `router.tsx`).

---

### 3. Dois clientes Supabase no portal (igual ao sisub)

**Decisão**: Manter `src/lib/supabase.ts` (browser, `createBrowserClient`) + criar `src/lib/supabase.server.ts` (server, dois exports: `getSupabaseAuthClient` e `getSupabaseServerClient`).

- `getSupabaseAuthClient()` — `createServerClient` com cookies — para validar JWT em `auth.fn.ts`
- `getSupabaseServerClient()` — `createClient` com service role — para queries de dados em server functions futuras

**Alternativa considerada**: Um único cliente universal. Descartado: service role key não pode vazar para o browser; e o cliente SSR com cookies não pode ser singleton (cada request tem seus próprios cookies).

---

### 4. `env.server.ts` para variáveis server-only

**Decisão**: Criar `src/lib/env.server.ts` com `process.env` (não `import.meta.env`) para `PORTAL_SUPABASE_SECRET_KEY`.

**Razão**: Nitro não injeta `import.meta.env` em handlers de server functions (mesmo comportamento do sisub). `process.env` funciona corretamente em ambos os ambientes (dev Vite + Nitro prod).

---

### 5. `safeRedirect()` como função utilitária local

**Decisão**: Implementar `safeRedirect(target, fallback)` em `src/lib/auth-utils.ts` (portal) e `src/lib/auth-utils.ts` (sisub) — reutilizável pelos guards de rota.

**Alternativa considerada**: Inline a função em cada arquivo. Descartado: duplicação desnecessária, mais difícil de auditar a segurança.

**Regra**: target válido = começa com `/` e não começa com `//`. Previne redirect para domínios externos.

## Risks / Trade-offs

| Risco | Mitigação |
|-------|-----------|
| `PORTAL_SUPABASE_SECRET_KEY` não configurada em produção → crash no start | Validação no `env.server.ts` com `z.string().min(1)` — falha ruidosa, não silenciosa |
| `localStorage` ainda presente após migração (token antigo) | `createBrowserClient` ignora `localStorage`; Supabase limpa automaticamente no próximo `signOut` |
| `AuthSync` no `__root.tsx` usa `supabase` importado diretamente — precisa ser o `createBrowserClient` | Importar de `@/lib/supabase` que agora retorna `createBrowserClient` — transparente |
| `portalDb()` e `journalDb()` usam o mesmo cliente browser | Sem mudança de comportamento — `schema()` continua funcionando com `createBrowserClient` |

## Migration Plan

1. Instalar `@supabase/ssr` no portal (`bun add @supabase/ssr -w --filter @iefa/portal`)
2. Adicionar `PORTAL_SUPABASE_SECRET_KEY` ao `.env` local e ao ambiente de produção (Fly.io secrets)
3. Criar `env.server.ts`, `supabase.server.ts`, `server/auth.fn.ts`
4. Atualizar `supabase.ts` → `createBrowserClient`
5. Atualizar `auth/service.ts` → `getServerSessionFn()`
6. Adicionar `safeRedirect` nos guards de rota (portal + sisub)
7. Teste local: login, reload, navigate entre rotas protegidas, expiração
8. Deploy — sem downtime (mudança de storage de sessão é transparente; usuário faz login normalmente na próxima visita)

**Rollback**: Reverter `supabase.ts` para `createClient` e `auth/service.ts` para `getUser()` direto. Sessões antigas em `localStorage` continuam funcionando.

## Open Questions

- **Service role key do portal**: A `PORTAL_SUPABASE_SECRET_KEY` é a service role key do mesmo projeto Supabase usado pela `VITE_IEFA_SUPABASE_URL`? Sim — mesma instância, schema `iefa`/`journal`. Confirmar que o valor já existe no Fly.io secrets ou precisa ser adicionado.
- **Cookie domain**: Em dev local (porta 3000), os cookies de sessão do Supabase SSR funcionam sem configuração extra. Em produção (domínio próprio), o `createServerClient` usa o domínio do request automaticamente — sem ação necessária.
