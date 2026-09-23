## ADDED Requirements

### Requirement: Observabilidade via `otelMiddleware` built-in do TanStack AI
Todos os handlers de chat DEVEM incluir `otelMiddleware` de `@tanstack/ai/middlewares/otel` no array `middleware` do `chat()`. O middleware cria spans automáticos para chat calls, iterações do agent loop, e tool executions.

Ref: https://tanstack.com/ai/latest/docs/advanced/otel

#### Scenario: Spans automáticos criados
- **WHEN** `chat({ adapter, messages, middleware: [otelMiddleware({ tracer, meter })] })` é chamado
- **THEN** um root span é criado para a chamada `chat()` completa
- **AND** iteration spans são criados como children (um por iteração: `#0`, `#1`, etc.)
- **AND** tool spans são criados como grandchildren das iterations

#### Scenario: Métricas de duração e tokens
- **WHEN** uma chamada `chat()` com `otelMiddleware({ tracer, meter })` completa
- **THEN** a métrica `gen_ai.client.operation.duration` (segundos) é registrada
- **AND** a métrica `gen_ai.client.token.usage` (tokens por iteração) é registrada

### Requirement: Configuração OTEL opt-in
O `otelMiddleware` DEVE ser instanciado com `trace.getTracer()` e `metrics.getMeter()` de `@opentelemetry/api`. Sem SDK de tracing configurado, `@opentelemetry/api` retorna no-op implementations (zero overhead).

#### Scenario: OTEL SDK configurado
- **WHEN** `@opentelemetry/sdk-trace-base` está inicializado com exporter OTLP
- **AND** `otelMiddleware({ tracer: trace.getTracer('sisub') })` é usado
- **THEN** spans são exportados para o collector OTLP

#### Scenario: Sem OTEL SDK
- **WHEN** nenhum SDK OpenTelemetry está inicializado
- **AND** `otelMiddleware({ tracer: trace.getTracer('sisub') })` é usado
- **THEN** tracer retorna no-op spans, nenhum overhead adicionado

### Requirement: Extensão com attributes custom
O `otelMiddleware` DEVE ser configurável com `attributeEnricher` para adicionar attributes custom (userId, sessionId, module) aos spans.

Ref: https://tanstack.com/ai/latest/docs/advanced/otel

#### Scenario: Attributes de contexto adicionados
- **WHEN** `otelMiddleware({ tracer, attributeEnricher: () => ({ 'user.id': userId, 'chat.module': module }) })` é configurado
- **THEN** todos os spans incluem os attributes `user.id` e `chat.module`

### Requirement: Content capture desabilitado por padrão (PII)
O `captureContent` do `otelMiddleware` DEVE ser `false` por padrão para evitar logging de PII (mensagens do usuário, respostas do LLM).

#### Scenario: Sem content capture
- **WHEN** `otelMiddleware({ tracer, captureContent: false })` é configurado
- **THEN** spans NÃO incluem conteúdo de mensagens ou respostas
- **AND** apenas metadata (model, tokens, duration, tool names) são registrados
