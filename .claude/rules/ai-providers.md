---
paths:
  - "packages/ai-provider/**"
  - "apps/alpha/**"
  - "apps/contrate/src/**"
  - "apps/sucont/src/**/ai/**"
  - "apps/sisub/src/lib/module-chat/**"
  - "apps/sisub/src/lib/capabilities.server.ts"
  - "apps/*/src/routes/api/**"
---

# Providers de IA: Bedrock primeiro

Referência completa: `AI-PROVIDERS.md` na raiz (mapa dos consumidores, semântica da reserva, tetos
de consumo, dívida de sucont/alpha).

- Todo consumidor de modelo usa AWS Bedrock no primário (keyless, pela task role do ECS). Provider com
  API key existe só como reserva, no prefixo `<PREFIX>_FALLBACK_AI_*`.
- O adapter sai sempre de `createAdapterFromEnv("<PREFIX>", { rateLimitKey: userId })`, que monta
  primário + reserva + tetos a partir do env. Não instanciar provider direto num app.
- A reserva só troca antes do primeiro conteúdo e só em falha transitória (429/5xx/throttling/timeout).
  Erro de schema, credencial ou tool malformada propaga: trocar de provider repetiria a falha.
- Endpoint que abre SSE chama `enforceRequestRateLimit` antes do stream e traduz `RateLimitError` em
  429. Depois que o SSE começa não há mais status HTTP; o erro vira conexão cortada sem mensagem.
- Fluxo de IA não quebra o boot: sem as vars, a tela fica "Em breve" e o endpoint responde 503
  (`capabilities.server.ts`).
