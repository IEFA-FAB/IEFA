## 1. Shared Auth Utilities

- [x] 1.1 [sisub] Adicionar `requireUserId()` em `src/lib/auth.server.ts` — valida JWT via `getSupabaseAuthClient().auth.getUser()`, retorna `user.id` (string), lança `Error("UNAUTHORIZED")` se ausente/inválido

## 2. Auth Guards — Mutations Admin/Domain

- [x] 2.1 [sisub] Adicionar `requireAuth()` em `src/server/places.fn.ts` — proteger `updatePlacesEntityFn`, `applyPlacesDiffFn`
- [x] 2.2 [sisub] Adicionar `requireAuth()` em `src/server/ingredients.fn.ts` — proteger `setIngredientNutrientsFn`, `createIngredientFn`, `updateIngredientFn`, `deleteIngredientFn`, `createFolderFn`, `updateFolderFn`, `deleteFolderFn`, `createIngredientItemFn`, `updateIngredientItemFn`, `deleteIngredientItemFn`
- [x] 2.3 [sisub] Adicionar `requireAuth()` em `src/server/policy.fn.ts` — proteger `createPolicyRuleFn`, `updatePolicyRuleFn`, `deletePolicyRuleFn`
- [x] 2.4 [sisub] Adicionar `requireAuth()` em `src/server/production.fn.ts` — proteger `ensureProductionTasksFn`, `updateProductionTaskStatusFn`
- [x] 2.5 [sisub] Adicionar `requireAuth()` em `src/server/unit-settings.fn.ts` — proteger `updateUnitSettingsFn`
- [x] 2.6 [sisub] Adicionar `requireAuth()` em `src/server/kitchen-settings.fn.ts` — proteger `updateKitchenSettingsFn`
- [x] 2.7 [sisub] Adicionar `requireAuth()` em `src/server/evaluation.fn.ts` — proteger `upsertEvalConfigFn`
- [x] 2.8 [sisub] Adicionar `requireAuth()` em `src/server/kitchen-draft.fn.ts` — proteger `createKitchenDraftFn`, `updateKitchenDraftFn`, `sendKitchenDraftFn`, `deleteKitchenDraftFn`
- [x] 2.9 [sisub] Adicionar `requireAuth()` em `src/server/ata.fn.ts` — proteger todas as mutations
- [x] 2.10 [sisub] Adicionar `requireAuth()` em `src/server/arp.fn.ts` — proteger todas as mutations
- [x] 2.11 [sisub] Adicionar `requireAuth()` em `src/server/mcp-keys.fn.ts` — proteger todas as mutations

## 3. Auth Guards — Mutations User-Scoped + Fix Trust Issue

- [x] 3.1 [sisub] Fix `src/server/forecast.fn.ts` — adicionar `requireUserId()` em `upsertForecastFn`, `deleteForecastFn`, `persistDefaultMessHallFn`; remover `userId` do schema Zod de input; usar userId do JWT no lugar de `data.userId`
- [x] 3.2 [sisub] Atualizar `src/hooks/data/useMealForecast.ts` — remover envio de `userId` nas chamadas de `upsertForecastFn`, `deleteForecastFn`, `persistDefaultMessHallFn`
- [x] 3.3 [sisub] Fix `src/server/evaluation.fn.ts` — adicionar `requireUserId()` em `submitEvaluationFn`; substituir `data.userId` por userId do JWT
- [x] 3.4 [sisub] Atualizar hook/componente que chama `submitEvaluationFn` — remover envio de `userId`
- [x] 3.5 [sisub] Adicionar `requireUserId()` em `src/server/presence.fn.ts` — proteger `insertPresenceFn`, `deletePresenceFn` (manter `data.user_id` no body)

## 4. Deduplicação de Auth Inline

- [x] 4.1 [sisub] Refatorar `src/server/analytics-chat.fn.ts` — remover `requireUserId()` local, importar de `@/lib/auth.server`
- [x] 4.2 [sisub] Refatorar `src/server/module-chat.fn.ts` — remover `requireUserId()` local, importar de `@/lib/auth.server`
- [x] 4.3 [sisub] Refatorar `src/server/mcp-keys.fn.ts` — remover `getCurrentUser()` local, importar `requireUserId()` de `@/lib/auth.server`

## 5. Verificação

- [x] 5.1 [sisub] Executar `bun run check` (Biome format + lint + typecheck) e corrigir erros
- [x] 5.2 [sisub] Grep em todos os `.fn.ts` para confirmar que todo handler POST tem `requireAuth()` ou `requireUserId()` antes de escritas
