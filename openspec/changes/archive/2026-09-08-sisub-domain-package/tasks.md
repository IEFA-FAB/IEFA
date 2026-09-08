## Tasks

### Fase 1: Scaffold do Pacote

- [x] [sisub-domain] Criar `packages/sisub-domain/` com package.json, tsconfig.json, src/index.ts
- [x] [root] Registrar workspace em `package.json` root e `turbo.json`
- [x] [sisub-domain] Instalar deps: `zod`, `@supabase/supabase-js`, `@iefa/pbac` (workspace:*), `zod-to-json-schema`
- [x] [sisub-domain] Criar estrutura de diretórios: schemas/, operations/, guards/, types/, utils/
- [x] [sisub-domain] Verificar que `bun install` resolve o workspace e `bun run typecheck` passa

### Fase 2: Types + Guards + Utils (fundação)

- [x] [sisub-domain] Implementar `types/context.ts` — UserContext interface, re-exports de @iefa/pbac (AppModule, PermissionScope, UserPermission)
- [x] [sisub-domain] Implementar `types/errors.ts` — DomainError, PermissionDeniedError, NotFoundError, ValidationError
- [x] [sisub-domain] Implementar `guards/require-permission.ts` — requirePermission, requireKitchen, requireUnit, requireMessHall
- [x] [sisub-domain] Implementar `guards/validate-scope.ts` — validateRecipeAccess, validateTemplateAccess, resolveKitchenFromMenu, resolveKitchenFromMenuItem, resolveKitchenFromTemplate
- [x] [sisub-domain] Implementar `utils/soft-delete.ts` — helpers softDelete(client, table, id), restore(client, table, id)
- [x] [sisub-domain] Implementar `utils/json-schema.ts` — toJsonSchema(zodSchema) wrapper com `$refStrategy: "none"`
- [x] [sisub-domain] Exportar tudo via barrel files (types/index.ts, guards/index.ts, utils/index.ts)

### Fase 3: Schemas Zod

- [x] [sisub-domain] Implementar `schemas/common.ts` — KitchenIdSchema, DateSchema (com refine), DateRangeSchema, UuidSchema, PaginationSchema, SortOrderSchema
- [x] [sisub-domain] Implementar `schemas/planning.ts` — todos os schemas de planning (10 schemas)
- [x] [sisub-domain] Implementar `schemas/templates.ts` — todos os schemas de templates (10 schemas)
- [x] [sisub-domain] Implementar `schemas/recipes.ts` — todos os schemas de recipes (6 schemas)
- [x] [sisub-domain] Implementar `schemas/meal-types.ts` — todos os schemas de meal types (5 schemas)
- [x] [sisub-domain] Implementar `schemas/kitchens.ts` — ListKitchensSchema, ListUnitKitchensSchema
- [x] [sisub-domain] Exportar todos schemas + tipos inferidos via schemas/index.ts
- [x] [sisub-domain] Verificar typecheck passa com todos schemas

### Fase 4: Operations

- [x] [sisub-domain] Implementar `operations/planning.ts` — 10 operations (fetchDailyMenus, fetchDayDetails, upsertDailyMenu, addMenuItem, updateMenuItem, removeMenuItem, restoreMenuItem, updateHeadcount, updateSubstitutions, getTrashItems)
- [x] [sisub-domain] Implementar `operations/templates.ts` — 11 operations (list, listDeleted, get, getItems, create, createBlank, fork, update, delete, restore, apply) com rollback canônico no applyTemplate
- [x] [sisub-domain] Implementar `operations/recipes.ts` — 5 operations (fetchRecipe, listRecipes, listRecipeVersions, createRecipe, createRecipeVersion) com filtro deleted_at correto
- [x] [sisub-domain] Implementar `operations/kitchens.ts` — 2 operations (listKitchens, listUnitKitchens)
- [x] [sisub-domain] Implementar `operations/meal-types.ts` — 5 operations (fetchMealTypes, createMealType, updateMealType, deleteMealType, restoreMealType)
- [x] [sisub-domain] Exportar tudo via operations/index.ts
- [x] [sisub-domain] Implementar barrel `src/index.ts` com re-exports de todos módulos
- [x] [sisub-domain] Rodar typecheck completo do pacote — zero erros

### Fase 5: Integração sisub

- [x] [sisub] Criar/expandir `src/lib/auth.server.ts` com `requireAuth()` → retorna UserContext
- [x] [sisub] Adicionar `@iefa/sisub-domain` como dependency no package.json
- [x] [sisub] Reescrever `src/server/planning.fn.ts` como thin wrappers (importar schemas + operations do pacote)
- [x] [sisub] Reescrever `src/server/templates.fn.ts` como thin wrappers
- [x] [sisub] Reescrever `src/server/recipes.fn.ts` como thin wrappers
- [x] [sisub] Reescrever `src/server/kitchens.fn.ts` como thin wrappers
- [x] [sisub] Reescrever `src/server/meal-types.fn.ts` como thin wrappers
- [x] [sisub] Criar `src/lib/domain-errors.ts` — error handler para converter DomainError → HTTP response
- [x] [sisub] Verificar que rotas dependentes (planning board, recipe list, template manager) continuam funcionando
- [ ] [sisub] Rodar `bun run sisub:dev` — app inicia sem erros

### Fase 6: Integração sisub-mcp

- [x] [sisub-mcp] Atualizar Zod de ^3.25.0 para ^4.3.6 — verificar breaking changes
- [x] [sisub-mcp] Adicionar `@iefa/sisub-domain` como dependency no package.json
- [x] [sisub-mcp] Reescrever `src/tools/planning.ts` como thin wrappers (toJsonSchema + parse + operation)
- [x] [sisub-mcp] Reescrever `src/tools/templates.ts` como thin wrappers
- [x] [sisub-mcp] Reescrever `src/tools/recipes.ts` como thin wrappers
- [x] [sisub-mcp] Reescrever `src/tools/kitchens.ts` como thin wrappers
- [x] [sisub-mcp] Reescrever `src/tools/meal-types.ts` como thin wrappers
- [x] [sisub-mcp] Criar `src/utils/error-handler.ts` — handleToolError (DomainError → toolError com msg sanitizada)
- [x] [sisub-mcp] Limpar `src/tools/shared.ts` — remover safeInt, safePositiveNumber, validateDate, requireKitchenPermission (migrados)
- [x] [sisub-mcp] Manter `src/auth.ts` (resolveCredential) + `src/tools/shared.ts` (toolResult, toolError — formatação MCP)
- [x] [sisub-mcp] Verificar todos 33 tools registram corretamente com novos schemas

### Fase 7: Verificação Final

- [x] [root] `bun install` — workspaces resolvem sem erros
- [x] [root] `bun run check` — Biome formatting + lint passam; typecheck tem 1 erro pré-existente (router.tsx QueryClient versão duplicada, não relacionado a esta mudança)
- [ ] [sisub] Smoke test manual: login → planning board → add/remove menu item → template apply
- [ ] [sisub-mcp] Smoke test manual: stdio mode → list_kitchens → get_planning_calendar → create_daily_menu
- [ ] [root] Verificar que nenhuma server fn do sisub funciona sem autenticação (curl sem cookie → 401)
- [ ] [root] Confirmar que os 3 bugs de divergência estão corrigidos na implementação canônica
