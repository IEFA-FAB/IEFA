## Why

O monorepo IEFA possui 4 implementações independentes de integração com LLMs — cada uma com seu próprio streaming manual (ReadableStream + SSE), state management, e provider hardcoded. Isso gera duplicação significativa, dificulta a adição de novos providers, e impede reutilização de hooks e componentes entre apps. O sucont já adotou `@tanstack/ai` com suporte multiprovider, provando que a stack funciona no ecossistema. Hora de consolidar sisub, alpha e o pacote compartilhado nesse padrão.

## What Changes

- **Novo pacote `packages/ai-provider`** — Factory `createAdapter()` que retorna adapters reais do TanStack AI para 6 providers: Groq (`@tanstack/ai-groq`), NVIDIA NIM e OpenRouter (`openaiChatCompletions` de `@tanstack/ai-openai`), Gemini (`@tanstack/ai-gemini`), Anthropic (`@tanstack/ai-anthropic`), Ollama (`@tanstack/ai-ollama`). Substitui `packages/alpha-client`.
- **Sisub Analytics Chat migra para TanStack AI** — O chart-spec muda de buffer regex (375 LOC de state machine) para **tool call `render_chart`** via `toolDefinition().server()`. Server usa `chat()` + `toServerSentEventsResponse()`. Client usa `useChat` + `fetchServerSentEvents` de `@tanstack/ai-react`.
- **Sisub Module Chat migra para TanStack AI** — Agentic loop manual (8 rounds, `bindTools()`) substituído por loop built-in do `chat()` + `maxIterationsMiddleware(8)` via middleware API. PBAC e tool registry mantidos via `toolDefinition().server()`.
- **Observabilidade via `otelMiddleware`** — TanStack AI tem middleware OpenTelemetry built-in (`@tanstack/ai/middlewares/otel`) que cria spans automáticos para chat, iterations e tools. Substitui LangSmith tracing perdido ao remover LangChain.
- **Alpha usa ai-provider para config** — LangGraph permanece. `@iefa/ai-provider/langchain-compat` exporta `makeChatLLM()` backward-compatible.
- **Sucont consolida no ai-provider** — Migra primeiro como validação end-to-end da stack.
- **Client-side unificado** — `useChat` + `fetchServerSentEvents` substituem EventSource manual e `useChatSession.ts` (346 LOC). Persistência Supabase via `onFinish` callback.

## Capabilities

### New Capabilities
- `ai-provider-package`: Pacote `packages/ai-provider` com factory `createAdapter()` retornando adapters TanStack AI reais. `createAdapterFromEnv(prefix?)`, `withFallback()`, `maxIterationsMiddleware()`, e `langchain-compat`.
- `tanstack-ai-streaming`: Server: `chat()` + `toServerSentEventsResponse()`. Client: `useChat({ connection: fetchServerSentEvents(url) })` de `@tanstack/ai-react`. Persistência via `onFinish`.
- `multiprovider-tool-calling`: Tools via `toolDefinition().server()`. Nova tool `render_chart` para analytics. Agent loop built-in + max iterations middleware. PBAC via filtragem de tools.
- `ai-observability`: `otelMiddleware` built-in de `@tanstack/ai/middlewares/otel` com spans automáticos, métricas GenAI standard, e extension hooks.

### Modified Capabilities
_(Nenhuma spec existente para modificar)_

## Não-objetivos

- **Não migrar LangGraph StateGraph do Alpha** — Apenas config de providers muda.
- **Não migrar sisub-mcp** — Não faz chamadas LLM.
- **Não unificar UI de chat entre apps** — Cada app mantém seu design system.
- **Não remover OpenRouter** — Continua como gateway/fallback via `openaiChatCompletions`.
- **Não alterar PBAC ou permission scoping**.
- **Não alterar schema Supabase** (chat_sessions/chat_messages permanecem).

## Impact

**Apps afetados**: `sisub`, `alpha`, `sucont`

**Pacotes afetados**:
- `packages/alpha-client` → deprecated/absorvido por `packages/ai-provider`
- `packages/ai-provider` → novo pacote

**Dependências removidas**:
- `@langchain/openai`, `@langchain/core` (sisub, alpha-client)
- `@google/genai` (sucont)

**Dependências adicionadas**:
- `@tanstack/ai`, `@tanstack/ai-react`, `@tanstack/ai-client` (sisub, sucont)
- `@tanstack/ai-groq` (ai-provider)
- `@tanstack/ai-openai` (ai-provider — para NVIDIA NIM e OpenRouter via `openaiChatCompletions`)
- `@tanstack/ai-anthropic`, `@tanstack/ai-gemini`, `@tanstack/ai-ollama` (ai-provider)
- `@opentelemetry/api` (peer dep para otelMiddleware)

**APIs afetadas**:
- `POST /api/analytics/stream` (sisub) — chart-spec muda de markdown fence para tool call
- `POST /api/module-chat/stream` (sisub) — implementação interna muda
- `POST /api/v1/sessions/:id/messages/stream` (alpha) — apenas config providers

**Breaking changes**: Analytics chat client precisa adaptar renderização de chart data (de evento `chart_spec` custom para `ToolResultPart` nos `message.parts`).
