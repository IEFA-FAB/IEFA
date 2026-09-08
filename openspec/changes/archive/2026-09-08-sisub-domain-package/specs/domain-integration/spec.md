## Capability: domain-integration

Integração thin-wrapper nos dois consumers. Cada app mantém responsabilidade de auth/transport e delega lógica ao pacote.

## Requirements

### sisub — Padrão de Integração

#### requireAuth() helper

Novo helper em `apps/sisub/src/lib/auth.server.ts`:

```typescript
export async function requireAuth(): Promise<UserContext> {
  const authClient = getSupabaseAuthClient()
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) throw new Error("UNAUTHORIZED")

  const dataClient = getSupabaseServerClient()
  const permissions = await resolveUserPermissions(user.id, dataClient)
  return { userId: user.id, permissions }
}
```

- Usa `getSupabaseAuthClient()` (SSR, lê cookies do request)
- Se JWT inválido/expirado: throw → server fn retorna 401
- Se válido: resolve permissions via @iefa/pbac → retorna UserContext

#### Server Function Pattern (pós-migração)

Toda server fn migrada segue:

```typescript
import { operationName, InputSchema } from "@iefa/sisub-domain"

export const operationNameFn = createServerFn({ method: "GET" | "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const ctx = await requireAuth()
    return operationName(getSupabaseServerClient(), ctx, data)
  })
```

- `.inputValidator(Schema)` — reutiliza Zod schema do pacote diretamente
- `requireAuth()` — resolve UserContext (obrigatório)
- `getSupabaseServerClient()` — injeta client
- Corpo: 3 linhas (auth + call)

#### Error Handling no sisub

```typescript
// apps/sisub/src/lib/domain-errors.ts
import { DomainError, PermissionDeniedError, NotFoundError } from "@iefa/sisub-domain/types"

export function handleDomainError(error: unknown): never {
  if (error instanceof PermissionDeniedError) {
    throw new Response(null, { status: 403 })
  }
  if (error instanceof NotFoundError) {
    throw new Response(null, { status: 404 })
  }
  if (error instanceof DomainError) {
    throw new Response(error.message, { status: 400 })
  }
  throw error
}
```

Alternativa mais simples: deixar erros propagarem e tratar no error boundary do TanStack Start.

### sisub-mcp — Padrão de Integração

#### Tool Definition Pattern (pós-migração)

```typescript
import { operationName, InputSchema } from "@iefa/sisub-domain"
import { toJsonSchema } from "@iefa/sisub-domain/utils"

export const toolName: ToolDefinition = {
  schema: {
    name: "tool_name",
    description: "Descrição para o LLM...",
    inputSchema: toJsonSchema(InputSchema),
  },
  async handler(args, credential) {
    const ctx = await resolveCredential(credential)
    const input = InputSchema.parse(args)
    const result = await operationName(getDataClient(), ctx, input)
    return toolResult(result)
  },
}
```

- `toJsonSchema(Schema)` — converte Zod → JSON Schema (sem $ref, inline)
- `InputSchema.parse(args)` — substitui validação manual (safeInt, validateDate)
- `resolveCredential()` — já existe, retorna UserContext
- `toolResult()` / `toolError()` — formatação MCP (já existe)

#### Error Handling no sisub-mcp

```typescript
// apps/sisub-mcp/src/utils/error-handler.ts
import { DomainError, PermissionDeniedError, NotFoundError } from "@iefa/sisub-domain/types"

export function handleToolError(error: unknown): ToolResponse {
  if (error instanceof PermissionDeniedError) {
    return toolError("Permissão insuficiente para esta operação")
  }
  if (error instanceof NotFoundError) {
    return toolError("Recurso não encontrado")
  }
  if (error instanceof DomainError) {
    return toolError(error.message)
  }
  // M3: nunca expor detalhes internos
  console.error(error)
  return toolError("Erro interno — tente novamente")
}
```

#### Remoção de Código Obsoleto no sisub-mcp

Após migração, remover de `tools/shared.ts`:
- `safeInt()` — substituído por Zod `.number().int().positive()`
- `safePositiveNumber()` — substituído por Zod `.number().positive()`
- `validateDate()` / `requireValidDates()` — substituído por `DateSchema`
- `requireKitchenPermission()` — movido para `@iefa/sisub-domain/guards`
- `toolResult()` / `toolError()` — manter (são formatação MCP, não domínio)

### Workspace Configuration

#### Root package.json

Adicionar ao array `workspaces`:
```json
"packages/sisub-domain"
```

#### turbo.json

Adicionar `@iefa/sisub-domain` ao pipeline de `build` e `typecheck`:
```json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^typecheck"] }
  }
}
```

#### Consumer package.json (sisub + sisub-mcp)

```json
{
  "dependencies": {
    "@iefa/sisub-domain": "workspace:*"
  }
}
```

### Atualização Zod no sisub-mcp

sisub-mcp atualmente usa Zod ^3.25.0. Migrar para ^4.3.6:
- Verificar breaking changes Zod 3 → 4
- Atualizar imports se necessário (Zod 4 muda namespace?)
- O pacote compartilhado usa Zod 4.x — deve ser compatível

## Constraints

- Server functions do sisub DEVEM chamar `requireAuth()` — sem exceção
- Se requireAuth() falha, a server fn DEVE retornar erro (não continuar sem ctx)
- sisub-mcp DEVE usar `InputSchema.parse()` (strict) e não `.safeParse()` — erros propagam para handler
- Cada tool no sisub-mcp mantém sua `description` customizada (prompts para o LLM — específico de cada tool)
- Error messages no sisub-mcp DEVEM ser genéricas (M3 — não expor internals)
- `toJsonSchema()` DEVE ser chamado em tempo de definição (não runtime) — resultado é estático

## Arquivos Afetados

### sisub (modificar):
- `src/server/planning.fn.ts` — reescrever como thin wrapper
- `src/server/templates.fn.ts` — reescrever como thin wrapper
- `src/server/recipes.fn.ts` — reescrever como thin wrapper
- `src/server/kitchens.fn.ts` — reescrever como thin wrapper
- `src/server/meal-types.fn.ts` — reescrever como thin wrapper
- `src/lib/supabase.server.ts` — manter (injeta client)
- `src/lib/auth.server.ts` — criar/expandir (requireAuth)

### sisub-mcp (modificar):
- `src/tools/planning.ts` — reescrever como thin wrapper
- `src/tools/templates.ts` — reescrever como thin wrapper
- `src/tools/recipes.ts` — reescrever como thin wrapper
- `src/tools/kitchens.ts` — reescrever como thin wrapper
- `src/tools/meal-types.ts` — reescrever como thin wrapper
- `src/tools/shared.ts` — remover funções migradas
- `src/auth.ts` — manter (resolveCredential retorna UserContext)
- `package.json` — bump zod 3 → 4

### Novos:
- `packages/sisub-domain/` — pacote inteiro (novo)
