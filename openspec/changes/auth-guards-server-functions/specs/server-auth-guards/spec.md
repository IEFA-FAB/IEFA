## ADDED Requirements

### Requirement: Shared auth utilities in auth.server.ts
O módulo `src/lib/auth.server.ts` DEVE exportar `requireUserId()` que valida o JWT do request e retorna o `userId` (string). DEVE lançar `Error("UNAUTHORIZED")` se o JWT estiver ausente ou inválido. A implementação DEVE usar `getSupabaseAuthClient().auth.getUser()`.

#### Scenario: JWT válido retorna userId
- **WHEN** um request autenticado chama uma server function que usa `requireUserId()`
- **THEN** o sistema retorna o `user.id` extraído do JWT sem erro

#### Scenario: JWT ausente retorna 401
- **WHEN** um request sem JWT (cookie de sessão ausente) chama uma server function que usa `requireUserId()`
- **THEN** o sistema lança `Error("UNAUTHORIZED")` e o TanStack Start retorna HTTP 401

#### Scenario: JWT inválido retorna 401
- **WHEN** um request com JWT expirado ou malformado chama uma server function que usa `requireUserId()`
- **THEN** o sistema lança `Error("UNAUTHORIZED")` e o TanStack Start retorna HTTP 401

### Requirement: Auth guard em mutations admin/domain
Toda server function de mutação (POST) que modifica dados organizacionais (ingredientes, políticas, hierarquia de places, produção, configurações de unidade/cozinha, ATAs, ARPs, chaves MCP, kitchen drafts, avaliações admin) DEVE chamar `requireAuth()` no início do `.handler()` antes de qualquer operação de escrita no banco.

#### Scenario: Mutation admin com usuário autenticado executa normalmente
- **WHEN** um usuário autenticado chama `createIngredientFn` com dados válidos
- **THEN** o sistema valida o JWT, executa a operação e retorna o resultado

#### Scenario: Mutation admin sem autenticação é rejeitada
- **WHEN** um request não-autenticado chama `updatePlacesEntityFn`
- **THEN** o sistema rejeita com HTTP 401 sem executar nenhuma escrita no banco

#### Scenario: Mutation admin com JWT inválido é rejeitada
- **WHEN** um request com JWT expirado chama `deletePolicyRuleFn`
- **THEN** o sistema rejeita com HTTP 401 sem executar nenhuma escrita no banco

### Requirement: Auth guard em mutations user-scoped
Toda server function de mutação (POST) que modifica dados pessoais do usuário (previsões de refeição, presenças, avaliações) DEVE chamar `requireUserId()` no início do `.handler()`.

#### Scenario: Forecast mutation com usuário autenticado
- **WHEN** um usuário autenticado chama `upsertForecastFn`
- **THEN** o sistema valida o JWT e executa a operação usando o userId do JWT

#### Scenario: Forecast mutation sem autenticação
- **WHEN** um request não-autenticado chama `deleteForecastFn`
- **THEN** o sistema rejeita com HTTP 401

### Requirement: userId derivado do JWT em forecast mutations
As server functions `upsertForecastFn`, `deleteForecastFn` e `persistDefaultMessHallFn` DEVEM derivar o `userId` do JWT via `requireUserId()`. O campo `userId` DEVE ser removido do schema de input Zod dessas functions. O frontend NÃO DEVE enviar `userId` no body dessas mutations.

#### Scenario: Forecast upsert usa userId do JWT
- **WHEN** um usuário autenticado chama `upsertForecastFn` com `{ date, meal, willEat, messHallId }`
- **THEN** o sistema usa o userId extraído do JWT para o `user_id` na escrita do banco

#### Scenario: Frontend que envia userId recebe erro de validação
- **WHEN** o frontend envia `{ userId: "x", date, meal, willEat, messHallId }` para `upsertForecastFn`
- **THEN** o Zod inputValidator rejeita o campo extra (strict mode) ou o campo é ignorado

### Requirement: userId derivado do JWT em evaluation submission
A server function `submitEvaluationFn` DEVE derivar o `userId` do JWT via `requireUserId()` em vez de aceitar `data.userId` do body do request.

#### Scenario: Evaluation submission usa userId do JWT
- **WHEN** um usuário autenticado submete uma avaliação
- **THEN** o sistema grava a avaliação com o userId extraído do JWT, ignorando qualquer userId no body

### Requirement: Presence mutations exigem autenticação
As server functions `insertPresenceFn` e `deletePresenceFn` DEVEM chamar `requireUserId()` como guard de autenticação. O campo `user_id` no body DEVE ser mantido (fiscais registram presença para outros usuários).

#### Scenario: Fiscal autenticado registra presença para outro militar
- **WHEN** um fiscal autenticado chama `insertPresenceFn` com `{ user_id: "outro-militar", ... }`
- **THEN** o sistema valida o JWT do fiscal e executa a inserção com o `user_id` do body

#### Scenario: Request não-autenticado tenta registrar presença
- **WHEN** um request sem JWT chama `insertPresenceFn`
- **THEN** o sistema rejeita com HTTP 401

### Requirement: Deduplicação de auth inline
Os arquivos `analytics-chat.fn.ts`, `module-chat.fn.ts` e `mcp-keys.fn.ts` DEVEM importar `requireUserId` de `@/lib/auth.server` em vez de definir funções de auth locais (`requireUserId()` inline, `getCurrentUser()`).

#### Scenario: analytics-chat.fn.ts usa import compartilhado
- **WHEN** `analytics-chat.fn.ts` é inspecionado
- **THEN** contém `import { requireUserId } from "@/lib/auth.server"` e NÃO contém definição local de `requireUserId`

#### Scenario: module-chat.fn.ts usa import compartilhado
- **WHEN** `module-chat.fn.ts` é inspecionado
- **THEN** contém `import { requireUserId } from "@/lib/auth.server"` e NÃO contém definição local de `requireUserId`

#### Scenario: mcp-keys.fn.ts usa import compartilhado
- **WHEN** `mcp-keys.fn.ts` é inspecionado
- **THEN** contém `import { requireUserId } from "@/lib/auth.server"` e NÃO contém definição local de `getCurrentUser`
