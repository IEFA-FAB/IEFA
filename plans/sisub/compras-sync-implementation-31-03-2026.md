# Plano de Implementação — Integração Compras.gov.br (CATMAT/CATSER)

**Data:** 2026-03-31 (rev. 2 — pós-auditoria de resiliência)
**Contexto:** Sistema IEFA — módulo `sisub` (gerenciamento de ranchos militares)
**Objetivo:** Sincronizar os catálogos de Material e Serviço da API Dados Abertos Compras com o banco Supabase do sisub, vinculando a tabela `product` ao catálogo CATMAT para suporte a pesquisa de preço.

---

## 0. Auditoria — Problemas Identificados e Correções Aplicadas

Esta revisão incorpora uma auditoria de resiliência e observabilidade. Os problemas encontrados na proposta original são descritos abaixo junto com a solução adotada.

| Problema | Impacto | Solução |
|---|---|---|
| **Sem retry por página** — qualquer falha de rede derruba toda a sync | Alto | Retry com backoff exponencial por página (3 tentativas: 1s, 5s, 15s) |
| **Sem timeout por request** — API pode travar o processo indefinidamente | Alto | `AbortSignal.timeout(30_000)` em todo `fetch` |
| **Sem trava de concorrência** — cron + trigger manual podem rodar ao mesmo tempo | Médio | Check de sync `running` < 2h antes de iniciar; retorna 409 se colidir |
| **Buffering de todas as páginas em memória** — ~500k itens causaria OOM | Alto | Upsert imediato por página (streaming), sem acumular |
| **Falha em um step mata os demais** — cascata de erros | Médio | Cada step é independente: falha isolada, continua os outros |
| **Log sem granularidade de progresso** — usuário vê só "running"/"done" | Médio | Nova tabela `compras_sync_step` com estado por step + página atual |
| **Sem endpoints de status** — impossível monitorar sem acessar o banco | Baixo | `GET /api/admin/compras/sync/latest` e `GET /api/admin/compras/sync/:id` |
| **FK pode falhar se pai não existir** — ex: PDM sem classe pai no DB | Baixo | Soft-skip do registro filho com log de warning no step |
| **`ON CONFLICT` em tabelas com PK BIGSERIAL** — conflito deve ser na unique constraint, não no PK | Baixo | Explicitado no plano: usar `ON CONFLICT (chave_natural_unica)` |

---

## 1. Visão Geral da Solução

```
┌──────────────────────────────────────────────────────────────────────┐
│                        apps/api (Hono + Bun)                         │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐       │
│  │                  Compras Sync Worker                       │       │
│  │  - Bun.cron (toda segunda-feira 03:00 BRT)                 │       │
│  │  - Trigger manual via POST /api/admin/compras/sync         │       │
│  │                                                            │       │
│  │  Por step (15 no total):                                   │       │
│  │  1. Marca step como "running" no DB                        │       │
│  │  2. Para cada página: fetch → upsert → atualiza progresso  │       │
│  │  3. Retry c/ backoff em caso de falha de rede              │       │
│  │  4. Marca step como "success" ou "error" (independente)    │       │
│  │  5. Atualiza log geral ao finalizar todos os steps         │       │
│  └───────────────────────────────────────────────────────────┘       │
│                           │                                          │
│                           ▼                                          │
│           Supabase (schema: sisub)                                   │
│   compras_sync_log + compras_sync_step  ← observabilidade            │
└──────────────────────────────────────────────────────────────────────┘
```

**Stack já existente:**
- Runtime: Bun
- Framework: Hono + `@hono/zod-openapi`
- DB: Supabase (`@supabase/supabase-js`) — schema `sisub`
- Validação: Zod v4
- Env: `API_SUPABASE_URL`, `API_SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Novos Arquivos e Estrutura de Diretórios

```
apps/api/src/
├── workers/
│   └── compras-sync/
│       ├── index.ts          # Orquestrador principal + Bun.cron
│       ├── client.ts         # Cliente HTTP com paginação, retry e timeout
│       ├── material.ts       # Sync do Módulo Material (7 steps)
│       ├── servico.ts        # Sync do Módulo Serviço (8 steps)
│       └── types.ts          # Types do retorno da API Compras
└── api/
    └── routes/
        └── compras-admin.ts  # POST trigger + GET status
```

**Integrar ao `src/index.ts`** após as rotas existentes:
```ts
import { startComprasSyncWorker } from "./workers/compras-sync/index.ts"
startComprasSyncWorker()
```

---

## 3. Migração SQL — Novas Tabelas no Schema `sisub`

Criar um arquivo de migração (ex: `supabase/migrations/20260331_compras_sync.sql`).

### 3.1 Módulo Material (CATMAT)

```sql
-- Grupo de Material
CREATE TABLE sisub.compras_material_grupo (
  codigo_grupo          INTEGER     PRIMARY KEY,
  nome_grupo            TEXT        NOT NULL,
  status_grupo          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Classe de Material
CREATE TABLE sisub.compras_material_classe (
  codigo_classe         INTEGER     PRIMARY KEY,
  codigo_grupo          INTEGER     NOT NULL REFERENCES sisub.compras_material_grupo(codigo_grupo),
  nome_classe           TEXT        NOT NULL,
  status_classe         BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Produto Descritivo Básico (PDM)
CREATE TABLE sisub.compras_material_pdm (
  codigo_pdm            INTEGER     PRIMARY KEY,
  codigo_classe         INTEGER     NOT NULL REFERENCES sisub.compras_material_classe(codigo_classe),
  nome_pdm              TEXT        NOT NULL,
  status_pdm            BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Item de Material (CATMAT) — tabela principal
CREATE TABLE sisub.compras_material_item (
  codigo_item                    INTEGER     PRIMARY KEY,
  codigo_pdm                     INTEGER     REFERENCES sisub.compras_material_pdm(codigo_pdm),
  descricao_item                 TEXT        NOT NULL,
  status_item                    BOOLEAN     NOT NULL DEFAULT true,
  item_sustentavel               BOOLEAN,
  codigo_ncm                     TEXT,
  descricao_ncm                  TEXT,
  aplica_margem_preferencia      BOOLEAN,
  data_hora_atualizacao          TIMESTAMPTZ,
  synced_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Rastreamento de desativação (imutável após primeiro preenchimento)
  first_deactivation_detected_at TIMESTAMPTZ
);

-- Índice para lookup por PDM (usado nas queries de itens de um produto)
CREATE INDEX idx_compras_material_item_pdm
  ON sisub.compras_material_item(codigo_pdm);

-- Natureza da Despesa (Material) — N:1 com PDM
-- ATENÇÃO: ON CONFLICT deve usar a UNIQUE constraint, não o PK serial
CREATE TABLE sisub.compras_material_natureza_despesa (
  id                        BIGSERIAL   PRIMARY KEY,
  codigo_pdm                INTEGER     NOT NULL REFERENCES sisub.compras_material_pdm(codigo_pdm),
  codigo_natureza_despesa   TEXT        NOT NULL,
  nome_natureza_despesa     TEXT        NOT NULL,
  status_natureza_despesa   BOOLEAN     NOT NULL DEFAULT true,
  synced_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_pdm, codigo_natureza_despesa)
);

-- Unidade de Fornecimento — N:1 com PDM
CREATE TABLE sisub.compras_material_unidade_fornecimento (
  id                                     BIGSERIAL   PRIMARY KEY,
  codigo_pdm                             INTEGER     NOT NULL REFERENCES sisub.compras_material_pdm(codigo_pdm),
  numero_sequencial_unidade_fornecimento INTEGER,
  sigla_unidade_fornecimento             TEXT,
  nome_unidade_fornecimento              TEXT,
  descricao_unidade_fornecimento         TEXT,
  sigla_unidade_medida                   TEXT,
  capacidade_unidade_fornecimento        INTEGER,
  status_unidade_fornecimento_pdm        BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao                  TIMESTAMPTZ,
  synced_at                              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_pdm, numero_sequencial_unidade_fornecimento)
);

-- Características — N:1 com Item
CREATE TABLE sisub.compras_material_caracteristica (
  id                          BIGSERIAL   PRIMARY KEY,
  codigo_item                 INTEGER     NOT NULL REFERENCES sisub.compras_material_item(codigo_item),
  codigo_caracteristica       TEXT        NOT NULL,
  nome_caracteristica         TEXT        NOT NULL,
  status_caracteristica       BOOLEAN     NOT NULL DEFAULT true,
  codigo_valor_caracteristica TEXT,
  nome_valor_caracteristica   TEXT,
  status_valor_caracteristica BOOLEAN,
  numero_caracteristica       INTEGER,
  sigla_unidade_medida        TEXT,
  data_hora_atualizacao       TIMESTAMPTZ,
  synced_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_item, codigo_caracteristica, codigo_valor_caracteristica)
);
```

### 3.2 Módulo Serviço (CATSER)

```sql
-- Seção
CREATE TABLE sisub.compras_servico_secao (
  codigo_secao          INTEGER     PRIMARY KEY,
  nome_secao            TEXT        NOT NULL,
  status_secao          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Divisão
CREATE TABLE sisub.compras_servico_divisao (
  codigo_divisao        INTEGER     PRIMARY KEY,
  codigo_secao          INTEGER     NOT NULL REFERENCES sisub.compras_servico_secao(codigo_secao),
  nome_divisao          TEXT        NOT NULL,
  status_divisao        BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grupo de Serviço
CREATE TABLE sisub.compras_servico_grupo (
  codigo_grupo          INTEGER     PRIMARY KEY,
  codigo_divisao        INTEGER     NOT NULL REFERENCES sisub.compras_servico_divisao(codigo_divisao),
  nome_grupo            TEXT        NOT NULL,
  status_grupo          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Classe de Serviço
CREATE TABLE sisub.compras_servico_classe (
  codigo_classe         INTEGER     PRIMARY KEY,
  codigo_grupo          INTEGER     NOT NULL REFERENCES sisub.compras_servico_grupo(codigo_grupo),
  nome_classe           TEXT        NOT NULL,
  status_grupo          BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subclasse de Serviço
CREATE TABLE sisub.compras_servico_subclasse (
  codigo_subclasse      INTEGER     PRIMARY KEY,
  codigo_classe         INTEGER     NOT NULL REFERENCES sisub.compras_servico_classe(codigo_classe),
  nome_subclasse        TEXT        NOT NULL,
  status_subclasse      BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao TIMESTAMPTZ,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Item de Serviço (CATSER) — tabela principal
CREATE TABLE sisub.compras_servico_item (
  codigo_servico                 INTEGER     PRIMARY KEY,
  codigo_subclasse               INTEGER     REFERENCES sisub.compras_servico_subclasse(codigo_subclasse),
  nome_servico                   TEXT        NOT NULL,
  codigo_cpc                     INTEGER,
  exclusivo_central_compras      BOOLEAN,
  status_servico                 BOOLEAN     NOT NULL DEFAULT true,
  data_hora_atualizacao          TIMESTAMPTZ,
  synced_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_deactivation_detected_at TIMESTAMPTZ
);

-- Unidade de Medida de Serviço — N:1 com Item
CREATE TABLE sisub.compras_servico_unidade_medida (
  id                    BIGSERIAL   PRIMARY KEY,
  codigo_servico        INTEGER     NOT NULL REFERENCES sisub.compras_servico_item(codigo_servico),
  sigla_unidade_medida  TEXT        NOT NULL,
  nome_unidade_medida   TEXT,
  status_unidade_medida BOOLEAN     NOT NULL DEFAULT true,
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_servico, sigla_unidade_medida)
);

-- Natureza da Despesa (Serviço) — N:1 com Item
CREATE TABLE sisub.compras_servico_natureza_despesa (
  id                        BIGSERIAL   PRIMARY KEY,
  codigo_servico            INTEGER     NOT NULL REFERENCES sisub.compras_servico_item(codigo_servico),
  codigo_natureza_despesa   TEXT        NOT NULL,
  nome_natureza_despesa     TEXT        NOT NULL,
  status_natureza_despesa   BOOLEAN     NOT NULL DEFAULT true,
  synced_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (codigo_servico, codigo_natureza_despesa)
);
```

### 3.3 Tabelas de Controle e Observabilidade

Duas tabelas: **`compras_sync_log`** (uma linha por execução) e **`compras_sync_step`** (uma linha por endpoint dentro da execução). Isso permite que a UI mostre progresso em tempo real sem precisar ler o banco de dados interno.

```sql
-- Log geral de cada execução da sync
CREATE TABLE sisub.compras_sync_log (
  id                BIGSERIAL   PRIMARY KEY,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  triggered_by      TEXT        NOT NULL DEFAULT 'cron',  -- 'cron' | 'manual'
  status            TEXT        NOT NULL DEFAULT 'running',
    -- 'running' | 'success' | 'partial' | 'error'
  total_steps       INTEGER     NOT NULL DEFAULT 15,      -- total de steps previstos
  completed_steps   INTEGER     NOT NULL DEFAULT 0,       -- steps finalizados (success ou error)
  successful_steps  INTEGER     NOT NULL DEFAULT 0,
  failed_steps      INTEGER     NOT NULL DEFAULT 0,
  total_upserted    INTEGER     NOT NULL DEFAULT 0,       -- acumulado de todos os steps
  total_deactivated INTEGER     NOT NULL DEFAULT 0,
  error_message     TEXT        -- preenchido se status = 'error' (falha fatal antes de começar)
);

-- Log por step dentro de uma execução
-- Permite saber exatamente qual endpoint está rodando e em qual página
CREATE TABLE sisub.compras_sync_step (
  id                  BIGSERIAL   PRIMARY KEY,
  sync_id             BIGINT      NOT NULL REFERENCES sisub.compras_sync_log(id) ON DELETE CASCADE,
  step_name           TEXT        NOT NULL,
    -- ex: 'material.grupo', 'material.item', 'servico.secao', 'servico.item'
  status              TEXT        NOT NULL DEFAULT 'pending',
    -- 'pending' | 'running' | 'success' | 'error'
  current_page        INTEGER     NOT NULL DEFAULT 0,    -- última página processada
  total_pages         INTEGER,                           -- preenchido após 1ª chamada à API
  records_upserted    INTEGER     NOT NULL DEFAULT 0,
  records_deactivated INTEGER     NOT NULL DEFAULT 0,
  error_message       TEXT,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  UNIQUE (sync_id, step_name)
);

-- Índice para consulta rápida do último log
CREATE INDEX idx_compras_sync_log_started_at
  ON sisub.compras_sync_log(started_at DESC);
```

**Como usar para monitorar:**
```sql
-- Estado atual (ou da última sync)
SELECT
  l.id, l.status, l.triggered_by, l.started_at,
  l.completed_steps, l.total_steps, l.total_upserted,
  s.step_name, s.status AS step_status,
  s.current_page, s.total_pages, s.records_upserted
FROM sisub.compras_sync_log l
LEFT JOIN sisub.compras_sync_step s ON s.sync_id = l.id
WHERE l.id = (SELECT id FROM sisub.compras_sync_log ORDER BY started_at DESC LIMIT 1)
ORDER BY s.id;
```

### 3.4 Alteração na tabela `product`

```sql
-- Associa um produto do sisub a um item do CATMAT
ALTER TABLE sisub.product
  ADD COLUMN catmat_item_codigo INTEGER
    REFERENCES sisub.compras_material_item(codigo_item)
    ON DELETE SET NULL;

-- Índice para buscas por item CATMAT
CREATE INDEX idx_product_catmat_item_codigo
  ON sisub.product(catmat_item_codigo)
  WHERE catmat_item_codigo IS NOT NULL;
```

---

## 4. Lógica de Sincronização

### 4.1 Cliente HTTP — Paginação, Retry e Timeout

Todos os endpoints retornam:
```json
{
  "resultado": [...],
  "totalRegistros": 0,
  "totalPaginas": 0,
  "paginasRestantes": 0
}
```

O cliente deve:
- Usar `tamanhoPagina=500` para todos os endpoints
- Iterar até `paginasRestantes === 0`
- Aplicar **timeout de 30s por request**
- Aplicar **retry com backoff exponencial** em caso de falha de rede ou HTTP 5xx

```ts
// client.ts — pseudocódigo

const RETRY_DELAYS_MS = [1_000, 5_000, 15_000]
const REQUEST_TIMEOUT_MS = 30_000

async function fetchPageWithRetry<T>(url: string): Promise<ComprasPage<T>> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: "*/*" },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json() as ComprasPage<T>
    } catch (err) {
      if (attempt === RETRY_DELAYS_MS.length) throw err  // exauriu retries
      await Bun.sleep(RETRY_DELAYS_MS[attempt])
    }
  }
  throw new Error("unreachable")
}

// Generator: entrega uma página por vez (nunca acumula tudo em memória)
async function* fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string | number>
): AsyncGenerator<{ page: ComprasPage<T>; pageNumber: number }> {
  let pagina = 1
  while (true) {
    const qs = new URLSearchParams({ ...params, pagina: String(pagina), tamanhoPagina: "500" })
    const url = `https://dadosabertos.compras.gov.br/${endpoint}?${qs}`
    const page = await fetchPageWithRetry<T>(url)
    yield { page, pageNumber: pagina }
    if (page.paginasRestantes === 0) break
    pagina++
  }
}
```

**Base URL:** `https://dadosabertos.compras.gov.br`

### 4.2 Estratégia de Upsert

- `INSERT ... ON CONFLICT ... DO UPDATE SET ... synced_at = now()`
- **NÃO deletar registros.** Status é apenas atualizado.
- Para tabelas com `BIGSERIAL PK` e unique constraint natural (ex: `natureza_despesa`), o `ON CONFLICT` deve especificar a coluna da **unique constraint**, não o `id`.

### 4.3 Detecção de Desativação

Para `compras_material_item` e `compras_servico_item`, o campo `first_deactivation_detected_at` é imutável após o primeiro preenchimento. No upsert SQL:

```sql
ON CONFLICT (codigo_item) DO UPDATE SET
  status_item                    = EXCLUDED.status_item,
  data_hora_atualizacao          = EXCLUDED.data_hora_atualizacao,
  synced_at                      = now(),
  first_deactivation_detected_at = CASE
    WHEN compras_material_item.first_deactivation_detected_at IS NULL
      AND EXCLUDED.status_item = false
    THEN now()
    ELSE compras_material_item.first_deactivation_detected_at
  END
```

### 4.4 Filtros de Status

Para reduzir volume:
- Endpoints hierárquicos (grupo, classe, PDM, seção, divisão, etc.): buscar com `status*=1`
- Endpoints de **item** (`4_consultarItemMaterial` e `6_consultarItemServico`): **sem filtro de status** — necessário para detectar itens que foram desativados desde a última sync

### 4.5 Ordem de Execução e Isolamento por Step

A ordem respeita as foreign keys. Cada step é executado de forma **independente**: se um step falha, os demais continuam. O erro é registrado no `compras_sync_step.error_message` e o step final da sync é marcado como `partial` em vez de `error`.

**Material (steps 1–7):**
1. `material.grupo`
2. `material.classe`
3. `material.pdm`
4. `material.item` ← mais pesado (~1.000 páginas)
5. `material.natureza_despesa`
6. `material.unidade_fornecimento`
7. `material.caracteristica`

**Serviço (steps 8–15):**
8. `servico.secao`
9. `servico.divisao`
10. `servico.grupo`
11. `servico.classe`
12. `servico.subclasse`
13. `servico.item` ← mais pesado
14. `servico.unidade_medida`
15. `servico.natureza_despesa`

**Tratamento de FK órfã:** se um registro filho referencia um pai que não existe no banco (ex: PDM com `codigo_classe` que não foi sincronizado), o registro deve ser **pulado** com um log de warning no campo `error_message` do step — nunca crashar o step inteiro por isso.

### 4.6 Logging de Progresso por Step

Fluxo do orquestrador para cada step:

```ts
// 1. Criar o step com status 'running'
await supabase.from('compras_sync_step').insert({
  sync_id: syncLogId,
  step_name: 'material.item',
  status: 'running',
  started_at: new Date().toISOString(),
})

// 2. Para cada página (streaming — não acumula em memória):
for await (const { page, pageNumber } of fetchAllPages('modulo-material/4_consultarItemMaterial', {})) {
  await upsertBatch(page.resultado)     // upsert imediato desta página

  // Atualizar progresso no DB a cada página
  await supabase.from('compras_sync_step')
    .update({
      current_page: pageNumber,
      total_pages: page.totalPaginas,   // conhecido após a 1ª chamada
      records_upserted: supabase.rpc('increment', { x: page.resultado.length }), // acumulativo
    })
    .eq('sync_id', syncLogId)
    .eq('step_name', 'material.item')
}

// 3. Marcar step como concluído
await supabase.from('compras_sync_step')
  .update({ status: 'success', finished_at: new Date().toISOString() })
  .eq('sync_id', syncLogId)
  .eq('step_name', 'material.item')

// 4. Incrementar completed_steps no log geral
await supabase.rpc('compras_sync_increment_completed', { p_sync_id: syncLogId })
```

> **Nota de implementação:** Como o Supabase JS não suporta `INCREMENT` nativo, criar uma função SQL auxiliar:
> ```sql
> CREATE FUNCTION sisub.compras_sync_increment_completed(p_sync_id BIGINT)
> RETURNS void LANGUAGE sql AS $$
>   UPDATE sisub.compras_sync_log
>   SET completed_steps = completed_steps + 1,
>       successful_steps = successful_steps + 1
>   WHERE id = p_sync_id;
> $$;
> ```
> Criar equivalente para steps com erro substituindo `successful_steps` por `failed_steps`.

### 4.7 Prevenção de Sync Concorrente

Antes de iniciar qualquer sync (cron ou manual):

```ts
const { count } = await supabase
  .from('compras_sync_log')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'running')
  .gte('started_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()) // < 2h atrás

if (count && count > 0) {
  // Para trigger manual: retornar HTTP 409
  // Para cron: logar aviso e sair silenciosamente
  return
}
```

Uma sync `running` com mais de 2 horas é considerada travada (processo morreu) e não bloqueia novas execuções.

---

## 5. Agendamento (Cron)

```ts
// workers/compras-sync/index.ts
import { runComprasSync } from "./orchestrator.ts"

export function startComprasSyncWorker() {
  // Toda segunda-feira às 03:00 horário de Brasília (UTC-3 → 06:00 UTC)
  Bun.cron("0 6 * * 1", async () => {
    await runComprasSync({ triggeredBy: "cron" })
  })
}
```

> **Nota:** `Bun.cron` disponível a partir do Bun v1.1+. Verificar com `bun --version`.
> Se a versão não suportar, usar `node-cron` como alternativa (já disponível via npm).

---

## 6. Endpoints de Controle (HTTP)

Adicionar em `apps/api/src/api/routes/compras-admin.ts` e integrar ao router principal:

### Trigger Manual
```
POST /api/admin/compras/sync
Header: x-admin-secret: <COMPRAS_ADMIN_SECRET>
```
- Verifica sync concorrente (retorna **409** se já houver uma rodando)
- Cria o registro em `compras_sync_log` + os 15 registros em `compras_sync_step` com status `pending`
- Dispara a sync **em background** (`Promise` não awaited, ou `setImmediate`)
- Retorna **202 Accepted** com o `sync_id` imediatamente

```json
// 202 response
{ "sync_id": 42, "message": "Sync iniciada em background" }
```

### Status da Última Sync
```
GET /api/admin/compras/sync/latest
Header: x-admin-secret: <COMPRAS_ADMIN_SECRET>
```
Retorna o log geral + todos os steps da sync mais recente.

### Status de uma Sync Específica
```
GET /api/admin/compras/sync/:id
Header: x-admin-secret: <COMPRAS_ADMIN_SECRET>
```
Retorna log + steps do `id` informado. Útil para polling de progresso enquanto a sync está `running`.

**Exemplo de resposta:**
```json
{
  "id": 42,
  "status": "running",
  "triggered_by": "manual",
  "started_at": "2026-03-31T06:00:00Z",
  "finished_at": null,
  "completed_steps": 4,
  "total_steps": 15,
  "total_upserted": 18420,
  "total_deactivated": 3,
  "steps": [
    { "step_name": "material.grupo",   "status": "success", "current_page": 1, "total_pages": 1,    "records_upserted": 120 },
    { "step_name": "material.classe",  "status": "success", "current_page": 2, "total_pages": 2,    "records_upserted": 890 },
    { "step_name": "material.pdm",     "status": "success", "current_page": 5, "total_pages": 5,    "records_upserted": 2310 },
    { "step_name": "material.item",    "status": "running", "current_page": 87, "total_pages": 1043, "records_upserted": 15100 },
    { "step_name": "material.natureza_despesa", "status": "pending", "current_page": 0, "total_pages": null, "records_upserted": 0 },
    ...
  ]
}
```

---

## 7. Pesquisa de Preço por Product

O endpoint de pesquisa de preço **requer** `codigoItemCatalogo` (obrigatório):

```
GET https://dadosabertos.compras.gov.br/modulo-pesquisa-preco/1_consultarMaterial
  ?codigoItemCatalogo={codigo_item}
  &pagina=1
  &tamanhoPagina=500
  [&estado=SP]
  [&codigoUasg=...]
```

Para usar no sisub, dado um `product.id`:
1. Buscar `product.catmat_item_codigo` — se `null`, retornar 404 com mensagem clara
2. Chamar o endpoint de pesquisa com `codigoItemCatalogo = catmat_item_codigo`
3. Aplicar filtros opcionais: `estado`, `codigoUasg`, `codigoMunicipio`

**Este endpoint NÃO é sincronizado** — consultado em tempo real sob demanda.

```
GET /api/products/:productId/price-research
  ?estado=SP          (opcional)
  &codigoUasg=...     (opcional)
  &codigoMunicipio=.. (opcional)
  &pagina=1           (padrão 1)
```

---

## 8. Variáveis de Ambiente Necessárias

```ts
// Já existentes:
API_SUPABASE_URL
API_SUPABASE_SERVICE_ROLE_KEY

// Novas (adicionar ao env.ts):
COMPRAS_ADMIN_SECRET  // string — protege os endpoints POST e GET /admin/compras/*
```

A URL base da API Compras é constante no código: `https://dadosabertos.compras.gov.br`

---

## 9. Atualização dos Types Supabase

Após aplicar a migração SQL, regenerar:

```bash
bun run supabase gen types typescript --schema sisub > src/types/database.types.ts
```

---

## 10. Resumo dos Endpoints Consumidos

| Step | Módulo | Endpoint | Filtro de Status | ~Páginas |
|------|--------|----------|-----------------|----------|
| 1 | Material | `1_consultarGrupoMaterial` | `statusGrupo=1` | < 5 |
| 2 | Material | `2_consultarClasseMaterial` | `statusClasse=1` | < 10 |
| 3 | Material | `3_consultarPdmMaterial` | `statusPdm=1` | < 50 |
| 4 | Material | `4_consultarItemMaterial` | *sem filtro* | ~1.000+ |
| 5 | Material | `5_consultarMaterialNaturezaDespesa` | `statusNaturezaDespesa=1` | < 50 |
| 6 | Material | `6_consultarMaterialUnidadeFornecimento` | `statusUnidadeFornecimentoPdm=1` | < 50 |
| 7 | Material | `7_consultarMaterialCaracteristicas` | *sem filtro de status* | ~500+ |
| 8 | Serviço | `1_consultarSecaoServico` | `statusSecao=1` | < 5 |
| 9 | Serviço | `2_consultarDivisaoServico` | `statusDivisao=1` | < 10 |
| 10 | Serviço | `3_consultarGrupoServico` | `statusGrupo=1` | < 20 |
| 11 | Serviço | `4_consultarClasseServico` | `statusGrupo=1` | < 50 |
| 12 | Serviço | `5_consultarSubClasseServico` | `statusSubclasse=1` | < 50 |
| 13 | Serviço | `6_consultarItemServico` | *sem filtro* | ~500+ |
| 14 | Serviço | `7_consultarUndMedidaServico` | `statusUnidadeMedida=1` | < 50 |
| 15 | Serviço | `8_consultarNaturezaDespesaServico` | `statusNaturezaDespesa=1` | < 50 |

---

## 11. Considerações de Performance e Custo

- **Volume estimado:** CATMAT tem ~500k itens. A sync completa pode levar 30–60 min na primeira execução.
- **Upsert streaming:** processar e persistir **cada página imediatamente** — nunca acumular páginas em memória. Isso evita OOM mesmo com centenas de milhares de registros.
- **Delay entre páginas:** aguardar ~100ms entre chamadas à API como cortesia (a API é pública e sem autenticação).
- **Primeira execução:** é lenta e deve ser feita manualmente via `POST /api/admin/compras/sync` fora do horário de uso.
- **Custo Supabase:** as tabelas de catálogo são append/upsert somente. Não geram writes desnecessários (a coluna `synced_at` é atualizada a cada sync, mas isso é inevitável para saber que o registro foi revisitado).
- **Timeout do processo Bun:** garantir que o processo não seja reiniciado por um health-check que assume que `rss > limite` significa que o processo travou — a sync consome memória moderada mas é esperado.

---

## 12. Checklist de Implementação

**Banco de Dados:**
- [ ] Criar migração SQL com todas as tabelas (seções 3.1, 3.2, 3.3)
- [ ] Incluir o `ALTER TABLE product` (seção 3.4)
- [ ] Criar a função SQL `compras_sync_increment_completed` (seção 4.6)
- [ ] Executar migração no Supabase
- [ ] Regenerar `database.types.ts` no `apps/sisub`

**Worker (`apps/api/src/workers/compras-sync/`):**
- [ ] `types.ts` — types dos retornos da API Compras
- [ ] `client.ts` — `fetchAllPages` com retry, backoff e timeout por request
- [ ] `material.ts` — sync dos 7 steps do Módulo Material
- [ ] `servico.ts` — sync dos 8 steps do Módulo Serviço
- [ ] `index.ts` — orquestrador: cria log, itera steps, atualiza status geral, trava de concorrência

**Rotas (`apps/api/src/api/routes/compras-admin.ts`):**
- [ ] `POST /api/admin/compras/sync` — trigger manual com check de concorrência (retorna 409 se já rodando)
- [ ] `GET /api/admin/compras/sync/latest` — estado da última sync com steps
- [ ] `GET /api/admin/compras/sync/:id` — estado de uma sync específica (polling de progresso)
- [ ] `GET /api/products/:productId/price-research` — proxy para pesquisa de preço em tempo real

**Configuração:**
- [ ] Adicionar `COMPRAS_ADMIN_SECRET` ao `env.ts` e ao `.env`
- [ ] Integrar `startComprasSyncWorker()` ao `apps/api/src/index.ts`

**Verificação:**
- [ ] Testar sync manual via endpoint HTTP
- [ ] Confirmar que polling de `GET /api/admin/compras/sync/:id` retorna progresso em tempo real
- [ ] Verificar dados no Supabase após primeira sync
- [ ] Verificar que produto com `catmat_item_codigo` retorna resultados em `/price-research`
