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
| sucont — oráculo | `SUCONT_AI_*` | **bedrock** | (não configurada) | ✅ migrado — reserva opcional, ainda sem secret |
| alpha — grafo LangGraph | `ALPHA_AI_*` | nvidia | — | ❌ dívida (ver abaixo) |

`apps/sisub-mcp` não chama modelo: ele **expõe** ferramentas para o modelo do cliente MCP.
Portal, rumaer, forms, docs e api não usam IA.

### O que está aplicado em produção (conferido em 2026-08-14 pela CLI)

A tabela acima é o desenho. Isto é o que a conta `103256050857` (`iefa-prod`) tem de fato —
e os dois **divergem**. As task definitions carregam a config de IA como env **não-secreta**,
não pelo Secrets Manager:

| | modelo | região | reserva | tetos |
|---|---|---|---|---|
| sisub (`MODULE_CHAT` e `ANALYTICS`) | `openai.gpt-oss-120b-1:0` | `sa-east-1` | ❌ não configurada | ❌ nenhum |
| sucont (`SUCONT`) | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | `us-east-1` | ❌ | ❌ |

Duas consequências, ambas verificadas:

1. **sisub funciona** — o CloudTrail de `sa-east-1` registra `ConverseStream` da task role com
   `openai.gpt-oss-120b-1:0` sem `errorCode`, inclusive no dia da conferência. Não é Claude
   Sonnet 4.6, que é o que este arquivo e o `sisub.example.json` diziam.
2. **o oráculo do sucont está quebrado** — o perfil `us.anthropic.*` está **fora** do escopo
   que a task role recebeu (ver IAM abaixo): `simulate-principal-policy` devolve
   `implicitDeny` para `InvokeModelWithResponseStream` **e** para `ConverseStream` nesse ARN,
   e o CloudTrail de `us-east-1` não tem nenhuma chamada da task role — o caminho nunca
   funcionou. `AccessDenied` não é falha transitória, então a reserva não entraria nem se
   existisse. Conserto: `SUCONT_AI_MODEL = global.anthropic.claude-sonnet-4-6` e
   `SUCONT_AI_REGION = sa-east-1` no `terraform.tfvars` real (que vive no secret
   `TF_TFVARS_JSON`, fora do repo).

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
profile** — não o id curto da API da Anthropic.

**Claude atende de `sa-east-1` pelo perfil `global.`** — `global.anthropic.claude-sonnet-4-6`
responde `Converse` na região da stack, confirmado por chamada real. A afirmação anterior
("Claude fora de `sa-east-1` exige perfil `us.`, por isso o chat roda em `us-east-1`") estava
errada e foi o que colocou o sucont num id que a task role não pode invocar. Não cruze região
sem motivo.

**Confirme o id exato antes de aplicar** — ele não é estável, e nem todo modelo usa o sufixo
`-v1:0` (o 4.6 é `global.anthropic.claude-sonnet-4-6`, sem sufixo; o 4.5 é
`global.anthropic.claude-sonnet-4-5-20250929-v1:0`, com):

```sh
aws bedrock list-inference-profiles --region sa-east-1 \
  --query "inferenceProfileSummaries[?starts_with(inferenceProfileId,'global.anthropic')].inferenceProfileId" \
  --output text
```

Escolhas de referência (ver `infra/sisub/secrets/sisub.example.json` — **não** é o que roda em
produção hoje, ver a seção acima):

- **chat dos módulos**: Claude Sonnet 4.6 — é o que sustenta tool-calling com as ~8 tools do
  módulo sem inventar chamada malformada;
- **analytics**: mesmo modelo. Se o custo incomodar, Haiku 4.5 é o degrau abaixo — a tool de
  gráfico tem schema pequeno e tolera modelo menor.

### IAM: o que está aplicado ≠ o que o `iam.tf` descreve

`infra/foundation/iam.tf` tem um bloco `task_bedrock` atrás de `enable_bedrock_task_access`,
com `bedrock:Converse*` + `bedrock:InvokeModel*` em `foundation-model/*` e
`inference-profile/*`. **Esse bloco não está aplicado**: a flag é `false` no `terraform.tfvars`
real e a role `iefa-prod-ecs-task` não tem a policy `-ecs-task-bedrock`. O acesso vem da
policy `-ecs-task-extra`, montada de `task_role_policy_json`, e é bem mais estreita:

```
Action:   bedrock:InvokeModel, bedrock:InvokeModelWithResponseStream
Resource: arn:aws:bedrock:*:<conta>:inference-profile/global.anthropic.*
          arn:aws:bedrock:*::foundation-model/anthropic.*
          arn:aws:bedrock:*::foundation-model/openai.gpt-oss-*
```

Duas coisas que decorrem disso, e que valem mais que a intuição:

- **`bedrock:Converse*` não é necessário.** A policy aplicada não concede essas actions e o
  `ConverseStream` do adapter funciona mesmo assim (CloudTrail, sem `errorCode`): a Converse
  API é autorizada pelas actions `InvokeModel*`. Ampliar a policy para "consertar" o sucont
  seria tratar o sintoma errado.
- **O prefixo do perfil é o que decide.** Só `global.anthropic.*` está liberado. Antes de
  setar um id novo, simule — é mais barato que descobrir por `AccessDenied` em produção, ainda
  mais no sucont, que não tem log group no CloudWatch:

```sh
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::<conta>:role/iefa-prod-ecs-task \
  --action-names bedrock:InvokeModelWithResponseStream \
  --resource-arns arn:aws:bedrock:sa-east-1:<conta>:inference-profile/<id>
```

---

## Reserva: o que ela cobre

`withFallbackChain` (`packages/ai-provider/src/fallback.ts`) troca de adapter **só antes do
primeiro conteúdo** e **só em falha transitória**.

- **Transitório** = 429, 408, 5xx, mais os nomes de exceção do SDK da AWS
  (`ThrottlingException`, `InternalServerException`, `ServiceUnavailableException`,
  `ModelStreamErrorException` — este vem com 424, e o nome é consultado antes de recusar por
  4xx), `overloaded`, timeout, queda de conexão. Trocar de provider resolve.
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

As janelas são por **consumidor + usuário** (`MODULE_CHAT:<userId>`), e o orçamento diário
por consumidor — o chat dos módulos não consome a cota do analytics. Estourar o teto de
tokens no meio de um turno não lança: vira um `RUN_ERROR` no stream, porque o SSE já está
aberto e uma exceção chegaria ao usuário como conexão cortada.

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

**sucont** — os **três** caminhos até o modelo têm o mesmo encadeamento do sisub (capability
gate → sessão → permissão → `enforceRequestRateLimit("SUCONT")` → adapter com
`rateLimitKey`), e os tetos `SUCONT_AI_MAX_*` estão no
`infra/sucont/terraform.tfvars.example` como env não-secreto:

| Caminho | Onde a cadeia é aplicada |
|---|---|
| `routes/api/chat/stream.post.ts` (SSE) | no próprio handler — precisa de status HTTP do h3 antes de abrir o stream |
| `oracleContaGenericaFn` | `requireSucontAccess` + `lib/ai.server.ts` |
| `adaptDraftFn` | `requireSucontAccess` + `lib/ai.server.ts` |

`lib/ai.server.ts` é o ponto único das server functions, e o `userId` é **parâmetro
obrigatório** de `generateText`/`generateJson`: não existe assinatura sem dono, então uma
server function nova não consegue chamar o modelo sem passar pelo teto. Ele vem sempre do
`UserContext` do guard, nunca do input validado.

O que falta é **configuração no `terraform.tfvars` real** (secret `TF_TFVARS_JSON`), e a ordem
importa — o item 1 é o que separa "oráculo quebrado" de "oráculo funcionando":

1. `SUCONT_AI_MODEL = "global.anthropic.claude-sonnet-4-6"` e `SUCONT_AI_REGION = "sa-east-1"`.
   O que está aplicado hoje (`us.anthropic.claude-sonnet-4-5-20250929-v1:0` em `us-east-1`)
   é negado pela task role;
2. os tetos `SUCONT_AI_MAX_*` — estão no `.example`, não no aplicado;
3. a **reserva**: `SUCONT_FALLBACK_AI_*` está declarado no `.env.schema`, mas a API key ainda
   não foi ao `secret_names` nem ao `sync-secrets.yml` — sem ela o adapter roda só com o
   primário. Note que reserva **não** cobre o item 1: `AccessDenied` não é transitório.

**sisub** — mesma pendência de configuração, sem o bug: reserva e tetos estão no
`secret_names` do `.example`, mas a task definition aplicada não tem nenhum deles. O chat roda
sem freio e sem reserva em produção.

Detalhe que vale para qualquer rota Nitro (`routes/api/**`): ela roda **fora** do contexto de
request do TanStack Start, então `getRequest()` — e portanto `createSsrAuthClient` e os
helpers de `auth.server.ts` — não valem ali. A sessão vem do header `Cookie` do `H3Event`,
via `createCookieAuthClient` do `@iefa/supabase-kit`. O guard de rota do `__root` é
client-side e **não** cobre essas rotas: sem checagem explícita no handler, um endpoint de
chat é um caminho aberto para o Bedrock da conta.

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
