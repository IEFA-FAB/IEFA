## Capability: domain-guards

Camada de enforcement de permissões PBAC embutida nas operations. Garante que todo acesso a dados é autorizado, independente do consumer.

## Requirements

### requirePermission (core)

```typescript
function requirePermission(
  ctx: UserContext,
  module: AppModule,
  minLevel: 1 | 2,
  scope?: PermissionScope
): void  // throws PermissionDeniedError
```

- Usa `hasPermission()` do `@iefa/pbac` internamente
- Se falha: throw `PermissionDeniedError` com module, level, scope
- Se sucesso: retorna void (continue execution)

### Convenience Guards

```typescript
function requireKitchen(ctx: UserContext, level: 1 | 2, kitchenId: number): void
function requireUnit(ctx: UserContext, level: 1 | 2, unitId: number): void
function requireMessHall(ctx: UserContext, level: 1 | 2, messHallId: number): void
```

Wrappers que constroem o `PermissionScope` automaticamente.

### Validação Cross-Resource (validate-scope.ts)

```typescript
async function validateRecipeAccess(
  client: SupabaseClient,
  recipeId: string,
  targetKitchenId: number
): Promise<void>  // throws DomainError se receita não pertence à kitchen
```

**Regra**: Receita é acessível se:
- `recipe.kitchen_id IS NULL` (global) — sempre acessível
- `recipe.kitchen_id === targetKitchenId` — mesma kitchen

Se nenhuma condição satisfeita: throw `DomainError("RECIPE_ACCESS_DENIED", ...)`

```typescript
async function validateTemplateAccess(
  client: SupabaseClient,
  templateId: string,
  kitchenId: number | null
): Promise<TemplateRow>  // throws NotFoundError ou DomainError
```

**Regra**: Template acessível se:
- `template.deleted_at IS NULL` (não deletado)
- `template.kitchen_id IS NULL` (global) OU `template.kitchen_id === kitchenId`

Retorna o template row se válido (evita query duplicada na operation).

### Scope Resolution Pattern

Para mutations que recebem um ID de recurso (não kitchenId direto), o guard faz lookup:

```typescript
// Exemplo: removeMenuItem recebe menuItemId
// 1. Buscar menu_item → daily_menu_id
// 2. Buscar daily_menu → kitchen_id
// 3. requireKitchen(ctx, 2, kitchen_id)
```

Helper para resolver kitchen_id a partir de resource:

```typescript
async function resolveKitchenFromMenu(
  client: SupabaseClient,
  dailyMenuId: string
): Promise<number>  // throws NotFoundError

async function resolveKitchenFromMenuItem(
  client: SupabaseClient,
  menuItemId: string
): Promise<number>  // throws NotFoundError

async function resolveKitchenFromTemplate(
  client: SupabaseClient,
  templateId: string
): Promise<number | null>  // null = global template
```

## Constraints

- Guards NUNCA fazem cache — cada chamada verifica permissão fresh
- Guards usam APENAS `ctx.permissions` (já resolvido) — sem query adicional para user_permissions
- Guards NÃO devem logar informação sensível (userId, permissões) — apenas throw erro genérico
- Resolvers de scope DEVEM lançar NotFoundError se resource não existe (não retornar null silenciosamente)
- `PermissionDeniedError` NÃO deve expor quais permissões o user TEM — apenas o que falta

## Modelo de Permissão (referência)

Herdado de `@iefa/pbac`:

| Level | Significado |
|-------|-------------|
| 0 | Deny (explícito, removido antes de chegar aqui) |
| 1 | Read |
| 2 | Write |

| Scope Type | Significado |
|------------|-------------|
| `kitchen` | Acesso restrito a uma kitchen específica |
| `unit` | Acesso restrito a uma unidade militar |
| `mess_hall` | Acesso restrito a um rancho |
| (null) | Acesso global (todas as entidades) |

**Regra de herança MCP key**: API key → `user_id` → `resolveUserPermissions(user_id)` → mesmo `UserContext` com mesmas permissions e scopes do user que gerou a key. Segregação garantida.
