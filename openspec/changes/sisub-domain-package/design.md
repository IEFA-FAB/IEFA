## Visão Geral da Arquitetura

```
apps/sisub                              apps/sisub-mcp
┌──────────────────────┐               ┌────────────���─────────┐
│  createServerFn()    │               │  MCP tool handler    │
│  ├─ requireAuth()    │               │  ├─ resolveCredential│
│  ├─ schema (reuse)   │               │  ├─ schema.parse()   │
│  └─ operation(c,u,i) │               │  └─ operation(c,u,i) │
└──────────┬───────────┘               └──────────┬───────────┘
           │                                       │
           ▼                                       ▼
┌──────────────────────────────────────��───────────────────────┐
│                   @iefa/sisub-domain                           │
│                                                               │
│  schemas/     → Zod schemas (input validation + tipos)        │
│  operations/  → queries + mutations (impl. canônica)          │
│  guards/      → PBAC enforcement (usa @iefa/pbac)             │
│  types/       → UserContext, errors, output types             │
│  utils/       → soft-delete helpers, zod-to-json-schema       │
│                                                               │
└───────────────────────────┬───────────────────────��───────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │   @iefa/pbac   │
                   └───────────���────┘
```

## Estrutura do Pacote

```
packages/sisub-domain/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    (barrel export)
│   ├── schemas/
│   │   ├── index.ts
│   │   ├── common.ts              (kitchenId, dateRange, pagination)
│   │   ├── planning.ts            (DailyMenuFetchSchema, UpsertMenuSchema, MenuItemSchema...)
│   │   ├── templates.ts           (CreateTemplateSchema, ApplyTemplateSchema, ForkSchema...)
│   │   ├── recipes.ts             (RecipeSchema, IngredientSchema, VersionSchema...)
│   │   ├── meal-types.ts          (MealTypeSchema, CRUDSchemas...)
│   │   └── kitchens.ts            (KitchenFilterSchema...)
│   ├── operations/
│   │   ├── index.ts
│   │   ├── planning.ts            (fetchDailyMenus, upsertMenu, addItem, removeItem...)
│   │   ├── templates.ts           (list, create, fork, apply, delete, restore...)
│   │   ├── recipes.ts             (fetch, create, createVersion, list, listVersions)
│   │   ├── kitchens.ts            (list, listByUnit)
│   │   └── meal-types.ts          (fetch, create, update, delete, restore)
│   ├── guards/
│   │   ├── index.ts
│   │   ├── require-permission.ts  (requireKitchen, requireUnit, requireMessHall)
│   │   └── validate-scope.ts      (cross-resource: recipe pertence à kitchen?)
│   ├── types/
│   │   ├── index.ts
│   │   ├── context.ts             (UserContext, re-exports de @iefa/pbac)
│   │   ├── errors.ts              (DomainError, PermissionDeniedError, NotFoundError)
│   │   └── outputs.ts             (tipos de retorno inferidos das operations)
│   └── utils/
│       ├── index.ts
│       ├── soft-delete.ts          (helpers pra padrão deleted_at)
│       └── json-schema.ts          (wrapper zodToJsonSchema tipado)
```

## Padrões de Design

### 1. Assinatura das Operations

Todas as operations seguem a mesma assinatura:

```typescript
export async function operationName(
  client: SupabaseClient,   // injetado pelo consumer
  ctx: UserContext,          // obrigatório — forçado pelo type system
  input: z.infer<typeof InputSchema>  // validado antes de chegar aqui
): Promise<OutputType>
```

**Rationale**: `ctx` obrigatório impede chamada sem auth — se o consumer não resolve UserContext, não compila.

### 2. Guards Embutidos

```typescript
// packages/sisub-domain/src/operations/planning.ts
export async function addMenuItem(
  client: SupabaseClient,
  ctx: UserContext,
  input: z.infer<typeof AddMenuItemSchema>
) {
  // 1. Buscar menu para extrair kitchen_id
  const menu = await client.from("daily_menu").select("kitchen_id").eq("id", input.dailyMenuId).single()
  if (menu.error) throw new NotFoundError("daily_menu", input.dailyMenuId)

  // 2. Guard de permissão
  requireKitchen(ctx, 2, menu.data.kitchen_id)

  // 3. Validação cross-resource (receita pertence à kitchen)
  await validateRecipeAccess(client, input.recipeId, menu.data.kitchen_id)

  // 4. Mutation
  const { data, error } = await client.from("menu_items").insert({...})
  if (error) throw new DomainError("INSERT_FAILED", error.message)
  return data
}
```

### 3. Schemas Zod — Dual-purpose

```typescript
// packages/sisub-domain/src/schemas/planning.ts
import { z } from "zod"

export const DailyMenuFetchSchema = z.object({
  kitchenId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// Consumer sisub:
// .inputValidator(DailyMenuFetchSchema)  ← direto

// Consumer sisub-mcp:
// zodToJsonSchema(DailyMenuFetchSchema)  ← converte para MCP inputSchema
// DailyMenuFetchSchema.parse(args)       ← valida input no handler
```

### 4. Error Hierarchy

```typescript
// packages/sisub-domain/src/types/errors.ts
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export class PermissionDeniedError extends DomainError {
  constructor(module: string, level: number, scope?: PermissionScope) {
    super("PERMISSION_DENIED", `Requires ${module} level ${level}`)
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string | number) {
    super("NOT_FOUND", `${entity} ${id} not found`)
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public issues: z.ZodIssue[]) {
    super("VALIDATION_FAILED", message)
  }
}
```

Cada consumer converte erros no formato adequado:
- **sisub**: DomainError → HTTP status (403, 404, 400)
- **sisub-mcp**: DomainError → `toolError()` com mensagem sanitizada (M3)

### 5. Consumer Pattern — sisub

```typescript
// apps/sisub/src/server/planning.fn.ts (APÓS migração)
import { fetchDailyMenus, DailyMenuFetchSchema } from "@iefa/sisub-domain"
import { getSupabaseServerClient } from "@/lib/supabase.server"
import { requireAuth } from "@/lib/auth.server"

export const fetchDailyMenusFn = createServerFn({ method: "GET" })
  .inputValidator(DailyMenuFetchSchema)
  .handler(async ({ data }) => {
    const ctx = await requireAuth()
    return fetchDailyMenus(getSupabaseServerClient(), ctx, data)
  })
```

`requireAuth()` — novo helper que:
1. Chama `getSupabaseAuthClient().auth.getUser()` via cookies do request
2. Se falha → throw (endpoint retorna 401)
3. Se sucesso → `resolveUserPermissions(userId)` → retorna `UserContext`

### 6. Consumer Pattern — sisub-mcp

```typescript
// apps/sisub-mcp/src/tools/planning.ts (APÓS migração)
import { fetchDailyMenus, DailyMenuFetchSchema } from "@iefa/sisub-domain"
import { zodToJsonSchema } from "@iefa/sisub-domain/utils"
import { getDataClient } from "../supabase"
import { resolveCredential } from "../auth"

export const getPlanningCalendar: ToolDefinition = {
  schema: {
    name: "get_planning_calendar",
    description: "Visualização de calendário...",
    inputSchema: zodToJsonSchema(DailyMenuFetchSchema),
  },
  async handler(args, credential) {
    const ctx = await resolveCredential(credential)
    const input = DailyMenuFetchSchema.parse(args)
    return toolResult(await fetchDailyMenus(getDataClient(), ctx, input))
  },
}
```

### 7. UserContext — Tipo Compartilhado

```typescript
// packages/sisub-domain/src/types/context.ts
import type { UserPermission, AppModule, PermissionScope } from "@iefa/pbac"

export interface UserContext {
  userId: string
  permissions: UserPermission[]
}

// Re-export para conveniência
export type { UserPermission, AppModule, PermissionScope }
```

O sisub-mcp já usa exatamente este tipo. O sisub precisa criar `requireAuth()` que produz o mesmo `UserContext`.

### 8. Rollback Canônico (applyTemplate)

A implementação canônica do `applyTemplate` adota o padrão do sisub-mcp (mais seguro):

```
1. Fetch template + items
2. Validate: not deleted, kitchen_id match
3. Soft-delete existing daily_menus for target dates
4. Create new daily_menus + menu_items
5. ON ERROR: hard-delete created menus + RESTORE previously deleted menus
```

Isso corrige o bug do sisub que não restaurava menus em caso de falha.

## Decisões de Migração

### Zod Version

sisub usa Zod ^4.3.6, sisub-mcp usa Zod ^3.25.0. O pacote compartilhado usará **Zod 4.x** (latest). sisub-mcp será atualizado para Zod 4.x como parte da migração.

### Select Strings (Supabase)

As strings de `.select()` serão constantes exportadas do pacote:

```typescript
// packages/sisub-domain/src/operations/planning.ts
const DAILY_MENU_SELECT = `
  *,
  meal_type:meal_type_id(*),
  menu_items:menu_items(*, recipe_origin:recipe_origin_id(*))
` as const
```

Isso garante que sisub e sisub-mcp usam exatamente o mesmo shape de dados.

### Diferenças de Projeção (Templates)

A query de listagem de templates no sisub-mcp retorna `items(count)` enquanto o sisub retorna `items(headcount_override, day_of_week)` para computação JS. A implementação canônica retornará **ambos** — o consumer usa o que precisa:

```typescript
const TEMPLATE_LIST_SELECT = `
  *,
  items:menu_template_items(count),
  items_detail:menu_template_items(headcount_override, day_of_week)
` as const
```

Alternativa (preferida): retornar apenas `items(headcount_override, day_of_week)` e computar count client-side com `.length`. Mais simples, sem overhead.

### Package.json

```json
{
  "name": "@iefa/sisub-domain",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./operations": "./src/operations/index.ts",
    "./guards": "./src/guards/index.ts",
    "./types": "./src/types/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "dependencies": {
    "zod": "^4.3.6",
    "@supabase/supabase-js": "^2.x",
    "@iefa/pbac": "workspace:*",
    "zod-to-json-schema": "^3.x"
  }
}
```

## DB Schema — Sem Alterações

Nenhuma migration necessária. O pacote acessa as mesmas tabelas existentes:
- `daily_menu`, `menu_items` (planning)
- `menu_template`, `menu_template_items` (templates)
- `recipes`, `recipe_ingredients`, `recipe_ingredient_alternatives` (recipes)
- `kitchen`, `units` (kitchens)
- `meal_type` (meal types)
- `user_permissions` (guards, via @iefa/pbac)
