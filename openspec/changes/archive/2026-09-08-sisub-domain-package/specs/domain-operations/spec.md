## Capability: domain-operations

Funções de query e mutation que implementam toda lógica de acesso a dados dos 5 domínios. Implementação canônica única — elimina duplicação entre sisub e sisub-mcp.

## Requirements

### Assinatura Universal

Toda operation segue:

```typescript
async function operationName(
  client: SupabaseClient,
  ctx: UserContext,
  input: z.infer<typeof InputSchema>
): Promise<OutputType>
```

- `client` — Supabase client injetado (permite tanto service role quanto user-scoped)
- `ctx` — UserContext obrigatório (userId + permissions[])
- `input` — dados já validados pelo schema Zod correspondente

### Planning Operations (operations/planning.ts)

| Function | Tipo | Permissão | Schema Input |
|----------|------|-----------|--------------|
| `fetchDailyMenus` | Query | kitchen:1 | DailyMenuFetchSchema |
| `fetchDayDetails` | Query | kitchen:1 | DayDetailsFetchSchema |
| `upsertDailyMenu` | Mutation | kitchen:2 | UpsertDailyMenuSchema |
| `addMenuItem` | Mutation | kitchen:2 | AddMenuItemSchema |
| `updateMenuItem` | Mutation | kitchen:2 | UpdateMenuItemSchema |
| `removeMenuItem` | Mutation | kitchen:2 | RemoveMenuItemSchema |
| `restoreMenuItem` | Mutation | kitchen:2 | RestoreMenuItemSchema |
| `updateHeadcount` | Mutation | kitchen:2 | UpdateHeadcountSchema |
| `updateSubstitutions` | Mutation | kitchen:2 | UpdateSubstitutionsSchema |
| `getTrashItems` | Query | kitchen:1 | GetTrashItemsSchema |

**Regras de negócio Planning:**
- `addMenuItem` DEVE validar que receita é global (`kitchen_id IS NULL`) ou pertence à mesma kitchen do menu
- `upsertDailyMenu` usa `ignoreDuplicates: true` no conflict (service_date, meal_type_id, kitchen_id)
- `removeMenuItem` / `restoreMenuItem` = soft-delete (`deleted_at` = now / null)
- `updateMenuItem.excludedFromProcurement` aceita apenas 0 ou 1
- `fetchDailyMenus` retorna items filtrados (deleted_at IS NULL) — filtragem no query, não em memória

### Template Operations (operations/templates.ts)

| Function | Tipo | Permissão | Schema Input |
|----------|------|-----------|--------------|
| `listTemplates` | Query | kitchen:1 | ListTemplatesSchema |
| `listDeletedTemplates` | Query | kitchen:1 | ListTemplatesSchema |
| `getTemplate` | Query | kitchen:1 | GetTemplateSchema |
| `getTemplateItems` | Query | kitchen:1 | GetTemplateSchema |
| `createTemplate` | Mutation | kitchen:2 | CreateTemplateSchema |
| `createBlankTemplate` | Mutation | kitchen:2 | CreateBlankTemplateSchema |
| `forkTemplate` | Mutation | kitchen:2 | ForkTemplateSchema |
| `updateTemplate` | Mutation | kitchen:2 | UpdateTemplateSchema |
| `deleteTemplate` | Mutation | kitchen:2 | DeleteTemplateSchema |
| `restoreTemplate` | Mutation | kitchen:2 | RestoreTemplateSchema |
| `applyTemplate` | Mutation | kitchen:2 | ApplyTemplateSchema |

**Regras de negócio Templates:**
- `listTemplates` retorna templates globais (kitchen_id IS NULL) + templates da kitchen especificada
- `createTemplate` com items: rollback (hard-delete template) se insert de items falhar
- `forkTemplate` copia template + items, define `base_template_id` no fork
- `updateTemplate` com items: destructive replace (DELETE all + INSERT new)
- `applyTemplate` — algoritmo canônico:
  1. Fetch template + items + validate (not deleted, kitchen match)
  2. Soft-delete existing daily_menus para target dates
  3. Create new daily_menus (UUID gerado com crypto.randomUUID())
  4. Insert menu_items (recipe snapshot preservado)
  5. **ON ERROR**: hard-delete menus criados + RESTORE menus previously deleted

### Recipe Operations (operations/recipes.ts)

| Function | Tipo | Permissão | Schema Input |
|----------|------|-----------|--------------|
| `fetchRecipe` | Query | kitchen:1 | FetchRecipeSchema |
| `listRecipes` | Query | kitchen:1 | ListRecipesSchema |
| `listRecipeVersions` | Query | kitchen:1 | ListRecipeVersionsSchema |
| `createRecipe` | Mutation | kitchen:2 | CreateRecipeSchema |
| `createRecipeVersion` | Mutation | kitchen:2 | CreateRecipeVersionSchema |

**Regras de negócio Recipes:**
- `fetchRecipe` DEVE filtrar `deleted_at IS NULL` (corrige bug do sisub)
- `fetchRecipe` com `includeAlternatives: true` → join `recipe_ingredient_alternatives`
- `listRecipes` com `globalOnly: true` → filtra `kitchen_id IS NULL`
- `listRecipes` com `kitchenId` → retorna globais + locais daquela kitchen
- `createRecipe` define `version: 1` automaticamente
- `createRecipeVersion` exige `baseRecipeId` existente + version explícito
- Relation para produto: usar `product:product_id(*)` (padrão sisub-mcp, mais explícito)

### Kitchen Operations (operations/kitchens.ts)

| Function | Tipo | Permissão | Schema Input |
|----------|------|-----------|--------------|
| `listKitchens` | Query | kitchen:1 | — (sem input) |
| `listUnitKitchens` | Query | kitchen:1 | ListUnitKitchensSchema |

**Regras de negócio Kitchens:**
- `listKitchens` retorna `*, unit:units!kitchen_unit_id_fkey(id, name)` — select explícito do unit (não `unit(*)`)
- `listUnitKitchens` filtra por `unit_id` e retorna `id, display_name`

### Meal Type Operations (operations/meal-types.ts)

| Function | Tipo | Permissão | Schema Input |
|----------|------|-----------|--------------|
| `fetchMealTypes` | Query | kitchen:1 | FetchMealTypesSchema |
| `createMealType` | Mutation | kitchen:2 | CreateMealTypeSchema |
| `updateMealType` | Mutation | kitchen:2 | UpdateMealTypeSchema |
| `deleteMealType` | Mutation | kitchen:2 | DeleteMealTypeSchema |
| `restoreMealType` | Mutation | kitchen:2 | RestoreMealTypeSchema |

**Regras de negócio Meal Types:**
- `fetchMealTypes` com kitchenId: retorna global + kitchen-specific (OR pattern)
- `fetchMealTypes` sem kitchenId: retorna apenas globais
- Soft-delete pattern padrão (deleted_at)
- Ordered by `sort_order` ascending

## Constraints

- Operations NUNCA instanciam SupabaseClient — recebem por parâmetro
- Operations NUNCA resolvem auth — recebem UserContext por parâmetro
- Operations SEMPRE chamam guard (requirePermission) antes de acessar dados
- Operations SEMPRE usam soft-delete (nunca hard-delete de dados, exceto rollback compensatório)
- Operations DEVEM converter camelCase → snake_case ao inserir/atualizar no Supabase
- Operations DEVEM lançar erros tipados (DomainError, PermissionDeniedError, NotFoundError)
- Operations NUNCA retornam mensagens user-facing — apenas dados ou erros (consumer formata)

## Select Strings

Queries complexas devem ter select strings como constantes nomeadas:

```typescript
const DAILY_MENU_WITH_ITEMS = `
  *,
  meal_type:meal_type_id(*),
  menu_items:menu_items(*, recipe_origin:recipe_origin_id(*))
` as const

const RECIPE_WITH_INGREDIENTS = `
  *,
  ingredients:recipe_ingredients(*, product:product_id(*))
` as const

const RECIPE_WITH_ALTERNATIVES = `
  *,
  ingredients:recipe_ingredients(
    *, product:product_id(*),
    alternatives:recipe_ingredient_alternatives(*, product:product_id(*))
  )
` as const

const TEMPLATE_ITEMS_FULL = `
  *,
  meal_type:meal_type_id(*),
  recipe_origin:recipe_id(*)
` as const
```
