## ADDED Requirements

### Requirement: Server handler via `chat()` + `toServerSentEventsResponse()`
Todas as rotas de chat streaming DEVEM usar `chat()` de `@tanstack/ai` e converter via `toServerSentEventsResponse()` para retornar SSE Response.

Ref: https://tanstack.com/ai/latest/docs/getting-started/quick-start

#### Scenario: Analytics chat streaming
- **WHEN** client envia POST para `/api/analytics/stream` com mensagem e histórico
- **THEN** o handler cria `chat({ adapter, messages, tools: [renderChart], systemPrompts, middleware: [otel] })`
- **AND** retorna `toServerSentEventsResponse(stream)`

#### Scenario: Module chat streaming com tools
- **WHEN** client envia POST para `/api/module-chat/stream` com mensagem, módulo e permissões
- **THEN** o handler cria `chat({ adapter, messages, tools, middleware: [otel, maxIterationsMiddleware(8)] })`
- **AND** retorna `toServerSentEventsResponse(stream)`

#### Scenario: Sucont chat streaming (novo)
- **WHEN** client envia POST para `/api/chat/stream` do sucont
- **THEN** o handler cria `chat({ adapter, messages, systemPrompts })`
- **AND** retorna `toServerSentEventsResponse(stream)` (sucont ganha streaming)

### Requirement: Hook `useChat` com `fetchServerSentEvents` como padrão client-side
Todos os apps DEVEM usar `useChat` de `@tanstack/ai-react` com `connection: fetchServerSentEvents(url)`. `fetchServerSentEvents` é importado de `@tanstack/ai-react`.

Ref: https://tanstack.com/ai/latest/docs/getting-started/quick-start

#### Scenario: Analytics chat usa useChat
- **WHEN** o componente ChatInterface monta
- **THEN** usa:
```tsx
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

const { messages, sendMessage, isLoading, status, stop } = useChat({
  connection: fetchServerSentEvents('/api/analytics/stream'),
  initialMessages,
  onFinish,
})
```
- **AND** `messages` são a source of truth (substituem useState manual)
- **AND** `message.parts` contém `TextPart`, `ToolCallPart`, `ToolResultPart`

#### Scenario: Sucont AI assistant usa useChat
- **WHEN** o componente AIAssistant monta
- **THEN** usa `useChat({ connection: fetchServerSentEvents('/api/chat/stream') })`
- **AND** respostas são streamed token a token
- **AND** `status === 'streaming'` substitui `isLoading`

#### Scenario: Abort de streaming
- **WHEN** usuário clica em "cancelar"
- **THEN** `stop()` do `useChat` aborta a requisição
- **AND** `status` muda para `'ready'`

### Requirement: Persistência Supabase via callbacks do useChat
Persistência no Supabase DEVE ser via `onFinish` callback, substituindo `useChatSession.ts` (346 LOC custom).

#### Scenario: Mensagem salva após streaming completo
- **WHEN** streaming termina
- **THEN** `onFinish(message)` é invocado pelo hook
- **AND** mensagem salva em `chat_messages` via React Query mutation com retry
- **AND** se `message.parts` contém ToolResultPart de `render_chart`, chart data salvo junto

#### Scenario: Sessão existente carregada
- **WHEN** usuário seleciona sessão na sidebar
- **THEN** mensagens carregadas do Supabase → `setMessages(loaded)` no hook

#### Scenario: Erro ao salvar
- **WHEN** `onFinish` falha
- **THEN** React Query mutation retry (3x) trata fallback
- **AND** mensagem permanece visível no UI (state do useChat não afetado)

### Requirement: Streaming no Sucont (novo)
Sucont AIAssistant DEVE migrar de `await ai.models.generateContent()` para streaming via `useChat`.

#### Scenario: Resposta streamed no chat bubble
- **WHEN** usuário envia mensagem no AIAssistant
- **THEN** resposta aparece token a token via `messages` do `useChat`
- **AND** `status === 'streaming'` substitui spinner fixo
- **AND** system prompt e context assembly movidos para server endpoint
