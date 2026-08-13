# Providers de IA no monorepo

Regra do repo: **quem chama modelo chama Bedrock**. A conta AWS já é a nossa infraestrutura
(ECS, ALB, Secrets Manager, RDS/Supabase à parte), a autenticação é keyless pela task role e
o custo cai na mesma fatura. Provider com API key existe só como **reserva** — para o turno
em que o Bedrock falha antes de responder.

Este arquivo é o mapa: quem consome IA, como o adapter é montado, o que a reserva cobre (e o
que não cobre), como os tetos de consumo funcionam e o que ainda falta migrar.

---

## Quem consome IA hoje

| Consumidor | Prefixo de env | Primário | Reserva | Estado |
|---|---|---|---|---|
| sisub — chat dos módulos | `MODULE_CHAT_AI_*` | **bedrock** | groq | ✅ migrado |
| sisub — assistente de analytics | `ANALYTICS_AI_*` | **bedrock** | groq | ✅ migrado |
| sucont — oráculo | `SUCONT_AI_*` | bedrock | — | ⚠️ já é bedrock, sem reserva nem teto |
| alpha — grafo LangGraph | `ALPHA_AI_*` | nvidia | — | ❌ dívida (ver abaixo) |

`apps/sisub-mcp` não chama modelo: ele **expõe** ferramentas para o modelo do cliente MCP.
Portal, rumaer, forms, docs e api não usam IA.

---

## Como o adapter é montado

Tudo passa por `@iefa/ai-provider`. Um chamador escreve uma linha:

```ts
const adapter = createAdapterFromEnv("MODULE_CHAT", { rateLimitKey: user.id })
```

e recebe, já montados:

1. **primário** — de `MODULE_CHAT_AI_PROVIDER` / `_AI_MODEL` / `_AI_REGION` (bedrock não usa
   `_AI_API_KEY`: autentica pela cadeia de credenciais AWS — task role em prod, profile no
   dev);
2. **reserva** — de `MODULE_CHAT_FALLBACK_AI_*`, se as vars existirem. Ausentes, o adapter
   fica sem reserva, sem erro;
3. **tetos de consumo** — de `MODULE_CHAT_AI_MAX_*`, se existirem.

Nenhuma das três camadas exige mudança no chamador: sem as vars, o comportamento é o de um
adapter simples.

### Modelo no Bedrock

O adapter (`packages/ai-provider/src/providers/bedrock.ts`) fala **Converse/ConverseStream**
do `@aws-sdk/client-bedrock-runtime`, então `_AI_MODEL` é o id do modelo **ou do inference
profile** — não o id curto da API da Anthropic. Modelos Claude fora de `sa-east-1` exigem
perfil de inferência multi-região (prefixo `us.`), e é por isso que a região do chat é
`us-east-1` mesmo com o resto da stack em `sa-east-1`.

**Confirme o id exato antes de setar o secret** — o sufixo de versão muda a cada release:

```sh
aws bedrock list-inference-profiles --region us-east-1 \
  --query "inferenceProfileSummaries[?contains(inferenceProfileId, 'sonnet-4-6')].inferenceProfileId" \
  --output text
```

Escolhas atuais (ver `infra/sisub/secrets/sisub.example.json`):

- **chat dos módulos**: Claude Sonnet 4.6 — é o que sustenta tool-calling com as ~8 tools do
  módulo sem inventar chamada malformada;
- **analytics**: mesmo modelo. Se o custo incomodar, Haiku 4.5 é o degrau abaixo — a tool de
  gráfico tem schema pequeno e tolera modelo menor.

O acesso IAM vem de `infra/foundation/iam.tf` (`bedrock:Converse*`, `bedrock:InvokeModel*`),
atrás da flag `enable_bedrock_task_access` — que precisa estar `true` no `terraform.tfvars`
real da foundation (o default da variável é `false`).

---

## Reserva: o que ela cobre

`withFallbackChain` (`packages/ai-provider/src/fallback.ts`) troca de adapter **só antes do
primeiro conteúdo** e **só em falha transitória**.

- **Transitório** = 429, 408, 5xx, `ThrottlingException`, `overloaded`, timeout, queda de
  conexão. Trocar de provider resolve.
- **Não transitório** = 4xx de schema, credencial inválida, tool malformada. Trocar de
  provider só repetiria a falha, mais devagar e com outra fatura.
- **Depois do primeiro conteúdo** (texto ou tool call) o erro é propagado. Meia resposta de
  um modelo emendada com meia de outro é pior que uma falha honesta.

Dois detalhes que o wrapper existe para resolver:

1. **Adapters em cima do `@tanstack/openai-base` (groq, nvidia, openrouter) não lançam.**
   Eles capturam o erro do provider e emitem um evento `RUN_ERROR` no stream. Um
   `try/catch` em volta do `chatStream` — a versão anterior do `withFallback` — nunca
   disparava com esses providers no primário. A cadeia inspeciona os eventos.
2. **O bedrock lança.** Os dois caminhos são tratados.

---

## Tetos de consumo

`packages/ai-provider/src/rate-limit.ts`. Três limites, todos opcionais:

| Var | Escopo | Para que serve |
|---|---|---|
| `<PREFIX>_AI_MAX_REQUESTS_PER_MINUTE` | por usuário | corta loop de UI e martelada em botão |
| `<PREFIX>_AI_MAX_TOKENS_PER_MINUTE` | por usuário | corta a conversa que cresceu demais |
| `<PREFIX>_AI_MAX_TOKENS_PER_DAY` | por processo | é o teto de custo propriamente dito |

Por que tokens e não só requisições: um chat com tools reenvia o histórico **inteiro** a cada
iteração do loop agêntico. Oito iterações de uma conversa longa custam muito mais que oito
perguntas soltas — contar requisição não enxerga isso.

**O teto de requisições é aplicado no endpoint**, antes de abrir o SSE
(`enforceRequestRateLimit`), porque depois que o stream começa não existe mais status HTTP
para devolver: o erro viraria conexão cortada, sem mensagem. Os tetos de token são checados
dentro do adapter, a cada chamada ao provider — inclusive nas iterações seguintes do mesmo
turno.

**Limitação consciente:** o estado é em memória, por processo. Com N tasks no ECS o teto
efetivo é N × o configurado (sisub roda `desired_count = 2`). Dimensione com isso em mente.
Um teto distribuído (Redis/Postgres) só se justifica quando a frota crescer — e aí o lugar é
aqui, não em cada app.

---

## Adicionando um consumidor novo

1. Escolha um prefixo (`<APP>_AI_`) e chame `createAdapterFromEnv("<APP>", { rateLimitKey })`.
2. No endpoint, chame `enforceRequestRateLimit("<APP>", userId)` **antes** de abrir o stream e
   traduza `RateLimitError` em 429.
3. Declare as vars no `.env.schema` do app, no `secret_names` do `infra/<app>/terraform.tfvars`
   e no `sync-secrets.yml`.
4. Se o fluxo for não-essencial, mantenha o padrão do sisub: sem as vars, a tela mostra
   "Em breve" e o endpoint responde 503 — nunca quebre o boot por falta de secret de IA.

---

## Testes

Três camadas, com garantias diferentes — a distinção importa:

| Suíte | Roda | Garante |
|---|---|---|
| `packages/sisub-domain/src/agent/*.test.ts` | sempre | schemas aceitam o que o modelo manda (`null` em opcional), JSON Schema publicado anuncia isso, poda de `null` não come argumento válido |
| `apps/sisub/src/lib/module-chat/tools/model-args.test.ts` | sempre | **contrato exaustivo**: toda tool de todo módulo aceita chamada sem opcionais e com opcionais em `null`, validado pelo mesmo validador que o engine usa. Tool nova entra na varredura sozinha |
| `apps/sisub-mcp/src/tools/model-args.test.ts` | sempre | mesma garantia do lado MCP, no despacho |
| `apps/sisub/src/test/ai/provider-smoke.test.ts` | opt-in | **a IA responde**: fala com o provider configurado de verdade — pega id de modelo inválido, região sem acesso, credencial faltando, provider recusando tool call |

```sh
cd apps/sisub && bun run test:ai   # precisa de SISUB_RUN_AI_SMOKE=true (o script já seta) + MODULE_CHAT_AI_*
```

**O smoke não é guarda de regressão de contrato** — e isso foi verificado, não suposto: com o
bug do `null` reintroduzido, ele passou, porque naquela execução o modelo não mandou `null`.
O que o modelo manda varia de run para run. A garantia determinística é a suíte offline; o
smoke responde "o provider está de pé?".

---

## Dívida registrada

**sucont** — já usa bedrock (`SUCONT_AI_PROVIDER=bedrock`), mas sem reserva e sem teto.
Migração é só configuração: adicionar `SUCONT_FALLBACK_AI_*` e `SUCONT_AI_MAX_*` ao
`.env.schema`, ao `secret_names` e ao `sync-secrets.yml`, e chamar `enforceRequestRateLimit`
em `apps/sucont/routes/api/chat/stream.post.ts`. Nenhuma mudança de código no pacote.

**alpha** — o único que não tem caminho para o Bedrock. Ele não usa o adapter do
`@tanstack/ai`: usa LangChain, e `packages/ai-provider/src/langchain-compat.ts` só sabe
construir `ChatOpenAI`. Para migrar:

1. `ChatBedrockConverse` (`@langchain/aws`) no `langchain-compat`, escolhido pelo mesmo
   `provider` do `AdapterConfig`;
2. `ALPHA_AI_PROVIDER` (`apps/alpha/src/env.ts:11`) passa a aceitar `bedrock`;
3. `getLLM` devolve o tipo base do LangChain em vez de `ChatOpenAI` — os cinco usos são só
   `.invoke` e `.withStructuredOutput`, ambos suportados.

**Embeddings e rerank do alpha continuam na NVIDIA**, e isso é decisão, não esquecimento:
migrar significa **re-embedar o corpus inteiro**. Se um dia valer a pena,
`cohere.embed-multilingual-v3` no Bedrock devolve os mesmos 1024 dims da coluna atual — o
que evita migration de schema, mas não evita o reprocessamento.

---

## Dev local

O primário é bedrock, e o adapter usa a cadeia de credenciais da AWS. Sem
`aws sso login --profile iefa-prod` (ou credencial equivalente exportada), o Bedrock falha
com `InvalidClientTokenId` — que é **erro de credencial, não transitório**, então a reserva
**não** entra: a falha é ruidosa de propósito, para não mascarar configuração errada.

Para trabalhar sem AWS, inverta no `.env` local: deixe o groq como primário e não configure
reserva.
