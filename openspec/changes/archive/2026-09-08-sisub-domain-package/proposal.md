## Why

`apps/sisub` e `apps/sisub-mcp` compartilham 18 mutations + 10 queries **literalmente duplicadas** em 5 domínios (Planning, Templates, Recipes, Kitchens, Meal Types). A evolução divergente já produziu 3 bugs em produção:

1. `applyTemplateFn` (sisub) não restaura menus deletados em caso de falha no insert de items — perda de dados silenciosa
2. `fetchRecipeFn` (sisub) não filtra `deleted_at` — retorna receitas na lixeira no UI
3. `addMenuItemFn` (sisub) não valida `kitchen_id` da receita — permite vincular receita da cozinha A ao menu da cozinha B

Além disso, **todas as server functions do sisub são endpoints HTTP expostos sem autenticação** — `getSupabaseServerClient()` usa service role (bypassa RLS) e nenhum middleware ou guard verifica identidade. Qualquer pessoa com curl lê/escreve tudo.

A extração de um pacote de domínio compartilhado resolve duplicação, corrige bugs, e **força autenticação pelo type system** — operations exigem `UserContext` como parâmetro obrigatório.

**Apps afetadas**: `sisub`, `sisub-mcp`
**Pacotes afetados**: novo `packages/sisub-domain`, existente `packages/pbac`

## What Changes

- Criar pacote `packages/sisub-domain/` com schemas Zod, operations (queries + mutations), guards de permissão, tipos compartilhados
- Migrar toda lógica de dados dos 5 domínios para o pacote (implementação canônica única)
- Reescrever server functions do sisub como thin wrappers: `requireAuth()` → `operation(client, ctx, data)`
- Reescrever tool handlers do sisub-mcp como thin wrappers: `resolveCredential()` → `schema.parse(args)` → `operation(client, ctx, input)`
- Converter schemas Zod → JSON Schema via `zod-to-json-schema` para `inputSchema` do MCP
- Embutir guards de permissão (@iefa/pbac) dentro de cada operation — impossível chamar sem UserContext
- Corrigir os 3 bugs de divergência na implementação canônica

## Capabilities

### New Capabilities

- `domain-schemas`: Schemas Zod compartilhados — source of truth para validação e tipos (Planning, Templates, Recipes, Kitchens, Meal Types)
- `domain-operations`: Funções de query + mutation com assinatura `(client, ctx, input) → result` — implementação canônica única com guards embutidos
- `domain-guards`: Enforcement de permissões PBAC dentro de operations — requireKitchen, requireUnit, requireMessHall + validação cross-resource
- `domain-integration`: Integração thin-wrapper nos dois consumers — sisub (createServerFn) e sisub-mcp (MCP tool handlers)

### Modified Capabilities

- **sisub server functions**: De implementação completa para thin wrappers (~5 linhas cada)
- **sisub-mcp tool handlers**: De implementação completa + validação manual para thin wrappers com Zod
- **sisub auth**: Adição de `requireAuth()` helper obrigatório em toda server fn

## Impact

- **Dependências (sisub-domain)**: `zod` ^4.3.6, `@supabase/supabase-js`, `@iefa/pbac`, `zod-to-json-schema`
- **sisub-mcp**: Remove validação manual (safeInt, validateDate) em favor de Zod parse
- **sisub**: Toda server fn passa a exigir auth — breaking change interno (corrige vulnerabilidade)
- **package.json (root)**: Novo workspace `packages/sisub-domain`
- **turbo.json**: Novo pacote no pipeline de build/typecheck
- **DB**: Nenhuma migration — apenas leitura/escrita dos mesmos schemas existentes

## Não-objetivos

- Testes unitários no pacote (confia nos testes E2E dos apps por enquanto)
- Migrar domínios que NÃO duplicam (Products, Procurement, Production, Forecast, etc.)
- Trocar Zod por outra lib de validação
- Implementar RLS no Supabase (o guard no application layer é suficiente)
- Mudar o modelo de permissão do @iefa/pbac
- Micro-pacotes por domínio (monolítico — nunca usado separadamente)
