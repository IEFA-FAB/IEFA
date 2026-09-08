## Why

O portal usa `createClient` do `@supabase/supabase-js` com sessão em `localStorage`, causando deslogouts inesperados (expiração silenciosa, sem renovação server-side) e ausência de validação JWT no servidor — qualquer rota "protegida" no portal pode ser acessada em SSR sem credenciais reais. O sisub, por outro lado, usa `@supabase/ssr` com cookies HttpOnly e `createServerFn` para validar JWT no servidor, resultando em sessões duráveis e auth state confiável. Alinhar o portal ao mesmo padrão elimina os deslogouts e fecha a lacuna de segurança.

## What Changes

- **portal** — trocar `createClient` por `createBrowserClient` (`@supabase/ssr`) no cliente
- **portal** — criar `src/lib/supabase.server.ts` com `getSupabaseAuthClient()` (SSR cookie-based) e `getSupabaseServerClient()` (service role)
- **portal** — criar `src/lib/env.server.ts` para variáveis server-only (`PORTAL_SUPABASE_SECRET_KEY`)
- **portal** — criar `src/server/auth.fn.ts` com `getServerSessionFn()` via `createServerFn`
- **portal** — atualizar `src/auth/service.ts` para chamar `getServerSessionFn()` em vez de `supabase.auth.getUser()` diretamente
- **portal** — adicionar `PORTAL_SUPABASE_SECRET_KEY` ao `.env.schema` e `.env`
- **portal** — instalar `@supabase/ssr` como dependência
- **portal + sisub** — adicionar `safeRedirect()` nos guards de rota (`/auth route.tsx`) para prevenir open redirect
- **sisub** — adicionar `safeRedirect()` no `handleSignIn` de `auth/index.tsx`

## Não-objetivos

- Não migrar o sistema PBAC do sisub para o portal (escopos de permissão diferentes)
- Não alterar o design visual da tela de login do portal (Pale Brutalism 2026 permanece)
- Não alterar o schema do banco nem criar novas tabelas
- Não alterar o fluxo de autenticação do sisub (apenas adicionar safeRedirect)
- Não adicionar autenticação por OAuth ou magic link

## Capabilities

### New Capabilities

- `portal-ssr-auth`: Sessão de auth do portal baseada em cookies SSR com validação JWT server-side via `createServerFn`

### Modified Capabilities

_(nenhum spec existente a delta — nenhuma spec pré-existente em openspec/specs/)_

## Impact

- **Apps afetados**: `portal`, `sisub`
- **Dependência nova**: `@supabase/ssr` em `apps/portal/package.json`
- **Env nova**: `PORTAL_SUPABASE_SECRET_KEY` (service role key do Supabase IEFA) — necessária em produção e dev local
- **Arquivos novos no portal**: `src/lib/supabase.server.ts`, `src/lib/env.server.ts`, `src/server/auth.fn.ts`
- **Arquivos modificados no portal**: `src/lib/supabase.ts`, `src/auth/service.ts`, `src/routes/auth/route.tsx`, `.env.schema`
- **Arquivos modificados no sisub**: `src/routes/auth/route.tsx`, `src/routes/auth/index.tsx`
- **Breaking**: nenhum — mudança transparente para o usuário final
