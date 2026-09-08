> **Revisão de 2026-09-08 (auditoria de estado real).** As 7 tarefas que estavam abertas foram
> conferidas contra o código. Resultado: **40 feitas / 5 caducas / 1 viva** (46 no total).
> As caducas são 2.6, 3.9, 4.5, 5.4 e 5.5 — todas mandavam validar contra Gemini/Groq/OpenRouter/
> NVIDIA, e o repo migrou para **AWS Bedrock no primário**, com provider de API key só como reserva
> (`AI-PROVIDERS.md`). Elas ficam riscadas, com o motivo na própria linha, em vez de marcadas
> como feitas: nunca serão executadas como escritas. A única viva é a **6.3**.

## 1. Package ai-provider — Fundação

- [x] 1.1 [ai-provider] Criar `packages/ai-provider` com `package.json`, `tsconfig.json`, e export map (`"."`, `"./groq"`, `"./nvidia"`, `"./openrouter"`, `"./gemini"`, `"./anthropic"`, `"./ollama"`, `"./langchain-compat"`)
- [x] 1.2 [ai-provider] Definir tipos `AdapterConfig`, `ProviderType`, e tipo de retorno (re-export `AnyTextAdapter` de `@tanstack/ai`)
- [x] 1.3 [ai-provider] Implementar adapter Groq: `providers/groq.ts` usando `createGroqText()` de `@tanstack/ai-groq` (ref: https://tanstack.com/ai/latest/docs/adapters/groq)
- [x] 1.4 [ai-provider] Implementar adapters OpenAI Chat Completions-compatible: `providers/nvidia.ts` e `providers/openrouter.ts` usando `createOpenaiChatCompletions()` de `@tanstack/ai-openai` com `baseURL` custom (ref: https://tanstack.com/ai/latest/docs/adapters/openai — seção `openaiChatCompletions`)
- [x] 1.5 [ai-provider] Implementar adapter Gemini: `providers/gemini.ts` via `createGeminiChat()` de `@tanstack/ai-gemini` (ref: https://tanstack.com/ai/latest/docs/adapters/gemini)
- [x] 1.6 [ai-provider] Implementar adapter Anthropic: `providers/anthropic.ts` via `createAnthropicChat()` de `@tanstack/ai-anthropic` (ref: https://tanstack.com/ai/latest/docs/adapters/anthropic)
- [x] 1.7 [ai-provider] Implementar adapter Ollama: `providers/ollama.ts` via `createOllamaChat()` de `@tanstack/ai-ollama` (ref: https://tanstack.com/ai/latest/docs/adapters/ollama)
- [x] 1.8 [ai-provider] Implementar factory `createAdapter(config: AdapterConfig): AnyTextAdapter` com switch por provider
- [x] 1.9 [ai-provider] Implementar `createAdapterFromEnv(prefix?)` que lê `{PREFIX_}AI_PROVIDER`, `{PREFIX_}AI_MODEL`, `{PREFIX_}AI_API_KEY`, `{PREFIX_}AI_BASE_URL`
- [x] 1.10 [ai-provider] Implementar `withFallback(primary, fallback)` — wrapper que intercepta 429/503 e retenta no fallback
- [x] 1.11 [ai-provider] Implementar `maxIterationsMiddleware(n): ChatMiddleware` — usa `ctx.iteration >= n → ctx.abort()` (ref: https://tanstack.com/ai/latest/docs/advanced/middleware)
- [x] 1.12 [ai-provider] Implementar `langchain-compat.ts` — export `makeChatLLM(config)` que retorna `ChatOpenAI` do `@langchain/openai`
- [x] 1.13 [ai-provider] Adicionar testes unitários para factory, adapters, fallback (Bun test)
- [x] 1.14 [root] Registrar `packages/ai-provider` no workspace do monorepo

## 2. Sucont — Validação da Stack

- [x] 2.1 [sucont] Criar server endpoint para streaming: `routes/api/chat/stream.post.ts` usando `chat()` + `toServerSentEventsResponse()` + `createAdapterFromEnv('SUCONT')` (ref: https://tanstack.com/ai/latest/docs/getting-started/quick-start — seção TanStack Start)
- [x] 2.2 [sucont] Mover system prompt (Oráculo SUCONT) e context assembly para o server endpoint
- [x] 2.3 [sucont] Migrar `AIAssistant.tsx` de `@google/genai` + `await` para `useChat({ connection: fetchServerSentEvents('/api/chat/stream') })` — importar `useChat, fetchServerSentEvents` de `@tanstack/ai-react`
- [x] 2.4 [sucont] Adaptar UI: `status === 'streaming'` substitui `isLoading`, `messages` do hook substituem `useState<Message[]>`
- [x] 2.5 [sucont] Remover `@google/genai` do `package.json` — ~~bloqueado: gemini.fn.ts e conta-generica.fn.ts ainda usam @google/genai (fora do escopo desta migração)~~ **FEITA** em `19e8a2c5` (PR #68, "wire DB + PBAC + Bedrock"): a dependência saiu de `apps/sucont/package.json`, `src/server/gemini.fn.ts` deixou de existir e o `conta-generica.fn.ts` passou a chamar `#/lib/ai.server` (→ `@iefa/ai-provider`). O `@google/genai` que sobra no `bun.lock:914` é transitivo de `@tanstack/ai-gemini`, não dependência do app.
- [ ] ~~2.6 [sucont] Testar com Gemini e Groq — validar streaming end-to-end (requer env vars SUCONT_AI_*)~~ — **CADUCA**: o sucont não fala mais com Gemini nem com Groq. Primário e reserva são os dois Bedrock (`AI-PROVIDERS.md`, tabela "Quem consome IA hoje": `SUCONT_AI_*` = `global.anthropic.claude-opus-4-6-v1`, reserva `openai.gpt-oss-120b-1:0`), e não há mais SDK do Gemini no app (ver 2.5). A validação end-to-end equivalente foi feita contra o Bedrock, nos três caminhos reais do app, por `apps/sucont/model-bench.ts` — bench registrado em `AI-PROVIDERS.md`, "Escolha do modelo do oráculo".

## 3. Sisub Analytics Chat — Tool Call `render_chart`

- [x] 3.1 [sisub] Instalar `@tanstack/ai`, `@tanstack/ai-react`, `@tanstack/ai-client`, `@iefa/ai-provider`, `@opentelemetry/api`
- [x] 3.2 [sisub] Criar tool `render_chart` via `toolDefinition().server()` — inputSchema Zod com `{ sql, type, title, xAxisKey, series }`, handler valida SQL + executa query + retorna rows (ref: https://tanstack.com/ai/latest/docs/tools/tools)
- [x] 3.3 [sisub] Atualizar system prompt `ANALYTICS_SYSTEM_PROMPT` — instruir LLM a usar tool `render_chart` em vez de blocos ` ```chart-spec ``` `
- [x] 3.4 [sisub] Reescrever `routes/api/analytics/stream.post.ts`: `chat({ adapter: createAdapterFromEnv('ANALYTICS'), messages, tools: [renderChart], systemPrompts, middleware: [otelMiddleware({ tracer })] })` + `toServerSentEventsResponse(stream)` (ref: https://tanstack.com/ai/latest/docs/advanced/otel)
- [x] 3.5 [sisub] Migrar client: substituir `useAnalyticsStream` (EventSource manual) por `useChat({ connection: fetchServerSentEvents('/api/analytics/stream') })`
- [x] 3.6 [sisub] Adaptar `ChatInterface.tsx` — renderizar `ToolResultPart` onde `toolName === 'render_chart'` como chart component
- [x] 3.7 [sisub] Persistência Supabase via `onFinish` callback — salvar mensagem + chart data via React Query mutation com retry
- [x] 3.8 [sisub] Carregar sessão existente: Supabase → `setMessages()` no hook
- [ ] ~~3.9 [sisub] Testar com Groq, OpenRouter e Gemini — streaming, chart via tool call, persistência, fallback 429~~ — **CADUCA**: `ANALYTICS_AI_*` é Bedrock no primário e Groq apenas como reserva (`infra/sisub/secrets/sisub.example.json:17-23`); OpenRouter e Gemini não são destino de nenhum consumidor do monorepo (`AI-PROVIDERS.md`, "Quem consome IA hoje"). O endpoint monta o adapter só a partir do env (`apps/sisub/routes/api/analytics/stream.post.ts:84`), então provider deixou de ser variável de teste. Observação (não é tarefa nova): o smoke opt-in de provider existe só para `MODULE_CHAT_AI_*` (`apps/sisub/src/test/ai/provider-smoke.test.ts`), não para `ANALYTICS_AI_*`.
- [x] 3.10 [sisub] Remover `analytics-chat.stream.ts`, helpers SSE manuais (`useChatSession.ts` foi reescrito, não removido)

## 4. Sisub Module Chat — Tool Calling + PBAC

- [x] 4.1 [sisub] Converter tool definitions para `toolDefinition({ name, description, inputSchema }).server(handler)` — injetar `ToolContext` via closure (ref: https://tanstack.com/ai/latest/docs/tools/tools)
- [x] 4.2 [sisub] Adaptar `registry.ts` — `getModuleConfig()` retorna array de tool instances filtrados por PBAC level
- [x] 4.3 [sisub] Reescrever `routes/api/module-chat/stream.post.ts`: `chat({ adapter, messages, tools: filteredTools, middleware: [otelMiddleware({ tracer }), maxIterationsMiddleware(8)] })` + `toServerSentEventsResponse()`
- [x] 4.4 [sisub] Adaptar UI module-chat — renderizar `ToolCallPart`/`ToolResultPart` dos `message.parts` do `useChat`
- [ ] ~~4.5 [sisub] Testar com Groq e OpenRouter — PBAC, tool execution, max 8 rounds, erros~~ — **CADUCA** no que manda escolher provider: `MODULE_CHAT_AI_*` é Bedrock no primário e Groq só como reserva (`infra/sisub/secrets/sisub.example.json:7-13`). A substância virou suíte permanente contra o provider realmente configurado: `apps/sisub/src/test/ai/provider-smoke.test.ts` (tool call real + validação dos argumentos que o modelo mandou) e `apps/sisub/src/lib/module-chat/tools/model-args.test.ts` (contrato exaustivo, offline). O teto de rodadas está aplicado em `apps/sisub/routes/api/module-chat/stream.post.ts:173` (`maxIterationsMiddleware(8)`).
- [x] 4.6 [sisub] Remover imports `@langchain/openai` e `@langchain/core/messages`

## 5. Alpha — Integração ai-provider para Config

- [x] 5.1 [alpha] Adicionar `@iefa/ai-provider` como dependência
- [x] 5.2 [alpha] Substituir `import { makeChatLLM } from '@iefa/alpha-client/llm'` por `import { makeChatLLM } from '@iefa/ai-provider/langchain-compat'`
- [x] 5.3 [alpha] Adicionar env vars `ALPHA_AI_PROVIDER`, `ALPHA_AI_MODEL` em `src/env.ts` — fallback para atuais
- [ ] ~~5.4 [alpha] Testar graph completo com NVIDIA NIM via ai-provider~~ — **CADUCA**: o chat do α não passa mais pela NVIDIA. `ALPHA_AI_PROVIDER` tem default `"bedrock"` (`apps/alpha/src/env.ts:20`), `getLLM` constrói `ChatBedrockConverse` nesse caminho (`apps/alpha/src/lib/llm.ts:33`, commit `806bf3a7` / PR #191) e o infra já vem com Bedrock (`infra/alpha/terraform.tfvars.example:26`). A NVIDIA sobrevive só como caminho alternativo por API key e nos embeddings/rerank (`AI-PROVIDERS.md`, "Dívida registrada — alpha"). Nota: a linha do α na tabela de `AI-PROVIDERS.md` ainda diz `nvidia` e está atrasada em relação ao código — correção fora do escopo desta change.
- [ ] ~~5.5 [alpha] Testar nós individuais com Groq e Anthropic~~ — **CADUCA**: a regra do repo é Bedrock no primário, com provider de API key existindo só como reserva sob `<PREFIX>_FALLBACK_AI_*` (`AI-PROVIDERS.md`, abertura). O α não tem reserva nenhuma — `ALPHA_FALLBACK_AI_*` não existe em lugar algum do repo (grep vazio) —, então não há caminho para Groq nem para Anthropic a exercitar.

## 6. Cleanup e Deprecation

- [x] 6.1 [sisub] Remover `@langchain/openai` e `@langchain/core` do `package.json`
- [x] 6.2 [sisub] Remover arquivos obsoletos: `analytics-chat.stream.ts`, `useChatSession.ts`, helpers SSE manuais
- [ ] 6.3 [alpha-client] Deprecar `packages/alpha-client` — **VIVA, e só metade andou**: `src/llm.ts` já é código morto (nenhum importador de `@iefa/alpha-client/llm`; o α passou para `@iefa/ai-provider/langchain-compat` em `apps/alpha/src/lib/llm.ts:1`), mas o pacote continua vivo por `createRunCollector` de `src/tracer.ts`, importado em `apps/alpha/src/api/routes.ts:2`. Falta: absorver/mover o `tracer.ts`, apagar `llm.ts` e as deps `@langchain/openai`/`@langchain/core` de `packages/alpha-client/package.json`, e então tirar o pacote de `knip.json:68`, do `Dockerfile` (linhas 30 e 327) e de `.github/paths-filter.yml:147`.
- [x] 6.4 [sucont] Limpar deps não usadas
- [x] 6.5 [root] `bun run check` — Biome format + lint + typecheck
