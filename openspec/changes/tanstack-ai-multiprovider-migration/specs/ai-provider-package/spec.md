## ADDED Requirements

### Requirement: Factory `createAdapter()` retornando adapter real do TanStack AI
O sistema DEVE exportar uma função `createAdapter(config: AdapterConfig)` que retorna um adapter TanStack AI real. Cada provider usa seu package/função dedicado conforme documentação oficial.

Ref: https://tanstack.com/ai/latest/docs/adapters/

#### Scenario: Criar adapter Groq
- **WHEN** `createAdapter({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_...' })` é chamado
- **THEN** retorna `createGroqText('llama-3.3-70b-versatile', 'gsk_...')` de `@tanstack/ai-groq`
- **AND** o retorno pode ser passado diretamente para `chat({ adapter: ... })`

#### Scenario: Criar adapter NVIDIA NIM
- **WHEN** `createAdapter({ provider: 'nvidia', model: 'meta/llama-3.1-405b-instruct', apiKey: 'nvapi-...' })` é chamado
- **THEN** retorna `createOpenaiChatCompletions('meta/llama-3.1-405b-instruct', 'nvapi-...', { baseURL: 'https://integrate.api.nvidia.com/v1' })` de `@tanstack/ai-openai`
- **AND** usa `openaiChatCompletions` (Chat Completions API), NÃO `openaiText` (Responses API)

#### Scenario: Criar adapter OpenRouter
- **WHEN** `createAdapter({ provider: 'openrouter', model: 'google/gemini-2.0-flash-001', apiKey: 'sk-or-...' })` é chamado
- **THEN** retorna `createOpenaiChatCompletions()` com `baseURL: 'https://openrouter.ai/api/v1'`

#### Scenario: Criar adapter Google Gemini
- **WHEN** `createAdapter({ provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'AIza...' })` é chamado
- **THEN** retorna `createGeminiChat('gemini-2.0-flash', 'AIza...')` de `@tanstack/ai-gemini`

#### Scenario: Criar adapter Anthropic
- **WHEN** `createAdapter({ provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'sk-ant-...' })` é chamado
- **THEN** retorna `createAnthropicChat('claude-sonnet-4-20250514', 'sk-ant-...')` de `@tanstack/ai-anthropic`

#### Scenario: Criar adapter Ollama
- **WHEN** `createAdapter({ provider: 'ollama', model: 'llama3.2', baseUrl: 'http://localhost:11434' })` é chamado sem apiKey
- **THEN** retorna `createOllamaChat('llama3.2', 'http://localhost:11434')` de `@tanstack/ai-ollama`

#### Scenario: Provider inválido
- **WHEN** `createAdapter({ provider: 'invalido' as any, ... })` é chamado
- **THEN** DEVE lançar erro descritivo listando os providers válidos

### Requirement: Subpath exports tree-shakeable
O pacote DEVE exportar cada provider como subpath export separado para tree-shaking.

#### Scenario: Import de provider específico
- **WHEN** um app importa `import { createGroqAdapter } from '@iefa/ai-provider/groq'`
- **THEN** apenas `@tanstack/ai-groq` é incluído no bundle

#### Scenario: Import da factory genérica
- **WHEN** um app importa `import { createAdapter } from '@iefa/ai-provider'`
- **THEN** a factory com todos os providers está disponível

### Requirement: Configuração via environment variables
O pacote DEVE exportar `createAdapterFromEnv(prefix?: string)` que lê `{PREFIX_}AI_PROVIDER`, `{PREFIX_}AI_MODEL`, `{PREFIX_}AI_API_KEY`, `{PREFIX_}AI_BASE_URL`.

#### Scenario: Adapter via env vars padrão
- **WHEN** `AI_PROVIDER=groq`, `AI_MODEL=llama-3.3-70b-versatile`, `AI_API_KEY=gsk_...` estão definidos
- **AND** `createAdapterFromEnv()` é chamado
- **THEN** retorna adapter Groq via `createGroqText()`

#### Scenario: Adapter com prefix custom
- **WHEN** `ANALYTICS_AI_PROVIDER=openrouter`, `ANALYTICS_AI_MODEL=google/gemini-2.0-flash-001`, `ANALYTICS_AI_API_KEY=sk-or-...`
- **AND** `createAdapterFromEnv('ANALYTICS')` é chamado
- **THEN** retorna adapter OpenRouter via `createOpenaiChatCompletions()`

#### Scenario: Env vars ausentes
- **WHEN** `AI_PROVIDER` não está definido
- **THEN** DEVE lançar erro listando env vars obrigatórias

### Requirement: Fallback provider
O pacote DEVE exportar `withFallback(primary, fallback)` que intercepta 429/503 do primary e retenta no fallback.

#### Scenario: Fallback em rate limit
- **WHEN** primary (Groq) retorna HTTP 429
- **AND** fallback (OpenRouter) configurado via `withFallback(groqAdapter, openrouterAdapter)`
- **THEN** requisição retentada automaticamente no fallback

#### Scenario: Sem fallback
- **WHEN** adapter usado sem `withFallback()`
- **AND** retorna HTTP 429
- **THEN** erro propagado ao chamador

### Requirement: Max iterations middleware
O pacote DEVE exportar `maxIterationsMiddleware(n: number): ChatMiddleware` para limitar rounds de tool calling. O middleware usa `ctx.iteration` e `ctx.abort()` da API de middleware do TanStack AI.

Ref: https://tanstack.com/ai/latest/docs/advanced/middleware

#### Scenario: Limite de iterações
- **WHEN** `maxIterationsMiddleware(8)` é incluído no `chat({ middleware: [...] })`
- **AND** o agent loop atinge a 8ª iteração
- **THEN** `ctx.abort()` é chamado, encerrando o loop

#### Scenario: Sem middleware de limite
- **WHEN** nenhum middleware de iteração é incluído
- **THEN** o loop continua enquanto o LLM emitir tool calls (sem limite)

### Requirement: Compatibilidade LangChain para Alpha
O pacote DEVE exportar via `@iefa/ai-provider/langchain-compat` uma função `makeChatLLM(config)` que retorna `ChatOpenAI` do `@langchain/openai`.

#### Scenario: Alpha usa langchain-compat
- **WHEN** alpha importa `import { makeChatLLM } from '@iefa/ai-provider/langchain-compat'`
- **AND** passa `{ provider: 'nvidia', model: 'gpt-oss-120b', apiKey: 'nvapi-...' }`
- **THEN** retorna instância `ChatOpenAI` com baseURL e apiKey corretos
