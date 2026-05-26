## Context

O monorepo IEFA possui 4 integrações LLM independentes com padrões divergentes:

| App | Framework | Provider | Streaming | State |
|-----|-----------|----------|-----------|-------|
| alpha | LangGraph + LangChain | NVIDIA NIM | `hono/streaming.streamSSE()` | PostgreSQL checkpointer |
| sisub (analytics) | LangChain ChatOpenAI | OpenRouter | `ReadableStream` manual + SSE | Supabase (chat_sessions/messages) |
| sisub (module-chat) | LangChain ChatOpenAI | OpenRouter | `ReadableStream` manual + SSE | In-memory (per-request) |
| sucont | `@google/genai` direto | Google Gemini | Sem streaming (await) | React useState |

O sucont já tem `@tanstack/ai-*` instalado mas não usa. O `packages/alpha-client` exporta `makeChatLLM()` via `@langchain/openai`.

**API real do TanStack AI** (verificado contra docs oficiais em tanstack.com/ai):

- **Server**: `chat()` retorna `AsyncIterable<StreamChunk>`, convertido via `toServerSentEventsResponse(stream)` → SSE `Response`
- **Client**: `useChat({ connection: fetchServerSentEvents('/api/chat') })` — `fetchServerSentEvents` importado de `@tanstack/ai-react`
- **Tools**: `toolDefinition({ name, description, inputSchema }).server(executeFn)` — Zod nativo, execução server-side
- **Agent loop**: Built-in no `chat()` — itera automaticamente quando tools retornam resultados. Controle via middleware (`ctx.iteration`, `ctx.abort()`)
- **Providers**:
  - `groqText()` / `createGroqText()` de `@tanstack/ai-groq` (package dedicado, v0.2.7)
  - `openaiChatCompletions()` / `createOpenaiChatCompletions()` de `@tanstack/ai-openai` — para providers OpenAI Chat Completions-compatible (NVIDIA NIM, OpenRouter)
  - `openaiText()` de `@tanstack/ai-openai` — usa Responses API (`/v1/responses`), **NÃO compatível** com NVIDIA NIM/OpenRouter
  - `geminiText()` / `createGeminiChat()` de `@tanstack/ai-gemini`
  - `anthropicText()` / `createAnthropicChat()` de `@tanstack/ai-anthropic`
  - `ollamaText()` / `createOllamaChat()` de `@tanstack/ai-ollama`
- **OTEL**: Built-in `otelMiddleware({ tracer, meter })` de `@tanstack/ai/middlewares/otel` — cria spans automáticos para chat calls e tool execution
- **Middleware**: `onChunk` pode transformar/filtrar/expandir/dropar chunks antes do client. `onBeforeToolCall`/`onAfterToolCall` para interceptar tools.

Refs:
- Groq adapter: https://tanstack.com/ai/latest/docs/adapters/groq
- OpenAI adapter: https://tanstack.com/ai/latest/docs/adapters/openai
- Anthropic adapter: https://tanstack.com/ai/latest/docs/adapters/anthropic
- Gemini adapter: https://tanstack.com/ai/latest/docs/adapters/gemini
- Ollama adapter: https://tanstack.com/ai/latest/docs/adapters/ollama
- Tools: https://tanstack.com/ai/latest/docs/tools/tools
- Middleware: https://tanstack.com/ai/latest/docs/advanced/middleware
- OTEL: https://tanstack.com/ai/latest/docs/advanced/otel
- Quick start (server/client patterns): https://tanstack.com/ai/latest/docs/getting-started/quick-start

## Goals / Non-Goals

**Goals:**
- `packages/ai-provider` retornando adapters reais do TanStack AI (`AnyTextAdapter`)
- `useChat` + `fetchServerSentEvents` (de `@tanstack/ai-react`) como padrão client-side
- `chat()` + `toServerSentEventsResponse()` como padrão server-side
- Chart-spec como tool call `render_chart` (substitui buffer state machine de 375 LOC)
- Agent loop built-in + middleware para max iterations (substitui loop manual do module-chat)
- `otelMiddleware` built-in para observabilidade (substitui LangSmith)
- Suporte a 6 providers: Groq, NVIDIA NIM, OpenRouter, Google Gemini, Anthropic, Ollama

**Non-Goals:**
- Migrar LangGraph StateGraph do alpha
- Unificar componentes visuais de chat entre apps
- Migrar sisub-mcp
- Alterar schema Supabase (chat_sessions/chat_messages permanecem)
- Alterar lógica PBAC do module-chat

## Decisions

### D1: TanStack AI como framework unificado (não Vercel AI SDK)

**Escolha**: `@tanstack/ai` + `@tanstack/ai-react` + provider adapters dedicados

**Alternativas consideradas**:
- **Vercel AI SDK (`ai`)**: Maduro, mas acoplado ao ecossistema Next.js.
- **Manter LangChain**: Pesado para chat simples, sem hooks React nativos.

**Rationale**: Mesmo ecossistema TanStack, hooks React first-class, middleware system poderoso (OTEL, tool interception, stream transformation built-in). Sucont já tem deps instaladas.

### D2: `createAdapter()` retornando adapter real do TanStack AI

**Escolha**: Factory que chama a função de adapter correta internamente e retorna o resultado.

**Interface**:
```ts
import type { AnyTextAdapter } from '@tanstack/ai'

export type ProviderType = 'groq' | 'nvidia' | 'openrouter' | 'gemini' | 'anthropic' | 'ollama'

export interface AdapterConfig {
  provider: ProviderType
  model: string
  apiKey: string
  baseUrl?: string
  defaultHeaders?: Record<string, string>
}

export function createAdapter(config: AdapterConfig): AnyTextAdapter
export function createAdapterFromEnv(prefix?: string): AnyTextAdapter
```

**Implementação (corrigida contra docs)**:
```ts
import { createGroqText } from '@tanstack/ai-groq'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import { createGeminiChat } from '@tanstack/ai-gemini'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createOllamaChat } from '@tanstack/ai-ollama'

export function createAdapter(config: AdapterConfig): AnyTextAdapter {
  switch (config.provider) {
    case 'groq':
      // Package dedicado @tanstack/ai-groq — NÃO openaiText com baseUrl
      return createGroqText(config.model, config.apiKey)
    case 'nvidia':
      // NVIDIA NIM é OpenAI Chat Completions-compatible
      // openaiChatCompletions usa /v1/chat/completions (não /v1/responses)
      return createOpenaiChatCompletions(config.model, config.apiKey, {
        baseURL: config.baseUrl ?? 'https://integrate.api.nvidia.com/v1',
      })
    case 'openrouter':
      // OpenRouter também é Chat Completions-compatible
      return createOpenaiChatCompletions(config.model, config.apiKey, {
        baseURL: 'https://openrouter.ai/api/v1',
      })
    case 'gemini':
      return createGeminiChat(config.model, config.apiKey)
    case 'anthropic':
      return createAnthropicChat(config.model, config.apiKey)
    case 'ollama':
      return createOllamaChat(config.model, config.baseUrl ?? 'http://localhost:11434')
  }
}
```

**Distinção crítica**: `openaiText()` usa a Responses API (`/v1/responses`) — exclusiva do OpenAI. NVIDIA NIM e OpenRouter implementam Chat Completions (`/v1/chat/completions`), então DEVEM usar `openaiChatCompletions()`.

### D3: Groq via `@tanstack/ai-groq` (package dedicado)

**Escolha**: Usar `groqText()` / `createGroqText()` de `@tanstack/ai-groq` (v0.2.7 no npm).

**Descartado**: `openaiText()` com baseUrl — a proposta anterior assumia que Groq usaria o adapter OpenAI genérico. Groq tem package dedicado com suporte a features específicas (reasoning_effort, modelos Llama 4, etc).

**Ref**: https://tanstack.com/ai/latest/docs/adapters/groq

### D4: Chart-spec como tool call `render_chart`

**Escolha**: Eliminar parsing de blocos ` ```chart-spec ``` ` via regex/buffer. O LLM chama tool `render_chart` com parâmetros Zod. A tool valida SQL, executa query, retorna dados.

```ts
const renderChart = toolDefinition({
  name: 'render_chart',
  description: 'Gera um gráfico executando SQL no banco analytics do sisub.',
  inputSchema: z.object({
    sql: z.string().meta({ description: 'SQL SELECT query' }),
    type: z.enum(['bar', 'line', 'area', 'pie', 'table']),
    title: z.string(),
    description: z.string().optional(),
    xAxisKey: z.string(),
    series: z.array(z.object({
      key: z.string(),
      label: z.string(),
      color: z.string().optional(),
    })),
  }),
}).server(async ({ sql, type, title, description, xAxisKey, series }) => {
  validateSql(sql)
  const rows = await executeSql(supabase, sql)
  return { type, title, description, xAxisKey, series, data: normalizeChartRows(rows) }
})
```

**Vantagens**: Elimina 375 LOC de state machine. Se SQL falhar, LLM está no loop e pode corrigir. Chart data chega como `ToolResultPart` nos `message.parts`.

**Ref**: https://tanstack.com/ai/latest/docs/tools/tools

### D5: Agent loop via middleware (não `maxIterations`)

**Escolha**: `chat()` já itera automaticamente quando tools retornam resultados. Controle de max iterations via middleware customizado:

```ts
import type { ChatMiddleware } from '@tanstack/ai'

const MAX_TOOL_ROUNDS = 8

const maxIterationsMiddleware: ChatMiddleware = {
  name: 'max-iterations',
  onConfig: (ctx) => {
    if (ctx.phase === 'beforeModel' && ctx.iteration >= MAX_TOOL_ROUNDS) {
      ctx.abort('Limite de iterações atingido')
    }
  },
}
```

**Descartado**: `agentLoopStrategy: maxIterations(8)` — NÃO existe na API real (v0.18.0). O grep no source code instalado confirma ausência. O agent loop é implícito no `chat()` e controlável via middleware hooks.

**Ref**: https://tanstack.com/ai/latest/docs/advanced/middleware (veja `ctx.iteration`, `ctx.abort()`)

### D6: `otelMiddleware` built-in (não wrapper custom)

**Escolha**: Usar `otelMiddleware` de `@tanstack/ai/middlewares/otel` — já cria spans automáticos para chat calls e tool executions.

```ts
import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
import { trace, metrics } from '@opentelemetry/api'

const otel = otelMiddleware({
  tracer: trace.getTracer('sisub'),
  meter: metrics.getMeter('sisub'),
  captureContent: false, // PII-safe
})

const stream = chat({
  adapter,
  messages,
  middleware: [otel, maxIterationsMiddleware],
})
```

**Spans automáticos**:
- Root span: `chat()` call completo
- Iteration spans: um por iteração do agent loop (`#0`, `#1`, etc.)
- Tool spans: grandchildren das iterations

**Métricas automáticas**:
- `gen_ai.client.operation.duration` (segundos por chat call)
- `gen_ai.client.token.usage` (tokens por iteração)

**Extensão**: `spanNameFormatter`, `attributeEnricher`, `onSpanEnd` para métricas custom.

**Descartado**: Wrapper custom `withTracing(adapter)` — desnecessário, o TanStack AI já resolve nativamente.

**Dep**: Apenas `@opentelemetry/api` como peer dep.

**Ref**: https://tanstack.com/ai/latest/docs/advanced/otel

### D7: `useChat` callbacks para persistência (substituir useChatSession.ts)

**Escolha**: Persistência Supabase via `onFinish` callback do `useChat`. React Query mutations com retry para resiliência.

```ts
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const chatState = useChat({
  connection: fetchServerSentEvents('/api/analytics/stream'),
  initialMessages: loadedMessages,
  onFinish: async (message) => {
    await saveChatMessage(sessionId, message)
  },
})
```

**Ref**: https://tanstack.com/ai/latest/docs/getting-started/quick-start

### D8: Alpha mantém LangGraph, usa ai-provider apenas para config

**Escolha**: `@iefa/ai-provider/langchain-compat` exporta `makeChatLLM()` retornando `ChatOpenAI` do LangChain. Alpha usa para config sem migrar runtime.

### D9: Migração sequencial — Sucont primeiro como validação

**Ordem**:
1. **ai-provider package** — Fundação
2. **Sucont** — Caso trivial. Valida stack end-to-end.
3. **Sisub Analytics Chat** — Chart-spec como tool call + useChat
4. **Sisub Module Chat** — Tool calling + PBAC + max iterations middleware
5. **Alpha config** — Apenas config de providers
6. **Cleanup**

## Risks / Trade-offs

**[TanStack AI maturity]** — v0.18.0. `@tanstack/ai-groq` v0.2.7.
→ **Mitigação**: Sucont primeiro como spike. Se falhar, custo baixo.

**[openaiText vs openaiChatCompletions]** — Confusão entre as duas APIs. `openaiText` usa Responses API, `openaiChatCompletions` usa Chat Completions. NVIDIA NIM e OpenRouter DEVEM usar `openaiChatCompletions`.
→ **Mitigação**: Documentar claramente no ai-provider. Type-safe via ProviderType enum.

**[Agent loop sem maxIterations explícito]** — O loop é implícito. Sem middleware, pode loopear indefinidamente.
→ **Mitigação**: `maxIterationsMiddleware` OBRIGATÓRIO em todos os handlers com tools. Incluir no ai-provider como export utilitário.

**[Chart-spec como tool call — mudança de prompt]** — LLM precisa aprender a chamar `render_chart` em vez de emitir markdown fences.
→ **Mitigação**: Tool calling é mais estruturado. LLMs modernos são treinados para tool use. Menos propenso a erros que regex.

**[Groq rate limits]** — Free tier agressivo.
→ **Mitigação**: Fallback provider wrapper no ai-provider.

**[OTEL backend necessário]** — `otelMiddleware` exporta spans via OTLP. Precisa de collector.
→ **Mitigação**: Opt-in. Sem `OTEL_EXPORTER_OTLP_ENDPOINT`, `@opentelemetry/api` retorna no-op tracers.

## Migration Plan

### Fase 1: ai-provider (Sprint 1)
1. Criar `packages/ai-provider`
2. Implementar adapters: `@tanstack/ai-groq`, `@tanstack/ai-openai` (openaiChatCompletions), `@tanstack/ai-gemini`, `@tanstack/ai-anthropic`, `@tanstack/ai-ollama`
3. Factory `createAdapter()`, `createAdapterFromEnv()`
4. Fallback wrapper `withFallback()`
5. Max iterations middleware export
6. `langchain-compat.ts` para alpha
7. Testes

### Fase 2: Sucont (Sprint 2)
1. Server endpoint Nitro com `chat()` + `toServerSentEventsResponse()`
2. Client `useChat({ connection: fetchServerSentEvents() })`
3. Remover `@google/genai`

### Fase 3: Sisub Analytics (Sprint 3)
1. Tool `render_chart` via `toolDefinition().server()`
2. Update system prompt
3. Server handler com `chat()` + `otelMiddleware` + tool
4. Client `useChat` + persistência via `onFinish`
5. Remover useChatSession.ts, analytics-chat.stream.ts

### Fase 4: Sisub Module Chat (Sprint 4)
1. Tool registry → `toolDefinition().server()` com PBAC
2. Server handler com `chat()` + `maxIterationsMiddleware` + tools
3. Client `useChat` com rendering de ToolResultPart/ToolCallPart
4. Remover LangChain do module-chat

### Fase 5: Alpha Config (Sprint 5)
1. `@iefa/ai-provider/langchain-compat` nos nós do graph
2. Env vars por provider

### Fase 6: Cleanup (Sprint 6)
1. Remover LangChain do sisub
2. Deprecar alpha-client
3. Biome check

### Rollback
Cada sprint é independente. Rollback = reverter commit.

## Open Questions

1. **Nitro + `toServerSentEventsResponse()`**: O sisub usa TanStack Start com Nitro. O quick start mostra TanStack Start server handlers retornando `Response` diretamente — precisa validar com o Nitro `defineHandler` do sisub (que usa H3 events, não Request/Response web standard).
2. **Tool result rendering**: `useChat` entrega tool results como `ToolResultPart` nos `message.parts`. Como a UI do analytics identifica que um ToolResultPart de `render_chart` deve renderizar um chart component? Provavelmente via `part.toolName === 'render_chart'`.
3. **OTEL backend**: Grafana Tempo (self-hosted) ou serviço externo? Definir antes do Sprint 3.
