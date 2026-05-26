## ADDED Requirements

### Requirement: Tool `render_chart` para analytics chat
O analytics chat DEVE usar tool `render_chart` via `toolDefinition().server()` em vez de buffer regex de chart-spec. O LLM chama a tool com parâmetros Zod estruturados.

Ref: https://tanstack.com/ai/latest/docs/tools/tools

#### Scenario: LLM gera gráfico via tool call
- **WHEN** o LLM decide gerar gráfico durante conversa analytics
- **THEN** emite tool call `render_chart` com `{ sql, type, title, xAxisKey, series }`
- **AND** `.server()` handler valida SQL (rejeita mutations)
- **AND** executa query no Supabase via `executeSql()`
- **AND** retorna `{ type, title, xAxisKey, series, data: rows }`
- **AND** LLM continua resposta após receber os dados

#### Scenario: SQL inválido
- **WHEN** LLM chama `render_chart` com SQL contendo mutation
- **THEN** handler lança erro
- **AND** erro retorna ao LLM como tool result (loop built-in do `chat()`)
- **AND** LLM pode tentar SQL alternativo

#### Scenario: Query falha no Supabase
- **WHEN** SQL é válido mas execução falha
- **THEN** handler retorna erro descritivo
- **AND** LLM está no loop e pode corrigir

#### Scenario: Múltiplos gráficos
- **WHEN** LLM precisa de 2+ gráficos
- **THEN** emite múltiplas tool calls `render_chart`
- **AND** client renderiza cada gráfico a partir dos `ToolResultPart` nos `message.parts`

### Requirement: Tool calling via `toolDefinition().server()` no module-chat
Module-chat DEVE definir tools usando `toolDefinition().server()`. O agent loop é built-in no `chat()` — itera automaticamente. Limite via `maxIterationsMiddleware(8)`.

Ref: https://tanstack.com/ai/latest/docs/tools/tools, https://tanstack.com/ai/latest/docs/advanced/middleware

#### Scenario: Tool executado no agent loop
- **WHEN** LLM chama tool `list_recipes`
- **THEN** `chat()` detecta tool call, executa `.server()` handler
- **AND** alimenta resultado de volta ao LLM automaticamente (loop built-in)
- **AND** continua até LLM responder sem tool calls ou middleware abortar

#### Scenario: Múltiplos rounds
- **WHEN** LLM precisa `list_recipes` → `get_recipe_details`
- **THEN** loop automático do `chat()` gerencia as iterações
- **AND** `maxIterationsMiddleware(8)` aborta na 8ª iteração via `ctx.abort()`

#### Scenario: Limite atingido
- **WHEN** loop atinge 8 iterações
- **THEN** `maxIterationsMiddleware` chama `ctx.abort('Limite de iterações atingido')`
- **AND** stream encerra com conteúdo acumulado

### Requirement: PBAC mantido no tool calling
Tools filtrados por permissão DEVEM ser passados ao `chat({ tools: filteredTools })`.

#### Scenario: Usuário com permissão limitada
- **WHEN** usuário tem permissão `kitchen` nível 1 (leitura)
- **THEN** apenas tools de leitura passados em `chat({ tools: [...] })`
- **AND** tools de escrita não existem para o LLM

#### Scenario: PBAC via middleware (alternativa)
- **WHEN** se necessário validação adicional runtime
- **THEN** `onBeforeToolCall` middleware pode bloquear tool calls: `return { type: 'abort', reason: 'Permission denied' }`

### Requirement: Tool registry adaptado para `toolDefinition()`
Tool registry DEVE ser convertido para `toolDefinition()` com `inputSchema` em Zod e `.server()` para execução.

Ref: https://tanstack.com/ai/latest/docs/tools/tools

#### Scenario: Conversão de tool definitions
- **WHEN** module-chat carrega tools para módulo
- **THEN** cada tool definido via:
```ts
const myTool = toolDefinition({
  name: 'list_recipes',
  description: '...',
  inputSchema: z.object({ kitchenId: z.string() }),
}).server(async ({ kitchenId }) => {
  // execução com ToolContext injetado via closure
  return results
})
```

#### Scenario: Erros tipados
- **WHEN** tool falha
- **THEN** erro retorna como tool result ao LLM (comportamento built-in do `chat()`)

### Requirement: Tool calling funciona com múltiplos providers
Tool calling DEVE funcionar com providers que suportam function calling. TanStack AI traduz formato automaticamente.

#### Scenario: Tool calling com Groq
- **WHEN** module-chat usa `createGroqText('llama-3.3-70b-versatile', apiKey)`
- **THEN** tool calling funciona — `@tanstack/ai-groq` traduz tools para formato correto

#### Scenario: Tool calling com Anthropic
- **WHEN** module-chat usa `createAnthropicChat('claude-sonnet-4-5', apiKey)`
- **THEN** tool calling funciona — adapter traduz para `tool_use/tool_result` Anthropic

#### Scenario: Provider sem suporte
- **WHEN** provider/model não suporta function calling
- **THEN** DEVE lançar erro descritivo na inicialização
