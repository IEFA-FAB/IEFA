## Why

13+ arquivos de server functions em `apps/sisub/src/server/` executam escritas via `getSupabaseServerClient()` (service role, bypassa RLS) sem verificar se o chamador está autenticado. Em particular, `forecast.fn.ts` aceita `userId` no body do request — um cliente malicioso pode manipular previsões de outro usuário. A correção é urgente: o app está em produção e qualquer request forjado pode alterar dados organizacionais (ingredientes, políticas, hierarquia de unidades) ou pessoais (previsões de refeição, presenças).

## What Changes

- **Extrair `requireUserId()`** para `src/lib/auth.server.ts` (atualmente duplicado inline em 3 arquivos)
- **Adicionar `requireAuth()`** em todas as server functions de mutação que fazem queries diretas ao Supabase sem delegação ao domain layer (~30 handlers em 12 arquivos)
- **Adicionar `requireUserId()`** em server functions user-scoped e **substituir `data.userId` por userId derivado do JWT** em `forecast.fn.ts` e `evaluation.fn.ts` (fix de trust issue)
- **Deduplicar auth inline** — remover implementações locais de `requireUserId()` e `getCurrentUser()` em `analytics-chat.fn.ts`, `module-chat.fn.ts`, `mcp-keys.fn.ts`

## Não-objetivos

- Migrar server functions que fazem queries diretas para o domain layer (`@iefa/sisub-domain`) — isso é refatoração futura
- Implementar RBAC granular por endpoint (o guard garante autenticação; permissões granulares ficam no domain layer quando migrado)
- Adicionar testes automatizados para os guards (será coberto em change separada de vitest)

## Capabilities

### New Capabilities

- `server-auth-guards`: Garantir que toda server function de mutação em `apps/sisub` valide autenticação via JWT antes de executar escritas no banco

### Modified Capabilities

(nenhuma — não há specs existentes)

## Impact

- **App afetado:** sisub
- **Código:** 16 arquivos em `apps/sisub/src/server/*.fn.ts` + `src/lib/auth.server.ts`
- **API:** Endpoints de mutação passam a retornar 401 para requests não-autenticados (antes executavam silenciosamente)
- **Breaking:** Nenhum para usuários autenticados. Clientes que dependem de `userId` no body de `forecast.fn.ts` e `evaluation.fn.ts` precisam remover esse campo (o servidor ignora e usa o JWT) — **BREAKING** para integrações externas que enviem userId manualmente
- **Dependências:** Nenhuma nova — usa `getSupabaseAuthClient()` já existente em `auth.server.ts`
