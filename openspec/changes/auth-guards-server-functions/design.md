## Context

O sisub usa TanStack Start server functions como camada de backend. Existem dois padrões de auth estabelecidos:

1. **`requireAuth()`** (`src/lib/auth.server.ts`) — valida JWT via `getSupabaseAuthClient().auth.getUser()`, resolve permissões PBAC via `resolveUserPermissions()`, retorna `{ userId, permissions }`. Usado em server functions que delegam ao domain layer (`@iefa/sisub-domain`).

2. **`requireUserId()`** (inline em `analytics-chat.fn.ts`, `module-chat.fn.ts`) — valida JWT e retorna apenas `userId` (string). Usado em operações user-scoped que fazem queries diretas ao Supabase com `WHERE user_id = ?`.

O problema: ~30 handlers de mutação em 12+ arquivos `.fn.ts` não usam nenhum dos dois. Todos usam `getSupabaseServerClient()` que opera com service role (bypassa RLS). Sem auth guard, qualquer request HTTP pode modificar dados.

Caso mais crítico: `forecast.fn.ts` aceita `userId` no body — permite impersonation.

## Goals / Non-Goals

**Goals:**
- Toda server function de mutação (POST) valida autenticação antes de executar
- `requireUserId()` centralizado em `auth.server.ts` (eliminar 3 implementações inline)
- `userId` em mutations user-scoped derivado do JWT, nunca do body do request
- Zero breaking changes para o frontend (ajustes de chamada são internos)

**Non-Goals:**
- Migrar server functions diretas para o domain layer (refatoração futura)
- Implementar autorização granular (RBAC) nos endpoints que fazem queries diretas
- Adicionar testes automatizados (change separada)
- Alterar schema do banco de dados

## Decisions

### D1: Dois níveis de guard — `requireAuth()` vs `requireUserId()`

**Decisão:** Manter dois utilitários com propósitos distintos.

- `requireAuth()` → para operações admin/domain (modifica dados organizacionais: ingredientes, políticas, hierarquia). Retorna `UserContext` com permissões PBAC para futuro uso no domain layer.
- `requireUserId()` → para operações user-scoped (previsões, presenças, chat sessions). Retorna apenas `string`. Mais leve — não resolve permissões.

**Alternativa considerada:** Usar `requireAuth()` em todos os endpoints. Rejeitado porque `resolveUserPermissions()` faz query adicional ao banco — overhead desnecessário para endpoints que só precisam do userId.

### D2: Extrair `requireUserId()` para `auth.server.ts`

**Decisão:** Mover para `src/lib/auth.server.ts` ao lado de `requireAuth()`. Mensagem de erro padronizada para `"UNAUTHORIZED"` (consistente com `requireAuth()`).

```ts
export async function requireUserId(): Promise<string> {
  const { data: { user } } = await getSupabaseAuthClient().auth.getUser()
  if (!user) throw new Error("UNAUTHORIZED")
  return user.id
}
```

**Alternativa:** Criar um `requireUser()` que retorna o User completo (necessário em `mcp-keys.fn.ts` para `user.id` e `user.email`). Decisão: por enquanto `requireUserId()` basta — `mcp-keys.fn.ts` pode chamar `getSupabaseAuthClient().auth.getUser()` diretamente para o email, ou adicionamos `requireUser()` se mais de 1 arquivo precisar.

### D3: Substituir `data.userId` por JWT em forecast.fn.ts

**Decisão:** Nas mutations (`upsertForecastFn`, `deleteForecastFn`, `persistDefaultMessHallFn`), o `userId` será derivado do JWT via `requireUserId()`. O campo `userId` será removido do schema Zod do input.

Para as queries (`fetchMealForecastsFn`, `fetchUserDefaultMessHallFn`), mantemos `data.userId` no input porque o frontend pode precisar consultar dados durante SSR onde o userId vem do contexto de auth da rota. Porém adicionamos `requireUserId()` para garantir que o chamador está autenticado.

**Alternativa:** Substituir `data.userId` também nos GETs. Rejeitado — queries via GET são menos críticas e o pattern existente de SSR pode depender de passar userId explicitamente.

### D4: `presence.fn.ts` — guard sem substituir user_id

**Decisão:** Adicionar `requireUserId()` como guard (verificar que o chamador está autenticado), mas manter `data.user_id` no body. Motivo: fiscais inserem presenças para outros usuários — o `user_id` no body é o militar que teve presença registrada, não necessariamente o fiscal que opera.

### D5: Pattern para server functions diretas (sem domain layer)

**Decisão:** Para handlers que fazem queries diretas ao Supabase (sem delegar ao domain layer):

```ts
.handler(async ({ data }) => {
  await requireAuth()  // guard only — ignora retorno
  const { data: result, error } = await getSupabaseServerClient()...
})
```

O `await requireAuth()` garante autenticação. O retorno (`UserContext`) é descartado porque não há lógica de permissão implementada nesses endpoints (non-goal desta change).

## Risks / Trade-offs

- **[Risk] Frontend envia `userId` em forecast mutations que será ignorado** → Mitigação: Remover `userId` do input schema Zod. O frontend receberá erro de validação se ainda enviar o campo — forçando atualização dos hooks que chamam essas functions. Ajuste necessário em `useMealForecast.ts`.

- **[Risk] `presence.fn.ts` mantém user_id do body (fiscal officer pattern)** → Mitigação: O guard garante que pelo menos o chamador é autenticado. Autorização granular (verificar se o chamador TEM permissão de fiscal) é non-goal desta change.

- **[Risk] Overhead de latência por chamar `auth.getUser()` em cada request** → Trade-off aceitável. `getUser()` valida o JWT localmente (sem round-trip ao Supabase Auth se o token estiver no cache). Custo: ~1-5ms por request.

- **[Risk] Queries GET sem guard (changelog, nutrients, etc.)** → Decisão consciente: dados públicos/read-only não precisam de auth. Apenas mutations recebem guard.
