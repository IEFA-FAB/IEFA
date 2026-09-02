# Migração para Lambda — forms, 5s e api

Design. Objetivo: tirar `forms`, `5s` e `api` do Fargate sem regredir a UX do
TanStack Start (streaming SSR) e sem quebrar o disparo manual de sync do api.

Contexto de custo: cada um roda 1 task Spot (0,25 vCPU / 0,5 GB) + 1 IPv4 público
≈ US$8,70/mês. Os três são de baixíssimo tráfego (api 615, forms 177, 5s 4.270
requisições em 14 dias). Nenhum toca Postgres direto — todos usam supabase-js
(HTTP/PostgREST), então **não há pool de conexão em jogo** (ver
[[project_aws_cost_optimization]]).

---

## Parte A — forms e 5s (TanStack Start SSR)

### A UX é a restrição, não um detalhe

O TanStack Start faz **streaming SSR**: `shellComponent` no `__root`, limites de
`Suspense`, loaders adiados e `defaultPreload: "intent"`. O HTML desce
progressivamente — o shell aparece antes dos dados. Se a resposta do Lambda for
*bufferizada* (que é o que um target de Lambda no ALB obriga), o usuário espera o
render inteiro terminar antes de ver qualquer coisa. Isso **regride a UX**.

Solução: **preset `aws-lambda` do nitro com `streaming: true`**. Verificado no
código do nitro 3 beta — ele troca o entry para `aws-lambda-streaming.mjs`, que
usa `awslambda.streamifyResponse` e repassa o `ReadableStream` do nitro como
`transfer-encoding: chunked`. O streaming do TanStack Start é preservado.

```ts
// apps/forms/vite.config.ts
nitro({
  preset: "aws-lambda",
  awsLambda: { streaming: true },
  compressPublicAssets: false, // assets vão pro S3; CloudFront comprime na borda
})
```

### Streaming exige Function URL, não ALB

Response streaming de Lambda só funciona com **Function URL em `InvokeMode:
RESPONSE_STREAM`**. O ALB não faz streaming de Lambda (bufferiza). A Function URL
tem domínio próprio (`*.lambda-url.sa-east-1.on.aws`), então para manter
`forms.iefa.com.br` e `5s.iefa.com.br` colocamos **CloudFront na frente** —
reusando exatamente o módulo `static-site` do docs.

### Arquitetura (reusa o padrão do docs)

```
                     ┌── default behavior ──▶ Lambda Function URL (SSR streaming)
CloudFront (por app) │                         nitro aws-lambda-streaming
  forms.iefa.com.br  │                         @supabase/ssr (cookie, sem pool)
  cert us-east-1     │
                     └── /assets/* /fonts/*
                         /5s/* /favicon.svg  ──▶ S3 (imutável, cacheado)
                         /manifest.json
```

- **Default behavior** → origem Function URL. `CachingDisabled` (HTML de SSR não
  cacheia). Encaminha cookies + `Authorization` (auth do Supabase é por cookie).
- **Assets** (`/assets/*`, `/fonts/*`, `/manifest.json`, `/favicon.svg`, e no 5s
  `/5s/*`) → origem S3, `max-age=31536000, immutable`. Isso também resolve o
  **limite de 1 MB do ALB→Lambda** que mediria o maior chunk do forms (650 KB →
  866 KB em base64): os assets nunca passam pelo Lambda.
- Deploy: `.output/server` empacota no Lambda; `.output/public` sobe pro S3.

### forms e 5s são dois Lambdas, não um

`VITE_APP_TENANT` é var de build do Vite (`forms` vs `cinco-s`) — ela é *baked* no
bundle do cliente, então hoje já são duas imagens ECR distintas. Continuam dois
builds, dois Lambdas, duas distribuições. Mesmo código-fonte, dois artefatos.
(Unificar via Host header é possível mas é outro escopo; não fazer aqui.)

### Cold start — o segundo eixo de UX

Bundle SSR do TanStack Start em Lambda Node: init + alguns 100 ms no primeiro hit.
Mitigações, em ordem de custo-benefício:

1. **ARM/Graviton** (`architecture: arm64`) — mais barato *e* cold start bom.
2. **512 MB de memória** — no Lambda, memória ∝ CPU; acelera o cold start mais do
   que 256 MB e ainda é barato nesse volume.
3. Provisioned concurrency: **não** nesse tráfego (desperdício). 5s tem o maior
   volume (~9,3k/mês) → poucos cold starts; forms é raro mas ninguém sofre com
   1 cold start ocasional num formulário.

Sem keep-warm ping — não paga o custo operacional nesse tráfego.

### Sem preocupação de conexão

`@supabase/ssr` é cookie + HTTP contra o PostgREST. Cada invocação cria seu client
por request (já é o padrão do TanStack Start). Nada de pool, nada de Supavisor.

---

## Parte B — api (Hono: JSON + Scalar docs)

### Sem streaming = pode ficar no ALB

O api é API JSON + página de docs do Scalar. Não há streaming de UX a preservar,
então **resposta bufferizada serve**. Isso permite o caminho mais simples:
**manter no ALB compartilhado, trocando o target de IP do ECS por um target
Lambda**. `api.iefa.com.br` continua no mesmo ALB, sem CloudFront, sem cert novo.
Respostas JSON são minúsculas (muito abaixo de 1 MB); a página do Scalar é HTML
leve (carrega JS de CDN).

```ts
// entry Lambda do api
import { handle } from "hono/aws-lambda"
export const handler = handle(app)
```

`hono/aws-lambda` é feito exatamente para eventos ALB/APIGW.

### Bun → Node no caminho HTTP

Único uso de Bun no caminho HTTP: `Bun.file` para o favicon (`index.ts:116`).
Trocar por `readFileSync` do Node. `Bun.sleep` só aparece nos workers, que saem do
processo (abaixo). O Lambda roda no runtime **Node** (o adapter do Hono mira Node).

### Os workers TÊM que sair do processo (e isso conserta um bug)

Hoje `startComprasSyncWorker` / `startNutritionReferenceSyncWorker` rodam
**dentro do processo HTTP** via `Bun.cron` (setTimeout auto-reagendado). Dois
problemas:

1. Lambda congela/mata o processo após responder — um cron in-process nunca
   dispararia de forma confiável.
2. Já era um bug latente: com 2 tasks, as duas agendavam o mesmo sync (havia
   trava no banco, mas é check-then-act). Baixar pra 1 task mascarou, não
   consertou.

**Destino** (decidido antes): **EventBridge Scheduler → ECS RunTask** rodando os
**scripts standalone que já existem** (`scripts/run-compras-sync.ts`,
`scripts/run-nutrition-reference-sync.ts`) no Bun. Sem limite de 15 min — o sync
de nutrição (10.830 alimentos) roda folgado. Os scripts mantêm `Bun.*` (rodam no
Bun na task ECS) — zero reescrita deles.

- Compras: segunda 06:00 UTC. Nutrição: terça 06:00 UTC. (Mesma agenda de hoje.)
- Task efêmera: sobe, roda, morre. Custo = minutos de execução (~US$0,10/mês).
- Remover `startComprasSyncWorker`/`startNutritionReferenceSyncWorker` do
  `index.ts`. O `scheduleNextRun`/`Bun.cron` deixa de existir no runtime HTTP.

### Disparo manual — o ponto de UX do api

`compras-admin.ts:178` faz `runComprasSync({ triggeredBy: "manual" })`
**sem await** (fire-and-forget) e retorna o status em 200 ms, contando que o
processo continue o sync depois da resposta. **Em Lambda o processo morre ao
responder → o sync é morto no meio.**

**Correção:** a rota admin passa a chamar **ECS RunTask** (dispara a mesma task
efêmera do agendado), e retorna "iniciado". As rotas de status (`hasLiveSync`, e
as queries em `compras_sync_log`/`nutrition_sync_log`) já leem do banco —
**inalteradas**. A UI admin segue igual: dispara → task sobe → faz poll do
progresso no banco. Fica até mais robusto que hoje (o sync não morre se o
container HTTP reiniciar).

- IAM: a role de execução do Lambda do api ganha `ecs:RunTask` + `iam:PassRole`
  (execution + task role) escopado à task de sync.

### Health check

A rota `/health` mede RSS do container — sem sentido em Lambda. Simplificar para
um 200 fixo (ou remover; o ALB Lambda target usa health check do próprio ALB).

---

## Custo estimado

Remove 3 tasks Spot (0,25/0,5) + 3 IPv4 = 3 × US$8,70 = **−US$26,10/mês**.
Adiciona:
- Lambda: ~11k req/mês total, muito abaixo do free tier (1M req + 400k GB-s) ≈ **US$0**.
- CloudFront forms+5s: tráfego ínfimo ≈ **US$0**.
- Task de sync agendada: semanal, minutos ≈ **US$0,10/mês**.

Líquido ≈ **−US$25/mês**. Projeção: ~US$149 → **~US$124/mês** AWS.

O ganho maior não é o dinheiro — é **isolamento**: cada função é sua unidade de
deploy e seu microVM Firecracker por execução. Mais forte que container no
Fargate, e satisfaz a restrição de "um app não pode derrubar o outro".

---

## Ordem de execução (PRs separados, menor risco primeiro)

1. **api — split de workers** (independente de Lambda; conserta o bug do cron):
   EventBridge Scheduler + task ECS de sync + rota admin via RunTask. Mergear e
   observar um ciclo de sync antes de seguir.
2. **api → Lambda no ALB**: entry `hono/aws-lambda`, `Bun.file`→Node, target
   Lambda no ALB, destruir a service ECS do api.
3. **forms → Lambda+CloudFront** (valida o pipeline nitro streaming → Function URL
   → CloudFront). Reusa o módulo `static-site` estendido com origem Function URL.
4. **5s → Lambda+CloudFront**: mesmo molde, `VITE_APP_TENANT=cinco-s`.

Cada passo mantém o hostname no ar durante o cutover (mesma disciplina do docs:
sobe o novo, valida, repõe o DNS/target, só então destrói o antigo).

## Riscos / pontos a validar antes de codar

- **Function URL como origem de CloudFront com OAC**: CloudFront agora suporta OAC
  para Function URL (assinatura SigV4, `lambda` service). Confirmar a config exata
  no provider AWS antes de escrever o módulo.
- **Tamanho do bundle SSR no Lambda**: `.output/server` do forms ~1,5 MB — bem
  abaixo dos 250 MB. OK.
- **`hono/aws-lambda` + eventos do ALB**: confirmar que o adapter lida com o
  formato de evento do ALB (multiValueHeaders) e não só APIGW.
- **Cold start real medido**: buildar forms com o preset streaming e medir TTFB do
  primeiro hit antes de prometer número.
